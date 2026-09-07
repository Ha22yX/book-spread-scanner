import assert from 'node:assert/strict';
import sharp from 'sharp/lib/index.js';
import { writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { englishWordCount } from '../lib/reading-context';
import type { Spread, ScanSession } from '../lib/types';
const base = process.env.TEST_URL || 'http://127.0.0.1:3000';
const source = process.argv[2];
if (!source) throw new Error('Supply a book photograph for the live API test.');
async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(base + path, init);
  const data = await r.json();
  assert.ok(r.ok, JSON.stringify(data));
  return data as T;
}
const session = await api<ScanSession>('/api/sessions', { method: 'POST' });
const landscape = await sharp(source)
  .rotate()
  .resize({ width: 1800, height: 1800, fit: 'inside' })
  .jpeg({ quality: 90 })
  .toBuffer();
// A portrait phone-like frame, without rotating printed text or clipping book edges.
const small = await sharp(source)
  .rotate()
  .resize({ width: 1400 })
  .jpeg()
  .toBuffer();
const meta = await sharp(small).metadata();
const extra = 2100 - meta.height!;
const portrait = await sharp(small)
  .extend({
    top: Math.floor(extra / 2),
    bottom: Math.ceil(extra / 2),
    left: 0,
    right: 0,
    background: '#ddd6c8',
  })
  .jpeg({ quality: 90 })
  .toBuffer();
const uploaded: Spread[] = [];
for (const bytes of [landscape, portrait, landscape]) {
  const id = crypto.randomUUID();
  const init = {
    method: 'POST',
    headers: {
      'Content-Type': 'image/jpeg',
      'X-Upload-Id': id,
      'X-Auto-Process': 'true',
    },
    body: new Uint8Array(bytes),
  };
  const start = Date.now();
  const spread = await api<Spread>(`/api/sessions/${session.id}/spreads`, init);
  assert.equal(spread.status, 'queued');
  assert.equal(spread.pipeline?.percent, 5);
  uploaded.push(spread);
  const retry = await api<Spread>(`/api/sessions/${session.id}/spreads`, init);
  assert.equal(retry.id, id);
  console.log(
    `Accepted photo ${spread.sequence} in ${Date.now() - start} ms; no follow-up trigger sent.`,
  );
}
assert.ok(uploaded[1].height > uploaded[1].width);
const bad = await fetch(`${base}/api/processor`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: '{"action":"claim"}',
});
assert.equal(bad.status, 403);
const seen = new Map<string, number>();
const deadline = Date.now() + 240000;
let final: ScanSession | undefined;
while (Date.now() < deadline) {
  const data = await api<ScanSession>(`/api/sessions/${session.id}`);
  for (const spread of data.spreads) {
    const value = spread.pipeline!.percent;
    assert.ok(value >= (seen.get(spread.id) ?? 0));
    if (value !== seen.get(spread.id))
      console.log(
        `Photo ${spread.sequence}: ${spread.pipeline!.stage} ${value}%`,
      );
    seen.set(spread.id, value);
    assert.notEqual(spread.status, 'failed', spread.error);
  }
  if (
    data.spreads.length === 3 &&
    data.spreads.every((s) => s.status === 'annotated')
  ) {
    final = data;
    break;
  }
  await sleep(1500);
}
assert.ok(final, 'Background processing timed out.');
for (const spread of final.spreads) {
  assert.equal(spread.pipeline?.percent, 100);
  assert.ok(spread.annotations!.length <= 2);
  assert.equal(spread.contextSources?.length, spread.sequence - 1);
  for (const note of spread.annotations!) {
    assert.ok(
      englishWordCount(note.comment) >= 10 &&
        englishWordCount(note.comment) <= 25,
    );
    assert.ok(note.anchors.length <= 8);
  }
}
assert.deepEqual(
  final.spreads[2].contextSources?.map((s) => s.sequence),
  [1, 2],
);
writeFileSync(
  'outputs/auto-test-session.json',
  JSON.stringify({ session: session.id, url: `${base}/review/${session.id}` }),
);
console.log(
  `PASS: portrait input, automatic split/OCR/AI, sequential history, idempotent upload, authenticated worker, progress. ${base}/review/${session.id}`,
);
