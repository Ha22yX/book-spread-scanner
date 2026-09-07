import { checkOrigin, requireSession, uuid, db, files, json, failure, ApiError } from '@/lib/server';
import { DELETE_SPREAD_SQL, removeSpreadFiles } from '@/lib/delete-spread';

export async function DELETE(request: Request, { params }: { params: Promise<{session: string; id: string}> }) {
  try {
    checkOrigin(request);
    const { session, id } = await params;
    await requireSession(session);
    if (!uuid(id)) throw new ApiError(404, '拍摄记录不存在。');
    const row = await db().prepare('SELECT id FROM spreads WHERE id=? AND session_id=?').bind(id, session).first();
    if (!row) throw new ApiError(404, '拍摄记录不存在。');
    // Invalidate every in-flight revision before deleting image bytes. Retry is idempotent.
    await db().prepare(DELETE_SPREAD_SQL).bind(id, session).run();
    await removeSpreadFiles(files(), `${session}/${id}/`);
    return json({ deleted: id });
  } catch (error) { return failure(error); }
}
