import { createWorker, PSM } from 'tesseract.js';
import { spansFromPage } from '../lib/ocr';
import type { ScanSession } from '../lib/types';
const session = process.argv[2];
if (!session)
  throw new Error('Usage: npx tsx scripts/check-photo.ts SESSION_ID');
const base = process.env.TEST_URL || 'http://localhost:3000';
const data = (await (
  await fetch(`${base}/api/sessions/${session}`)
).json()) as ScanSession;
const spread = data.spreads.at(-1);
if (!spread) throw new Error('No uploaded photo in session');
const worker = await createWorker('eng', 1, {
  cachePath: 'outputs/tessdata',
  langPath: 'https://tessdata.projectnaptha.com/4.0.0',
});
try {
  for (const side of ['left', 'right'] as const) {
    const image = Buffer.from(
      await (
        await fetch(
          `${base}/api/sessions/${session}/spreads/${spread.id}/image/${side}`,
        )
      ).arrayBuffer(),
    );
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK });
    const { data: page } = await worker.recognize(
      image,
      { rotateAuto: true },
      { blocks: true, text: true },
    );
    const spans = spansFromPage(page, side);
    console.log(
      JSON.stringify({
        side,
        angle: page.rotateRadians,
        lines: spans.length,
        rawText: page.text,
        reconstructed: spans.map((s) => s.text),
      }),
    );
  }
} finally {
  await worker.terminate();
}
