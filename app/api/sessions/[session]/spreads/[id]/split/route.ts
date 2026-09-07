import { z } from 'zod';
import {
  checkOrigin,
  getSpread,
  readJson,
  files,
  db,
  json,
  failure,
  ApiError,
} from '@/lib/server';
import { decodePhoto, saveSplit } from '@/lib/images';
const schema = z.object({
  top: z.number().min(0.15).max(0.85),
  bottom: z.number().min(0.15).max(0.85),
  revision: z.number().int().positive(),
});
export async function POST(
  request: Request,
  { params }: { params: Promise<{ session: string; id: string }> },
) {
  let lock: { session: string; id: string; revision: number } | null = null;
  try {
    checkOrigin(request);
    const { session, id } = await params;
    const input = schema.safeParse(await readJson(request, 1000));
    if (!input.success) throw new ApiError(400, '分割位置无效。');
    const { value } = await getSpread(session, id);
    if (input.data.revision !== value.revision)
      throw new ApiError(409, '另一台设备已修改书页，请刷新。');
    const locked = await db()
      .prepare(
        'UPDATE spreads SET job_started=? WHERE id=? AND session_id=? AND revision=? AND (job_started IS NULL OR job_started<?)',
      )
      .bind(Date.now(), id, session, value.revision, Date.now() - 180000)
      .run();
    if (!locked.meta.changes)
      throw new ApiError(409, '该书页正在处理中，请稍后重试。');
    lock = { session, id, revision: value.revision };
    const original = await files().get(`${session}/${id}/original.jpg`);
    if (!original) throw new ApiError(404, '原图不存在。');
    const image = decodePhoto(await original.arrayBuffer());
    const seam = { ...input.data, confidence: 1, method: 'manual' as const };
    const revision = value.revision + 1;
    const dims = await saveSplit(`${session}/${id}/${revision}`, image, seam);
    const updated = {
      ...value,
      ...dims,
      seam,
      revision,
      status: 'ready',
      spans: [],
      annotations: [],
      error: undefined,
    };
    await db()
      .prepare(
        'UPDATE spreads SET revision=?,status=?,job_started=NULL,data=? WHERE id=? AND session_id=? AND revision=?',
      )
      .bind(
        revision,
        'ready',
        JSON.stringify(updated),
        id,
        session,
        value.revision,
      )
      .run();
    lock = null;
    return json(updated);
  } catch (e) {
    if (lock)
      await db()
        .prepare(
          'UPDATE spreads SET job_started=NULL WHERE id=? AND session_id=? AND revision=?',
        )
        .bind(lock.id, lock.session, lock.revision)
        .run();
    return failure(e);
  }
}
