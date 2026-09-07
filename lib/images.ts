import jpeg from 'jpeg-js';
import { ApiError, files } from './server';
import { splitPixels, type Pixels } from './split';
import type { Seam } from './types';
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
  const dims = {} as Record<
    'left' | 'right',
    { width: number; height: number }
  >;
  for (const side of ['left', 'right'] as const) {
    const p = splitPixels(image, seam, side);
    const encoded = jpeg.encode(p, 88);
    await files().put(`${prefix}/${side}.jpg`, new Uint8Array(encoded.data), {
      httpMetadata: { contentType: 'image/jpeg' },
    });
    dims[side] = { width: p.width, height: p.height };
  }
  return dims;
}
