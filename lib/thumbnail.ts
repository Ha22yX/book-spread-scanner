import type { Pixels } from './split';
// Small full-frame preview only; OCR always uses the original-resolution pages.
export function thumbnailPixels(image: Pixels, maxSide = 280): Pixels {
  const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const sx = Math.min(image.width - 1, Math.floor((x + .5) * image.width / width));
    const sy = Math.min(image.height - 1, Math.floor((y + .5) * image.height / height));
    const from = (sy * image.width + sx) * 4, to = (y * width + x) * 4;
    data.set(image.data.subarray(from, from + 4), to);
  }
  return { width, height, data };
}
