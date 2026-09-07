import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seamFromPoints } from '../lib/vision-seam';
void test('converts visible book endpoints to full-image coordinates', () => {
  const s = seamFromPoints({
    is_open_book: true,
    top: { x: 0.465, y: 0.19 },
    bottom: { x: 0.48, y: 0.88 },
    confidence: 0.8,
  });
  assert.ok(s);
  assert.ok(Math.abs(s.top - 0.461) < 0.001);
  assert.ok(Math.abs(s.bottom - 0.483) < 0.001);
  assert.equal(s.method, 'vision');
});
void test('rejects reversed, weak, out-of-frame, or non-book model results', () => {
  const good = {
    is_open_book: true,
    top: { x: 0.46, y: 0.2 },
    bottom: { x: 0.48, y: 0.88 },
    confidence: 0.9,
  };
  for (const bad of [
    { ...good, is_open_book: false },
    { ...good, confidence: 0.3 },
    { ...good, bottom: { x: 0.48, y: 0.1 } },
    { ...good, top: { x: 1.3, y: 0.2 } },
    { ...good, top: { x: 0.2, y: 0.4 }, bottom: { x: 0.5, y: 0.71 } },
  ])
    assert.equal(seamFromPoints(bad), null);
});
