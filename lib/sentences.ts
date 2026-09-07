import type { Side, TextSpan } from './types';
export type ReadingSentence = {
  id: string;
  text: string;
  sides: Side[];
  anchors: { span_id: string; quote: string }[];
};
/** Join reading text without losing the source-character map used for highlights. */
export function buildSentences(input: TextSpan[]): ReadingSentence[] {
  const spans = [...input].sort((a, b) =>
    a.side === b.side ? 0 : a.side === 'left' ? -1 : 1,
  );
  const refs: ({ span: TextSpan; offset: number } | null)[] = [];
  let text = '';
  const seen = new Set<Side>();
  for (const span of spans) {
    const first = !seen.has(span.side);
    seen.add(span.side);
    if (
      first &&
      /^[A-Z\s\d.,:'’-]+$/.test(span.text) &&
      span.text.replace(/[^A-Z]/g, '').length >= 8
    )
      continue;
    if (text) {
      if (/[A-Za-z]-$/.test(text) && /^[a-z]/.test(span.text)) {
        text = text.slice(0, -1);
        refs.pop();
      } else {
        const joiner = span.paragraphStart ? '\n\n' : ' ';
        text += joiner;
        refs.push(...Array.from(joiner, () => null));
      }
    }
    for (let offset = 0; offset < span.text.length; offset++) {
      text += span.text[offset];
      refs.push({ span, offset });
      if (
        /[.!?。！？]/.test(span.text[offset]) &&
        /[A-Za-z“"\p{Script=Han}]/u.test(span.text[offset + 1] ?? '')
      ) {
        text += ' ';
        refs.push(null);
      }
    }
  }
  const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' });
  let paragraphOffset = 0;
  const parts = text.split('\n\n').flatMap((paragraph) => {
    const base = paragraphOffset;
    paragraphOffset += paragraph.length + 2;
    return [...segmenter.segment(paragraph)].map((p) => ({
      segment: p.segment,
      index: p.index + base,
    }));
  });
  const groups: { start: number; end: number }[] = [];
  for (const part of parts) {
    const prior = groups.at(-1);
    if (
      prior &&
      /\b(?:Mr|Mrs|Ms|Dr|Prof|St)\.\s*$/i.test(
        text.slice(prior.start, prior.end),
      )
    )
      prior.end = part.index + part.segment.length;
    else
      groups.push({ start: part.index, end: part.index + part.segment.length });
  }
  return groups
    .flatMap(({ start, end }) => {
      const ranges = new Map<
        string,
        { span: TextSpan; start: number; end: number }
      >();
      for (const ref of refs.slice(start, end))
        if (ref) {
          const range = ranges.get(ref.span.id);
          if (range) range.end = ref.offset + 1;
          else
            ranges.set(ref.span.id, {
              span: ref.span,
              start: ref.offset,
              end: ref.offset + 1,
            });
        }
      const anchors = [...ranges.values()]
        .map((r) => {
          let quote = r.span.text.slice(r.start, r.end).trim();
          // A repeated fragment cannot be uniquely grounded; retain its whole source line.
          if (r.span.text.indexOf(quote) !== r.span.text.lastIndexOf(quote))
            quote = r.span.text;
          return { span_id: r.span.id, quote };
        })
        .filter((a) => a.quote.length);
      const sentence = text.slice(start, end).trim();
      return anchors.length && /[\p{L}\p{N}]/u.test(sentence)
        ? [
            {
              id: '',
              text: sentence,
              sides: [...new Set([...ranges.values()].map((r) => r.span.side))],
              anchors,
            },
          ]
        : [];
    })
    .map((s, i) => ({ ...s, id: `S${i + 1}` }));
}
