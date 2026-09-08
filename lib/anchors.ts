import type { TextSpan, Annotation, Dimensions } from './types';
import { z } from 'zod';
import { quoteGeometry } from './highlight-geometry';
const boxSchema = z.object({
  x0: z.number().nonnegative(),
  y0: z.number().nonnegative(),
  x1: z.number().positive(),
  y1: z.number().positive(),
});
export const spansSchema = z
  .array(
    z.object({
      id: z.string().min(1).max(80),
      side: z.enum(['left', 'right']),
      text: z.string().min(1).max(1500),
      confidence: z.number().min(0).max(100),
      polygon: z
        .array(
          z.object({
            x: z.number().nonnegative(),
            y: z.number().nonnegative(),
          }),
        )
        .length(4)
        .optional(),
      paragraphStart: z.boolean().optional(),
      words: z
        .array(
          z.object({
            text: z.string().min(1).max(200),
            start: z.number().int().nonnegative(),
            end: z.number().int().positive(),
            box: boxSchema,
          }),
        )
        .min(1)
        .max(1500),
    }),
  )
  .min(1)
  .max(400);
export function validateSpans(
  spans: TextSpan[],
  dimensions: Record<'left' | 'right', Dimensions>,
) {
  const ids = new Set<string>();
  let total = 0;
  for (const span of spans) {
    if (ids.has(span.id)) throw new Error('文字编号重复。');
    ids.add(span.id);
    total += span.text.length;
    if (
      span.polygon?.some(
        (p) =>
          p.x > dimensions[span.side].width ||
          p.y > dimensions[span.side].height,
      )
    )
      throw new Error('文字多边形超出图片。');
    let end = 0;
    for (const word of span.words) {
      const b = word.box,
        d = dimensions[span.side];
      if (
        word.start < end ||
        word.end <= word.start ||
        span.text.slice(word.start, word.end) !== word.text ||
        b.x1 <= b.x0 ||
        b.y1 <= b.y0 ||
        b.x1 > d.width ||
        b.y1 > d.height
      )
        throw new Error('文字坐标或引用范围无效。');
      end = word.end;
    }
  }
  if (total > 35000) throw new Error('当前双页文字过多。');
}
export const aiSchema = z.object({
  annotations: z
    .array(
      z.object({
        comment: z.string().min(1).max(1400),
        type: z.enum(['理解', '关键词', '结构', '思考']),
        anchors: z
          .array(
            z.object({
              span_id: z.string(),
              quote: z.string().min(1).max(1500),
              start: z.number().int().nonnegative().optional(),
              end: z.number().int().positive().optional(),
            }),
          )
          .min(1)
          .max(8),
      }),
    )
    .max(12),
});
export function resolveAnnotations(
  raw: z.infer<typeof aiSchema>,
  spans: TextSpan[],
): Annotation[] {
  const index = new Map(spans.map((s) => [s.id, s]));
  return raw.annotations.map((note, i) => ({
    id: `note-${i + 1}`,
    comment: note.comment,
    type: note.type,
    anchors: note.anchors.map((a) => {
      const span = index.get(a.span_id);
      if (!span) throw new Error('AI 引用了不存在的文字。');
      const start = a.start ?? span.text.indexOf(a.quote);
      const end = a.end ?? start + a.quote.length;
      if (start < 0 || end <= start || end > span.text.length || span.text.slice(start,end) !== a.quote || (a.start === undefined && span.text.indexOf(a.quote, start + 1) >= 0))
        throw new Error('AI 引用无法唯一定位。');
      return { ...a, start, end, side: span.side, ...quoteGeometry(span,start,end) };
    }),
  }));
}

/** Reject a whole note if any anchor is invalid; never silently drop its evidence. */
export function resolveVerifiedAnnotations(
  raw: z.infer<typeof aiSchema>,
  spans: TextSpan[],
) {
  const annotations: Annotation[] = [];
  let omitted = 0;
  for (const note of raw.annotations) {
    try {
      const resolved = resolveAnnotations({ annotations: [note] }, spans)[0];
      annotations.push({ ...resolved, id: `note-${annotations.length + 1}` });
    } catch {
      omitted++;
    }
  }
  if (raw.annotations.length && !annotations.length)
    throw new Error('没有通过定位校验的批注');
  return { annotations, omitted };
}
