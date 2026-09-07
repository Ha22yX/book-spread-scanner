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
import { env } from 'cloudflare:workers';
import { detectVisionSeam } from '@/lib/vision-seam';
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
      .prepare('SELECT data,status FROM spreads WHERE id=? AND session_id=?')
      .bind(id, session)
      .first<{ data: string; status: string }>();
    if (existing?.status === 'deleted') throw new ApiError(410, '这次拍摄已删除，请重新拍摄。');
    if (existing) return json(JSON.parse(existing.data));
    const image = decodePhoto(buffer.buffer);
    const automatic = !!env.PROCESSOR_TOKEN;
    if(request.headers.get('x-auto-process')==='true' && !automatic)
      throw new ApiError(503,'自动处理后台尚未配置，请在电脑端启动局域网服务。');
    let seam = detectSeam(image);
    const next = await db()
      .prepare(
        'UPDATE scan_sessions SET next_sequence=next_sequence+1 WHERE id=? AND next_sequence<100 RETURNING next_sequence',
      )
      .bind(session)
      .first<{ next_sequence: number }>();
    if (!next)
      throw new ApiError(400, '每个会话最多支持 100 次拍摄，请创建新会话。');
    if (!automatic && seam.confidence < 0.4 && env.OPENAI_API_KEY) {
      seam =
        (await detectVisionSeam(
          image,
          env.OPENAI_API_KEY,
          env.OPENAI_MODEL || 'gpt-5.6-sol',
        )) ?? seam;
    }
    const prefix = `${session}/${id}/1`;
    await files().put(`${session}/${id}/original.jpg`, buffer, {
      httpMetadata: { contentType: 'image/jpeg' },
    });
    const dims = automatic ? {left:{width:Math.floor(image.width/2),height:image.height},right:{width:Math.ceil(image.width/2),height:image.height}} : await saveSplit(prefix, image, seam);
    const spread: Spread = {
      id,
      sequence: next.next_sequence,
      created_at: Date.now(),
      revision: 1,
      seam,
      width: image.width,
      height: image.height,
      ...dims,
      status: automatic ? 'queued' : 'ready',
      ...(automatic ? {pipeline:{stage:'queued' as const,percent:5,updatedAt:Date.now(),splitReady:false,attempts:0}} : {}),
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
        spread.status,
        JSON.stringify(spread),
      )
      .run();
    return json(spread, 201);
  } catch (e) {
    return failure(e);
  }
}
