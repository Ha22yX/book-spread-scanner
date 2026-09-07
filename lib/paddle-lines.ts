import type { Dimensions, Side, TextSpan } from './types';
export const OCR_ENGINE = 'ppocr-v4-lines-v1';
export type PaddleLine = { text: string; mean: number; box?: number[][] };
/** PP-OCR expands input to multiples of 32. Map its detected quadrilaterals back. */
export function paddleLinesToSpans(
  lines: PaddleLine[],
  side: Side,
  dimensions: Dimensions,
): TextSpan[] {
  const sx = dimensions.width / (Math.ceil(dimensions.width / 32) * 32),
    sy = dimensions.height / (Math.ceil(dimensions.height / 32) * 32);
  const ordered = lines
    .filter(
      (l) =>
        l.mean >= 0.72 &&
        l.box?.length === 4 &&
        (l.text.match(/[\p{L}]/gu)?.length ?? 0) >= 3,
    )
    .sort(
      (a, b) =>
        a.box!.reduce((s, p) => s + p[1], 0) -
        b.box!.reduce((s, p) => s + p[1], 0),
    );
  const spans = ordered
    .map((line, i): TextSpan => {
      const polygon = line.box!.map((p) => ({
        x: Math.max(0, Math.min(dimensions.width, p[0] * sx)),
        y: Math.max(0, Math.min(dimensions.height, p[1] * sy)),
      }));
      const box = {
        x0: Math.min(...polygon.map((p) => p.x)),
        x1: Math.max(...polygon.map((p) => p.x)),
        y0: Math.min(...polygon.map((p) => p.y)),
        y1: Math.max(...polygon.map((p) => p.y)),
      };
      const text = line.text.trim();
      return {
        id: `${side === 'left' ? 'L' : 'R'}-${i + 1}`,
        side,
        text,
        confidence: line.mean * 100,
        polygon,
        words: [{ text, start: 0, end: text.length, box }],
      };
    })
    .filter(
      (s) =>
        s.words[0].box.x1 > s.words[0].box.x0 &&
        s.words[0].box.y1 > s.words[0].box.y0,
    );
  const body = spans.filter((s) => s.text.length > 25);
  const median = (values: number[]) =>
    values.sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;
  const left = median(body.map((s) => s.polygon![0].x));
  const height = median(
    body.map((s) =>
      Math.hypot(
        s.polygon![3].x - s.polygon![0].x,
        s.polygon![3].y - s.polygon![0].y,
      ),
    ),
  );
  return spans.map((s, i) => ({
    ...s,
    paragraphStart: i > 0 && s.polygon![0].x > left + height * 1.25,
  }));
}
