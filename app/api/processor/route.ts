import { env } from 'cloudflare:workers';
import { z } from 'zod';
import {
  db,
  files,
  getSpread,
  readJson,
  json,
  failure,
  ApiError,
} from '@/lib/server';
import { decodePhoto, saveSplit } from '@/lib/images';
import { detectSeam } from '@/lib/split';
import { detectVisionSeam } from '@/lib/vision-seam';
import {
  spansSchema,
  validateSpans,
  aiSchema,
  resolveAnnotations,
} from '@/lib/anchors';
import { OCR_ENGINE } from '@/lib/paddle-lines';
import { stagePercent } from '@/lib/pipeline';
import { ANNOTATION_PROMPT_VERSION } from '@/lib/prompts';
import { validAnnotationComment } from '@/lib/annotation-style';
import type { Spread } from '@/lib/types';
import { PRESENCE_KEY } from '@/lib/processor-health';

// Only the local background processor knows this token; never expose it to browsers.
export async function POST(request: Request) {
  try {
    if (
      !env.PROCESSOR_TOKEN ||
      request.headers.get('authorization') !== `Bearer ${env.PROCESSOR_TOKEN}`
    )
      throw new ApiError(403, '无权访问后台任务。');
    const input = await readJson(request, 2_000_000);
    if (input.action === 'presence') {
      await files().put(PRESENCE_KEY, '{}', { httpMetadata: { contentType: 'application/json' } });
      return json({ ok: true });
    }
    if (input.action === 'claim') {
      const now = Date.now();
      const candidate = await db()
        .prepare(`SELECT s.id,s.session_id,s.data,s.revision FROM spreads s
        WHERE (s.status='queued' OR (s.status='processing' AND json_extract(s.data,'$.pipeline.updatedAt')<?))
        AND NOT EXISTS (SELECT 1 FROM spreads p WHERE p.session_id=s.session_id AND p.sequence<s.sequence AND p.status IN ('queued','processing'))
        ORDER BY s.created_at,s.sequence LIMIT 1`)
        .bind(now - 300_000)
        .first<{
          id: string;
          session_id: string;
          data: string;
          revision: number;
        }>();
      if (!candidate) return json({ job: null });
      const value = JSON.parse(candidate.data) as Spread;
      value.status = 'processing';
      value.pipeline = {
        stage: 'splitting',
        percent: 15,
        updatedAt: now,
        splitReady: value.pipeline?.splitReady ?? false,
        attempts: (value.pipeline?.attempts ?? 0) + 1,
      };
      const result = await db()
        .prepare(`UPDATE spreads SET status='processing',job_started=?,data=? WHERE id=? AND revision=?
        AND (status='queued' OR (status='processing' AND json_extract(data,'$.pipeline.updatedAt')<?))`)
        .bind(
          now,
          JSON.stringify(value),
          candidate.id,
          candidate.revision,
          now - 300_000,
        )
        .run();
      return json({
        job: result.meta.changes
          ? { session: candidate.session_id, spread: value, lease: now }
          : null,
      });
    }
    const { session, id, lease } = z
      .object({
        session: z.uuid(),
        id: z.uuid(),
        lease: z.number().int().positive(),
      })
      .parse(input);
    const { value, row } = await getSpread(session, id);
    if (row.status !== 'processing' || row.job_started !== lease)
      throw new ApiError(409, '任务已由其他处理器接管。');
    const save = async () => {
      value.pipeline!.updatedAt = Date.now();
      const result = await db()
        .prepare(
          'UPDATE spreads SET status=?,data=?,job_started=? WHERE id=? AND session_id=? AND revision=? AND job_started=?',
        )
        .bind(
          value.status,
          JSON.stringify(value),
          value.status === 'processing' ? lease : null,
          id,
          session,
          value.revision,
          lease,
        )
        .run();
      if (!result.meta.changes) throw new ApiError(409, '任务版本已变化。');
      return json(value);
    };
    if (input.action === 'heartbeat') {
      await db()
        .prepare(
          "UPDATE spreads SET data=json_set(data,'$.pipeline.updatedAt',?) WHERE id=? AND session_id=? AND job_started=?",
        )
        .bind(Date.now(), id, session, lease)
        .run();
      return json({ ok: true });
    }
    if (input.action === 'split') {
      const original = await files().get(`${session}/${id}/original.jpg`);
      if (!original) throw new ApiError(404, '原图不存在。');
      const image = decodePhoto(await original.arrayBuffer());
      let seam =
        value.seam.method === 'manual' ? value.seam : detectSeam(image);
      if (seam.confidence < 0.4 && env.OPENAI_API_KEY)
        seam =
          (await detectVisionSeam(
            image,
            env.OPENAI_API_KEY,
            env.OPENAI_MODEL || 'gpt-5.6-sol',
          )) ?? seam;
      Object.assign(
        value,
        await saveSplit(`${session}/${id}/${value.revision}`, image, seam),
        { seam, width: image.width, height: image.height },
      );
      value.pipeline!.splitReady = true;
      value.pipeline!.stage = 'ocr_left';
      value.pipeline!.percent = 35;
      return save();
    }
    if (input.action === 'progress') {
      const stage = z
        .enum(['ocr_left', 'ocr_right', 'context', 'annotating'])
        .parse(input.stage);
      value.pipeline!.stage = stage;
      value.pipeline!.percent = stagePercent[stage];
      if (input.spans) {
        const spans = spansSchema.parse(input.spans);
        validateSpans(spans, value);
        value.spans = spans;
        value.ocrEngine = OCR_ENGINE;
      }
      return save();
    }
    if (input.action === 'complete') {
      if (!value.spans?.length) throw new ApiError(400, '没有已定位的原文。');
      value.annotations = resolveAnnotations(
        aiSchema.parse({ annotations: input.annotations }),
        value.spans,
      );
      value.model = z.string().max(100).parse(input.model);
      if (
        value.annotations.length > 2 ||
        value.annotations.some((n) => !validAnnotationComment(n.comment))
      )
        throw new ApiError(400, '批注数量、语言或长度校验失败。');
      value.contextSources = z
        .array(
          z.object({
            spreadId: z.uuid(),
            revision: z.number().int().positive(),
            sequence: z.number().int().positive(),
          }),
        )
        .max(2)
        .parse(input.contextSources);
      const prior = await db()
        .prepare(
          "SELECT id,revision,sequence FROM spreads WHERE session_id=? AND sequence<? AND status!='deleted' ORDER BY sequence DESC LIMIT 2",
        )
        .bind(session, value.sequence)
        .all<{ id: string; revision: number; sequence: number }>();
      const expected = prior.results.reverse();
      if (
        expected.length !== value.contextSources.length ||
        expected.some(
          (p, i) =>
            p.id !== value.contextSources![i].spreadId ||
            p.revision !== value.contextSources![i].revision ||
            p.sequence !== value.contextSources![i].sequence,
        )
      )
        throw new ApiError(409, '前文已发生变化，请重新生成批注。');
      value.promptVersion = ANNOTATION_PROMPT_VERSION;
      value.annotationWarning = input.omitted
        ? '部分批注未通过校验，已隐藏。'
        : undefined;
      value.status = 'annotated';
      value.error = undefined;
      value.pipeline!.stage = 'complete';
      value.pipeline!.percent = 100;
      return save();
    }
    if (input.action === 'fail') {
      value.status = 'failed';
      value.error = z.string().min(1).max(500).parse(input.error);
      value.pipeline!.stage = 'failed';
      return save();
    }
    throw new ApiError(400, '无效任务操作。');
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('Processor validation failed', error.issues.map((issue) => ({ path: issue.path.join('.'), code: issue.code })));
      return json({ error: '后台提交的数据未通过校验，原图已保留，请重试。' }, 400);
    }
    return failure(error);
  }
}
