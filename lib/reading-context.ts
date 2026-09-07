import type { Spread, Side, TextSpan } from './types';
import { buildSentences } from './sentences';
export type ReadingContext = {
  spreadId: string;
  revision: number;
  sequence: number;
  lines: { side: Side; text: string }[];
};
export function previousSpreads(spreads: Spread[], current: Spread) {
  return spreads
    .filter((s) => s.sequence < current.sequence)
    .sort((a, b) => b.sequence - a.sequence)
    .slice(0, 2)
    .reverse();
}
export function readingInput(spans: TextSpan[], history: ReadingContext[]) {
  return {
    previous_photos: [...history]
      .sort((a, b) => a.sequence - b.sequence)
      .map((h) => ({
        sequence: h.sequence,
        left: h.lines.filter((l) => l.side === 'left').map((l) => l.text),
        right: h.lines.filter((l) => l.side === 'right').map((l) => l.text),
      })),
    current_photo: buildSentences(spans)
      .filter((s) => s.anchors.length <= 6 && s.text.length <= 550)
      .map((s) => ({
        sentence_id: s.id,
        pages: s.sides,
        text: s.text,
      })),
  };
}
export function englishWordCount(text: string) {
  return text.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g)?.length ?? 0;
}
