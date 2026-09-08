import type { ReadingSentence } from './sentences';
import type { TextSpan } from './types';
/** Adjacent sentences can share a physical OCR line. Keep one exact range per line. */
export function selectedAnchors(ids: string[], sentences: ReadingSentence[], spans: TextSpan[]) {
  const ranges = new Map<string, { start: number; end: number; text: string }>();
  for (const id of new Set(ids)) {
    const sentence = sentences.find((s) => s.id === id);
    if (!sentence) throw new Error('Invalid sentence');
    for (const anchor of sentence.anchors) {
      const text = spans.find((s) => s.id === anchor.span_id)?.text;
      if (!text) throw new Error('Missing OCR line');
      const start = text.indexOf(anchor.quote);
      if (start < 0 || text.indexOf(anchor.quote, start + 1) >= 0) throw new Error('Ambiguous anchor');
      const old = ranges.get(anchor.span_id);
      ranges.set(anchor.span_id, { text, start: Math.min(old?.start ?? start, start), end: Math.max(old?.end ?? 0, start + anchor.quote.length) });
    }
  }
  if (ranges.size > 8) throw new Error('Highlight too broad');
  return [...ranges].map(([span_id, range]) => ({ span_id, quote: range.text.slice(range.start, range.end) }));
}
