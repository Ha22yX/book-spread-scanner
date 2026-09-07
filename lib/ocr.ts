import type { Page } from 'tesseract.js';
import type { Side, TextSpan, Spread } from './types';
import { imageUrl } from './client';
export function spansFromPage(page: Page, side: Side): TextSpan[] {
  const spans: TextSpan[] = [];
  for (const block of page.blocks ?? [])
    for (const paragraph of block.paragraphs)
      for (const line of paragraph.lines) {
        let text = '';
        const words: TextSpan['words'] = [];
        for (const word of line.words) {
          if (
            text &&
            /[A-Za-z0-9]$/.test(text) &&
            /^[A-Za-z0-9]/.test(word.text)
          )
            text += ' ';
          const units = word.symbols?.length
            ? word.symbols
            : [{ text: word.text, bbox: word.bbox }];
          for (const unit of units) {
            if (!unit.text.trim()) continue;
            const start = text.length;
            text += unit.text;
            words.push({
              text: unit.text,
              start,
              end: text.length,
              box: { ...unit.bbox },
            });
          }
        }
        if (text && words.length)
          spans.push({
            id: `${side === 'left' ? 'L' : 'R'}-${spans.length + 1}`,
            side,
            text,
            words,
            confidence: line.confidence,
          });
      }
  return spans;
}
export async function recognizeSpread(
  session: string,
  spread: Spread,
  progress: (text: string) => void,
) {
  const { createWorker, PSM } = await import('tesseract.js');
  let stage = '加载中文识别工具';
  progress(stage + '（首次加载可能较慢）');
  const worker = await createWorker(['chi_sim', 'eng'], 1, {
    workerPath: '/ocr/worker.min.js',
    corePath: '/ocr/core',
    langPath: 'https://tessdata.projectnaptha.com/4.0.0',
    logger: (m) => {
      if (m.status === 'recognizing text')
        progress(`${stage} ${Math.round(m.progress * 100)}%`);
    },
  });
  try {
    await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO });
    const spans: TextSpan[] = [];
    for (const side of ['left', 'right'] as const) {
      stage = side === 'left' ? '识别左页' : '识别右页';
      progress(stage);
      const res = await fetch(imageUrl(session, spread, side));
      if (!res.ok) throw new Error('书页已更新或无法读取，请刷新。');
      const { data } = await worker.recognize(
        await res.blob(),
        {},
        { blocks: true, text: true },
      );
      spans.push(...spansFromPage(data, side));
    }
    if (!spans.length)
      throw new Error('没有识别到文字，请检查照片清晰度或重新拍摄。');
    return spans;
  } finally {
    await worker.terminate();
  }
}
