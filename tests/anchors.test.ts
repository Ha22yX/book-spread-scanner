import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveAnnotations, validateSpans } from '../lib/anchors';
import type { TextSpan } from '../lib/types';
const span = (id: string, side: 'left' | 'right', text: string): TextSpan => ({
  id,
  side,
  text,
  confidence: 98,
  words: Array.from(text).map((text, i) => ({
    text,
    start: i,
    end: i + 1,
    box: { x0: i * 10, y0: 10, x1: (i + 1) * 10, y1: 25 },
  })),
});
void test('cross-page comment retains two independent coordinate systems', () => {
  const spans = [
    span('L-1', 'left', '阅读使人'),
    span('R-1', 'right', '看到更大的世界。'),
  ];
  const notes = resolveAnnotations(
    {
      annotations: [
        {
          comment: '这是跨页的一句话。',
          type: '理解',
          anchors: [
            { span_id: 'L-1', quote: '使人' },
            { span_id: 'R-1', quote: '看到更大的世界' },
          ],
        },
      ],
    },
    spans,
  );
  assert.deepEqual(
    notes[0].anchors.map((x) => x.side),
    ['left', 'right'],
  );
  assert.equal(notes[0].anchors[0].boxes[0].x0, 20);
  assert.equal(notes[0].anchors[1].boxes[0].x0, 0);
});
void test('rejects invented or ambiguous quotes rather than misplacing highlights', () => {
  for (const quote of ['不存在', '阅读'])
    assert.throws(() =>
      resolveAnnotations(
        {
          annotations: [
            {
              type: '理解',
              comment: 'test',
              anchors: [{ span_id: 'L-1', quote }],
            },
          ],
        },
        [span('L-1', 'left', '阅读阅读')],
      ),
    );
});
void test('rejects malformed OCR geometry and duplicate IDs', () => {
  const s = span('L-1', 'left', '阅读');
  assert.throws(() =>
    validateSpans([s], {
      left: { width: 5, height: 5 },
      right: { width: 10, height: 10 },
    }),
  );
  assert.throws(() =>
    validateSpans([s, s], {
      left: { width: 100, height: 100 },
      right: { width: 100, height: 100 },
    }),
  );
});
