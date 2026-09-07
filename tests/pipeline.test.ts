import { test } from 'node:test';
import assert from 'node:assert/strict';
import { queueSpread, isProcessing, stagePercent } from '../lib/pipeline';
import type { Spread } from '../lib/types';
void test('requeue clears failed notes but preserves original geometry and revision', () => {
  const old = {
    id: 'a',
    status: 'failed',
    revision: 3,
    annotations: [{ id: 'old' }],
    error: 'timeout',
    left: { width: 100, height: 200 },
  } as Spread;
  const queued = queueSpread(old);
  assert.equal(queued.revision, 3);
  assert.equal(queued.left, old.left);
  assert.deepEqual(queued.annotations, []);
  assert.equal(queued.error, undefined);
  assert.ok(isProcessing(queued));
  assert.ok(!isProcessing(old));
  assert.equal(queued.pipeline?.splitReady, true);
});
void test('stage progress reaches 100 only after completion', () => {
  const values = [
    'queued',
    'splitting',
    'ocr_left',
    'ocr_right',
    'context',
    'annotating',
    'complete',
  ].map((s) => stagePercent[s as keyof typeof stagePercent]);
  assert.deepEqual(
    [...values].sort((a, b) => a - b),
    values,
  );
  assert.equal(values.at(-1), 100);
  assert.ok(values.slice(0, -1).every((v) => v < 100));
});
