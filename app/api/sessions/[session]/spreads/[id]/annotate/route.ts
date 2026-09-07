import { env } from 'cloudflare:workers';
import { z } from 'zod';
import {
  checkOrigin,
  getSpread,
  readJson,
  db,
  json,
  failure,
  ApiError,
} from '@/lib/server';
import { spansSchema, validateSpans } from '@/lib/anchors';
import { annotate, ModelError } from '@/lib/ai';
import type { Spread } from '@/lib/types';
const schema = z.object({
  revision: z.number().int().positive(),
  spans: spansSchema,
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
    const input = schema.safeParse(await readJson(request));
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
    const annotations = await annotate(spans, env.OPENAI_API_KEY, model);
    const updated: Spread = {
      ...value,
      model,
      annotations,
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
