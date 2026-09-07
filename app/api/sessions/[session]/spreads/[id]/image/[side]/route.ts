import { getSpread, files, ApiError, failure } from '@/lib/server';
export async function GET(
  request: Request,
  {
    params,
  }: { params: Promise<{ session: string; id: string; side: string }> },
) {
  try {
    const { session, id, side } = await params;
    const { value } = await getSpread(session, id);
    if (!['original', 'left', 'right'].includes(side))
      throw new ApiError(404, '照片不存在。');
    const rev = Number(
      new URL(request.url).searchParams.get('v') || value.revision,
    );
    if (rev !== value.revision)
      throw new ApiError(409, '书页已重新分割，请刷新。');
    const key =
      side === 'original'
        ? `${session}/${id}/original.jpg`
        : `${session}/${id}/${value.revision}/${side}.jpg`;
    const object = await files().get(key);
    if (!object) throw new ApiError(404, '照片不存在。');
    return new Response(object.body, {
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
      },
    });
  } catch (e) {
    return failure(e);
  }
}
