import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import jpeg from 'jpeg-js';
import Ocr from '@gutenye/ocr-node';
import { OCR_ENGINE, paddleLinesToSpans } from '../lib/paddle-lines';
import type { Spread, ScanSession, TextSpan } from '../lib/types';
const base = process.env.TEST_URL || 'http://localhost:3000';
async function call<T>(path: string, init?: RequestInit) {
  const r = await fetch(base + path, init);
  const text = await r.text();
  assert.ok(r.ok, `${r.status}: ${text}`);
  return JSON.parse(text) as T;
}
const session = await call<ScanSession>('/api/sessions', { method: 'POST' });
const body = readFileSync('outputs/test-spread.jpg');
const id = crypto.randomUUID();
const spread = await call<Spread>(`/api/sessions/${session.id}/spreads`, {
  method: 'POST',
  headers: { 'Content-Type': 'image/jpeg', 'X-Upload-Id': id },
  body,
});
assert.equal(spread.sequence, 1);
assert.ok(Math.abs(spread.seam.top - 825 / 1600) < 0.04);
const duplicate = await call<Spread>(`/api/sessions/${session.id}/spreads`, {
  method: 'POST',
  headers: { 'Content-Type': 'image/jpeg', 'X-Upload-Id': id },
  body,
});
assert.equal(duplicate.id, spread.id);
const read = await call<ScanSession>(`/api/sessions/${session.id}`);
assert.equal(read.spreads.length, 1);
const other = await call<ScanSession>('/api/sessions', { method: 'POST' });
const forbidden = await fetch(
  `${base}/api/sessions/${other.id}/spreads/${id}/image/left`,
);
assert.equal(forbidden.status, 404);
for (const side of ['left', 'right']) {
  const r = await fetch(
    `${base}/api/sessions/${session.id}/spreads/${id}/image/${side}`,
  );
  assert.equal(r.status, 200);
  const buffer = Buffer.from(await r.arrayBuffer());
  writeFileSync(`outputs/test-${side}.jpg`, buffer);
  const decoded = jpeg.decode(buffer);
  assert.equal(decoded.height, 1100);
  assert.ok(decoded.width > 500);
}
const invalid = await fetch(
  `${base}/api/sessions/${session.id}/spreads/${id}/split`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ top: 0, bottom: 0.5, revision: 1 }),
  },
);
assert.equal(invalid.status, 400);
const revised = await call<Spread>(
  `/api/sessions/${session.id}/spreads/${id}/split`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ top: 0.515, bottom: 0.515, revision: 1 }),
  },
);
assert.equal(revised.revision, 2);
assert.deepEqual(revised.annotations, []);
const stale = await fetch(
  `${base}/api/sessions/${session.id}/spreads/${id}/split`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ top: 0.51, bottom: 0.51, revision: 1 }),
  },
);
assert.equal(stale.status, 409);
console.log(
  'PASS: upload, auto split, idempotent retry, independent pages, session isolation, manual split, stale-version rejection',
);
if (process.argv.includes('--ocr')) {
  for (const side of ['left', 'right']) {
    const response = await fetch(
      `${base}/api/sessions/${session.id}/spreads/${id}/image/${side}?v=2`,
    );
    assert.equal(response.status, 200);
    writeFileSync(
      `outputs/test-${side}.jpg`,
      Buffer.from(await response.arrayBuffer()),
    );
  }
  const ocr = await Ocr.create({ onnxOptions: { intraOpNumThreads: 2 } });
  const spans: TextSpan[] = [];
  for (const side of ['left', 'right'] as const) {
    const lines = await ocr.detect(`outputs/test-${side}.jpg`);
    spans.push(...paddleLinesToSpans(lines, side, revised[side]));
  }
  assert.ok(spans.some((s) => s.side === 'left' && s.text.includes('阅读')));
  assert.ok(spans.some((s) => s.side === 'right' && s.text.includes('理解')));
  console.log(`PASS: real Chinese OCR, ${spans.length} anchored text lines`);
  if (process.argv.includes('--ai')) {
    const result = await call<Spread>(
      `/api/sessions/${session.id}/spreads/${id}/annotate`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revision: 2, spans, ocrEngine: OCR_ENGINE }),
      },
    );
    assert.equal(result.status, 'annotated');
    assert.ok(result.annotations && result.annotations.length <= 2);
    assert.ok(
      result.annotations.every((n) =>
        n.anchors.every((a) => a.boxes.length > 0),
      ),
    );
    console.log(
      `PASS: live ${result.model}, ${result.annotations.length} verified annotations`,
    );
  }
}
writeFileSync(
  'outputs/integration-session.json',
  JSON.stringify({
    session: session.id,
    spread: id,
    url: `${base}/review/${session.id}`,
  }),
);
console.log(`Review test fixture: ${base}/review/${session.id}`);
