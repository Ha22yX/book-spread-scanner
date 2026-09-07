import {
  checkOrigin,
  requireSession,
  db,
  files,
  json,
  failure,
  ApiError,
  uuid,
} from '@/lib/server';
import { decodePhoto, saveSplit } from '@/lib/images';
import { detectSeam } from '@/lib/split';
import type { Spread } from '@/lib/types';
export async function POST(
  request: Request,
  { params }: { params: Promise<{ session: string }> },
) {
  try {
    checkOrigin(request);
    const { session } = await params;
    await requireSession(session);
    if (Number(request.headers.get('content-length')) > 9_000_000)
      throw new ApiError(413, '照片过大，请压缩后重试。');
    const reader = request.body?.getReader();
    if (!reader) throw new ApiError(400, '缺少照片。');
    let size = 0;
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 9_000_000) {
        await reader.cancel();
        throw new ApiError(413, '照片过大。');
      }
      chunks.push(value);
    }
    const buffer = new Uint8Array(size);
    let pos = 0;
    for (const c of chunks) {
      buffer.set(c, pos);
      pos += c.length;
    }
    const id = request.headers.get('x-upload-id') || crypto.randomUUID();
    if (!uuid(id)) throw new ApiError(400, '上传编号无效。');
    const existing = await db()
      .prepare('SELECT data FROM spreads WHERE id=? AND session_id=?')
      .bind(id, session)
      .first<{ data: string }>();
    if (existing) return json(JSON.parse(existing.data));
    const image = decodePhoto(buffer.buffer),
      seam = detectSeam(image);
    const next = await db()
      .prepare(
        'UPDATE scan_sessions SET next_sequence=next_sequence+1 WHERE id=? AND next_sequence<100 RETURNING next_sequence',
      )
      .bind(session)
      .first<{ next_sequence: number }>();
    if (!next)
      throw new ApiError(400, '每个会话最多支持 100 次拍摄，请创建新会话。');
    const prefix = `${session}/${id}/1`;
    await files().put(`${session}/${id}/original.jpg`, buffer, {
      httpMetadata: { contentType: 'image/jpeg' },
    });
    const dims = await saveSplit(prefix, image, seam);
    const spread: Spread = {
      id,
      sequence: next.next_sequence,
      created_at: Date.now(),
      revision: 1,
      seam,
      width: image.width,
      height: image.height,
      ...dims,
      status: 'ready',
    };
    await db()
      .prepare(
        'INSERT INTO spreads (id,session_id,sequence,created_at,revision,status,data) VALUES (?,?,?,?,1,?,?)',
      )
      .bind(
        id,
        session,
        spread.sequence,
        spread.created_at,
        'ready',
        JSON.stringify(spread),
      )
      .run();
    return json(spread, 201);
  } catch (e) {
    return failure(e);
  }
}
