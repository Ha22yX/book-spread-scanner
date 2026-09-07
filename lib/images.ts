import jpeg from 'jpeg-js';
import { ApiError, files, db } from './server';
import { removeSpreadFiles } from './delete-spread';
import { splitPixels, type Pixels } from './split';
import type { Seam } from './types';
import { thumbnailPixels } from './thumbnail';
export async function saveThumbnail(prefix: string, image: Pixels) {
  const encoded = jpeg.encode(thumbnailPixels(image), 72);
  await files().put(`${prefix}/thumbnail.jpg`, new Uint8Array(encoded.data), { httpMetadata: {contentType:'image/jpeg'} });
}
export function decodePhoto(buffer: ArrayBuffer): Pixels {
  try {
    const decoded = jpeg.decode(new Uint8Array(buffer), {
      useTArray: true,
      formatAsRGBA: true,
      maxResolutionInMP: 4,
      maxMemoryUsageInMB: 80,
    });
    if (decoded.width < 300 || decoded.height < 300) throw new Error('small');
    return decoded;
  } catch {
    throw new ApiError(
      400,
      '请上传不超过 400 万像素、至少 300×300 的有效 JPEG 照片。',
    );
  }
}
export async function saveSplit(prefix: string, image: Pixels, seam: Seam) {
  const [session, id] = prefix.split('/');
  const checkDeleted = async () => {
    const row = await db().prepare('SELECT status FROM spreads WHERE id=? AND session_id=?').bind(id, session).first<{status: string}>();
    if (row?.status === 'deleted') {
      await removeSpreadFiles(files(), `${session}/${id}/`);
      throw new ApiError(410, '这次拍摄已删除。');
    }
  };
  const dims = {} as Record<
    'left' | 'right',
    { width: number; height: number }
  >;
  for (const side of ['left', 'right'] as const) {
    await checkDeleted();
    const p = splitPixels(image, seam, side);
    const encoded = jpeg.encode(p, 88);
    await files().put(`${prefix}/${side}.jpg`, new Uint8Array(encoded.data), {
      httpMetadata: { contentType: 'image/jpeg' },
    });
    // A delete can race the awaited R2 write; clean up those late bytes too.
    await checkDeleted();
    dims[side] = { width: p.width, height: p.height };
  }
  return dims;
}
