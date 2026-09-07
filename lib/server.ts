import { env } from 'cloudflare:workers';
import type { Spread } from './types';
export const db = () => env.DB;
export const files = () => env.FILES;
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export const uuid = (v: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v,
  );
export async function requireSession(id: string) {
  if (!uuid(id)) throw new ApiError(404, '扫描会话不存在。');
  const row = await db()
    .prepare('SELECT id, created_at FROM scan_sessions WHERE id=?')
    .bind(id)
    .first<{ id: string; created_at: number }>();
  if (!row) throw new ApiError(404, '扫描会话不存在，请在电脑端重新创建。');
  return row;
}
export async function getSpread(session: string, id: string) {
  await requireSession(session);
  if (!uuid(id)) throw new ApiError(404, '书页不存在。');
  const row = await db()
    .prepare(
      'SELECT data,revision,status,job_started FROM spreads WHERE id=? AND session_id=?',
    )
    .bind(id, session)
    .first<{
      data: string;
      revision: number;
      status: Spread['status'];
      job_started: number | null;
    }>();
  if (!row) throw new ApiError(404, '书页不存在。');
  const value = JSON.parse(row.data) as Spread;
  value.revision = row.revision;
  value.status = row.status;
  return { value, row };
}
export function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' },
  });
}
export function failure(error: unknown) {
  if (error instanceof ApiError)
    return json({ error: error.message }, error.status);
  console.error(
    'Request failed:',
    error instanceof Error ? error.name : 'UnknownError',
  );
  return json({ error: '处理失败，请重试。' }, 500);
}
export function checkOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin)
    throw new ApiError(403, '不允许跨站提交。');
}
export async function readJson(request: Request, max = 600_000) {
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, '缺少请求内容。');
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > max) {
      await reader.cancel();
      throw new ApiError(413, '提交内容过大。');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.length;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new ApiError(400, '请求格式错误。');
  }
}
