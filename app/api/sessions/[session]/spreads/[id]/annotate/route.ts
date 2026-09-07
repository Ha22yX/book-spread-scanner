import { env } from 'cloudflare:workers';
import { z } from 'zod';
import {
  checkOrigin,
  getSpread,
  readJson,
  db,
  files,
  json,
  failure,
  ApiError,
} from '@/lib/server';
import { spansSchema, validateSpans } from '@/lib/anchors';
import { annotate, ModelError } from '@/lib/ai';
import { ANNOTATION_PROMPT_VERSION } from '@/lib/prompts';
import type { Spread } from '@/lib/types';
import type { ReadingContext } from '@/lib/reading-context';
import { OCR_ENGINE } from '@/lib/paddle-lines';
const schema = z.object({
  revision: z.number().int().positive(),
  spans: spansSchema,
  ocrEngine:z.literal(OCR_ENGINE).optional(),
  history: z
    .array(
      z.object({
        spreadId: z.uuid(),
        revision: z.number().int().positive(),
        sequence: z.number().int().positive(),
        lines: z
          .array(
            z.object({
              side: z.enum(['left', 'right']),
              text: z.string().min(1).max(1500),
            }),
          )
          .max(400),
      }),
    )
    .max(2)
    .default([]),
});
export async function POST(
  request: Request,
  { params }: { params: Promise<{ session: string; id: string }> },
) {
  let active: { session: string; value: Spread } | null = null;
  try {
    checkOrigin(request);
    if (!env.OPENAI_API_KEY)
      throw new ApiError(503, '尚未配置服务端 OpenAI API Key。');
    const { session, id } = await params,
      { value } = await getSpread(session, id);
    const input = schema.safeParse(await readJson(request, 1_500_000));
    if (!input.success)
      throw new ApiError(400, '文字识别结果无效，请重新识别。');
    if (input.data.revision !== value.revision)
      throw new ApiError(409, '分割结果已更新，请刷新后重新识别。');
    const spans = input.data.spans.sort((a, b) =>
      a.side === b.side ? 0 : a.side === 'left' ? -1 : 1,
    );
    try {
      validateSpans(spans, value);
    } catch (e) {
      throw new ApiError(400, (e as Error).message);
    }
    const priorRows = await db()
      .prepare(
        'SELECT data,revision FROM spreads WHERE session_id=? AND sequence<? ORDER BY sequence DESC LIMIT 2',
      )
      .bind(session, value.sequence)
      .all<{ data: string; revision: number }>();
    const prior = priorRows.results
      .map((r) => ({ ...(JSON.parse(r.data) as Spread), revision: r.revision }))
      .reverse();
    const history: ReadingContext[] = [];
    const provided = new Map(input.data.history.map((h) => [h.spreadId, h]));
    if (
      provided.size !== input.data.history.length ||
      input.data.history.some((h) => !prior.some((p) => p.id === h.spreadId))
    )
      throw new ApiError(400, '只能关联本会话的前两张照片。');
    for (const p of prior) {
      const sent = provided.get(p.id);
      if (
        sent &&
        (sent.revision !== p.revision || sent.sequence !== p.sequence)
      )
        throw new ApiError(409, '前文照片已更新，请重新生成。');
      const lines = p.ocrEngine === OCR_ENGINE && p.spans?.length
        ? p.spans.map((s) => ({ side: s.side, text: s.text }))
        : sent?.lines;
      if (!lines?.length)
        throw new ApiError(400, '缺少前文识别结果，请在网页中重新生成。');
      if (lines.reduce((n, l) => n + l.text.length, 0) > 35000)
        throw new ApiError(400, '前文文字过多。');
      history.push({
        spreadId: p.id,
        revision: p.revision,
        sequence: p.sequence,
        lines,
      });
    }
    const now = Date.now();
    const lock = await db()
      .prepare(
        "UPDATE spreads SET status='annotating',job_started=? WHERE id=? AND session_id=? AND revision=? AND (job_started IS NULL OR job_started<?)",
      )
      .bind(now, id, session, value.revision, now - 180000)
      .run();
    if (!lock.meta.changes) throw new ApiError(409, '批注正在生成，请稍候。');
    active = { session, value };
    value.spans = spans;
    const model = env.OPENAI_MODEL || 'gpt-5.6-sol';
    const photo = await files().get(`${session}/${id}/original.jpg`);
    if (!photo) throw new ApiError(404, '原始照片不存在，无法联合理解。');
    const photoDataUrl =
      'data:image/jpeg;base64,' +
      Buffer.from(await photo.arrayBuffer()).toString('base64');
    const { annotations, omitted } = await annotate(
      spans,
      env.OPENAI_API_KEY,
      model,
      history,
      photoDataUrl,
    );
    const updated: Spread = {
      ...value,
      model,
      promptVersion: ANNOTATION_PROMPT_VERSION,
      ocrEngine:input.data.ocrEngine,
      contextSources: history.map(({ spreadId, revision, sequence }) => ({
        spreadId,
        revision,
        sequence,
      })),
      annotations,
      annotationWarning: omitted
        ? `${omitted} 条批注未通过定位或长度校验，已隐藏。可重新生成。`
        : undefined,
      status: 'annotated',
      error: undefined,
    };
    await db()
      .prepare(
        'UPDATE spreads SET status=?,job_started=NULL,data=? WHERE id=? AND session_id=? AND revision=?',
      )
      .bind('annotated', JSON.stringify(updated), id, session, value.revision)
      .run();
    active = null;
    return json(updated);
  } catch (e) {
    if (active) {
      const { session, value } = active;
      const error =
        e instanceof ModelError ? e.message : '批注生成失败，请重试。';
      await db()
        .prepare(
          'UPDATE spreads SET status=?,job_started=NULL,data=? WHERE id=? AND session_id=? AND revision=?',
        )
        .bind(
          'failed',
          JSON.stringify({ ...value, status: 'failed', error }),
          value.id,
          session,
          value.revision,
        )
        .run();
      if (e instanceof ModelError) return json({ error }, 502);
    }
    return failure(e);
  }
}
