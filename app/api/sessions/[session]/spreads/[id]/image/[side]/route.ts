import { getSpread, files, ApiError, failure } from '@/lib/server';
import { decodePhoto, saveThumbnail } from '@/lib/images';
import { removeSpreadFiles } from '@/lib/delete-spread';
export async function GET(
  request: Request,
  {
    params,
  }: { params: Promise<{ session: string; id: string; side: string }> },
) {
  try {
    const { session, id, side } = await params;
    const { value } = await getSpread(session, id);
    if (!['original', 'left', 'right', 'thumbnail'].includes(side))
      throw new ApiError(404, '照片不存在。');
    const rev = Number(
      new URL(request.url).searchParams.get('v') || value.revision,
    );
    if (side !== 'thumbnail' && rev !== value.revision)
      throw new ApiError(409, '书页已重新分割，请刷新。');
    const key =
      side === 'original' || side === 'thumbnail'
        ? `${session}/${id}/${side}.jpg`
        : `${session}/${id}/${value.revision}/${side}.jpg`;
    let object = await files().get(key);
    if (!object && side === 'thumbnail') {
      const original = await files().get(`${session}/${id}/original.jpg`);
      if (!original) throw new ApiError(404, '原图不存在。');
      await saveThumbnail(`${session}/${id}`, decodePhoto(await original.arrayBuffer()));
      try { await getSpread(session, id); } catch (error) {
        await removeSpreadFiles(files(), `${session}/${id}/`);
        throw error;
      }
      object = await files().get(key);
    }
    if (!object) throw new ApiError(404, '照片不存在。');
    const unchanged = request.headers.get('if-none-match') === object.httpEtag;
    return new Response(unchanged ? null : object.body, {
      status: unchanged ? 304 : 200,
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'private, no-cache',
        'ETag': object.httpEtag,
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
      },
    });
  } catch (e) {
    return failure(e);
  }
}
