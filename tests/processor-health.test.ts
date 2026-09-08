import { test } from 'node:test';
import assert from 'node:assert/strict';
import { processorHealth } from '../lib/processor-health';
// Shared with the native Node supervisor without a TS loader.
import { shouldRestart } from '../scripts/supervisor-policy.mjs';

void test('missing, stale and invalid future liveness cannot report online', () => {
  assert.equal(processorHealth(null, 100000), 'offline');
  assert.equal(processorHealth(10000, 100000), 'offline');
  assert.equal(processorHealth(10001, 100000), 'online');
  assert.equal(processorHealth(110000, 100000), 'offline');
});
void test('watchdog handles stalled native OCR and heartbeat-alive jobs that never finish', () => {
  assert.equal(shouldRestart({ now: 130000, lastPulse: 1, jobStarted: 0 }), true);
  assert.equal(shouldRestart({ now: 800000, lastPulse: 799999, jobStarted: 1 }), true);
  assert.equal(shouldRestart({ now: 800000, lastPulse: 799999, jobStarted: 700000 }), false);
  assert.equal(shouldRestart({ now: 800000, lastPulse: 799999, jobStarted: 0 }), false);
});
