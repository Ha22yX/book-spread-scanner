import Ocr from '@gutenye/ocr-node';
import { writeFileSync } from 'node:fs';
import type { ScanSession } from '../lib/types';
import type { PaddleLine } from '../lib/paddle-lines';
const session = process.argv[2];
if (!session) throw new Error('Supply local test session');
const base = process.env.TEST_URL || 'http://localhost:3000';
const data = (await (
  await fetch(`${base}/api/sessions/${session}`)
).json()) as ScanSession;
const spread = data.spreads.at(-1)!;
const ocr = await Ocr.create({ onnxOptions: { intraOpNumThreads: 2 } });
for (const side of ['left', 'right'] as const) {
  const bytes = await (
    await fetch(
      `${base}/api/sessions/${session}/spreads/${spread.id}/image/${side}`,
    )
  ).arrayBuffer();
  const path = `outputs/paddle-${side}.jpg`;
  writeFileSync(path, Buffer.from(bytes));
  const lines = (await ocr.detect(path)) as PaddleLine[];
  writeFileSync(`outputs/paddle-${side}.json`, JSON.stringify(lines));
  console.log(
    JSON.stringify({
      side,
      lines: lines.map((l) => ({ text: l.text, score: l.mean, box: l.box })),
    }),
  );
}
