import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectSeam, splitPixels, type Pixels } from '../lib/split';
function fixture(top = 0.54, bottom = top, gutter = true): Pixels {
  const width = 700,
    height = 500,
    data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const at = (y * width + x) * 4;
      const seam = (top + ((bottom - top) * y) / height) * width;
      let color = 240;
      if (gutter) color -= 180 * Math.exp(-(((x - seam) / 7) ** 2));
      if (
        y % 25 < 3 &&
        y > 35 &&
        y < 460 &&
        Math.abs(x - seam) > 45 &&
        x > 35 &&
        x < 665
      )
        color = 95;
      data[at] = data[at + 1] = data[at + 2] = color;
      data[at + 3] = 255;
    }
  return { width, height, data };
}
void test('finds an off-center gutter instead of blindly halving', () => {
  const s = detectSeam(fixture(0.58));
  assert.equal(s.method, 'gutter');
  assert.ok(Math.abs(s.top - 0.58) < 0.025);
  assert.ok(Math.abs(s.bottom - 0.58) < 0.025);
});
void test('tracks a slanted gutter top to bottom', () => {
  const s = detectSeam(fixture(0.48, 0.54));
  assert.ok(Math.abs(s.top - 0.48) < 0.025);
  assert.ok(Math.abs(s.bottom - 0.54) < 0.025);
});
void test('marks center fallback as uncertain on featureless image', () => {
  const f = fixture();
  f.data.fill(245);
  const s = detectSeam(f);
  assert.equal(s.method, 'center');
  assert.equal(s.confidence, 0);
});
void test('preserves left-before-right and samples both boundaries', () => {
  const image = fixture(0.5);
  for (let y = 0; y < image.height; y++)
    for (let x = 0; x < image.width; x++) {
      const i = (y * image.width + x) * 4;
      image.data[i] = x < 350 ? 220 : 0;
      image.data[i + 2] = x < 350 ? 0 : 220;
    }
  const left = splitPixels(image, { top: 0.5, bottom: 0.5 }, 'left'),
    right = splitPixels(image, { top: 0.5, bottom: 0.5 }, 'right');
  assert.equal(left.width + right.width, image.width);
  assert.equal(left.data[0], 220);
  assert.equal(right.data[2], 220);
  assert.equal(left.height, image.height);
});
void test('rejects degenerate and nonfinite seams', () => {
  for (const top of [0, 1, NaN, Infinity])
    assert.throws(() => splitPixels(fixture(), { top, bottom: 0.5 }, 'left'));
});
