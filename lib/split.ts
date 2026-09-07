import type { Seam } from './types';
export type Pixels = {
  width: number;
  height: number;
  data: Uint8Array | Uint8ClampedArray;
};
const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));

/** Detect a near-vertical gutter using continuous local contrast across rows.
 * Coordinates are fractions of the oriented, resized JPEG, never screen pixels.
 * Low contrast deliberately yields an explicitly uncertain center split.
 */
export function detectSeam(image: Pixels): Seam {
  const { width: w, height: h, data } = image;
  if (w < 80 || h < 80) throw new Error('照片尺寸过小，请重新拍摄。');
  const luminance = (x: number, y: number) => {
    const i =
      (clamp(Math.round(y), 0, h - 1) * w + clamp(Math.round(x), 0, w - 1)) * 4;
    return data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
  };
  const bands: number[][] = [];
  for (let band = 0; band < 3; band++) {
    const scores: number[] = [];
    for (let col = 0; col <= 120; col++) {
      const x = w * (0.28 + (col * 0.44) / 120),
        offsets = [0.025, 0.045, 0.065];
      let dark = 0,
        bright = 0,
        darkRows = 0,
        brightRows = 0;
      for (let row = 0; row < 28; row++) {
        const y = h * (0.12 + ((band + row / 28) * 0.76) / 3);
        const mid =
          (luminance(x - w * 0.003, y) +
            luminance(x, y) +
            luminance(x + w * 0.003, y)) /
          3;
        const around =
          offsets.reduce(
            (s, d) =>
              s + (luminance(x - w * d, y) + luminance(x + w * d, y)) / 2,
            0,
          ) / offsets.length;
        const contrast = around - mid;
        dark += clamp(contrast, -25, 80);
        bright += clamp(-contrast, -25, 60);
        if (contrast > 9) darkRows++;
        if (contrast < -9) brightRows++;
      }
      scores.push(
        Math.max(
          (dark / 28) * (darkRows / 28) ** 2,
          (bright / 28) * (brightRows / 28) ** 3 * 0.75,
        ) -
          Math.abs(x / w - 0.5) * 8,
      );
    }
    bands.push(scores);
  }
  let best = -Infinity,
    bestTop = 60,
    bestBottom = 60;
  for (let a = 0; a <= 120; a++)
    for (let b = Math.max(0, a - 20); b <= Math.min(120, a + 20); b++) {
      let score = 0;
      for (let band = 0; band < 3; band++)
        score += bands[band][Math.round(a + ((b - a) * (band + 0.5)) / 3)];
      score = score / 3 - Math.abs(a - b) * 0.07;
      if (score > best) {
        best = score;
        bestTop = a;
        bestBottom = b;
      }
    }
  if (best < 5)
    return { top: 0.5, bottom: 0.5, confidence: 0, method: 'center' };
  return {
    top: 0.28 + (bestTop * 0.44) / 120,
    bottom: 0.28 + (bestBottom * 0.44) / 120,
    confidence: clamp(best / 48, 0, 1),
    method: 'gutter',
  };
}

/** Preserve both sides, including their margins. Row-wise trapezoid resampling
 * straightens a slanted seam; it is not curved-page dewarping. */
export function splitPixels(
  image: Pixels,
  seam: Pick<Seam, 'top' | 'bottom'>,
  side: 'left' | 'right',
): Pixels {
  if (
    !Number.isFinite(seam.top) ||
    !Number.isFinite(seam.bottom) ||
    seam.top < 0.15 ||
    seam.top > 0.85 ||
    seam.bottom < 0.15 ||
    seam.bottom > 0.85
  )
    throw new Error('分割线必须位于照片宽度的 15%–85% 之间。');
  const { width: w, height: h, data } = image;
  const portion = (seam.top + seam.bottom) / 2;
  const outW = Math.max(
    1,
    Math.round(w * (side === 'left' ? portion : 1 - portion)),
  );
  const out = new Uint8Array(outW * h * 4);
  for (let y = 0; y < h; y++) {
    const boundary = clamp(
      Math.round(
        w * (seam.top + ((seam.bottom - seam.top) * y) / Math.max(1, h - 1)),
      ),
      1,
      w - 1,
    );
    const start = side === 'left' ? 0 : boundary,
      end = side === 'left' ? boundary : w;
    for (let x = 0; x < outW; x++) {
      const sx = clamp(
        start + ((x + 0.5) * (end - start)) / outW - 0.5,
        start,
        end - 1,
      );
      const x0 = Math.floor(sx),
        x1 = Math.min(end - 1, x0 + 1),
        t = sx - x0;
      const dst = (y * outW + x) * 4,
        i0 = (y * w + x0) * 4,
        i1 = (y * w + x1) * 4;
      for (let c = 0; c < 3; c++)
        out[dst + c] = Math.round(data[i0 + c] * (1 - t) + data[i1 + c] * t);
      out[dst + 3] = 255;
    }
  }
  return { width: outW, height: h, data: out };
}
