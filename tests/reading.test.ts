import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSentences } from '../lib/sentences';
import {
  previousSpreads,
  readingInput,
  englishWordCount,
} from '../lib/reading-context';
import { resolveAnnotations } from '../lib/anchors';
import type { Spread, TextSpan } from '../lib/types';
const line = (id: string, side: 'left' | 'right', text: string): TextSpan => ({
  id,
  side,
  text,
  confidence: 95,
  words: Array.from(text).map((char, i) => ({
    text: char,
    start: i,
    end: i + 1,
    box: { x0: i * 10, y0: 10, x1: i * 10 + 10, y1: 30 },
  })),
});
void test('rejects giant OCR sentences instead of highlighting an entire page', () => {
  const spans = Array.from({ length: 12 }, (_, i) =>
    line(`L${i}`, 'left', 'several words without punctuation'),
  );
  assert.equal(buildSentences(spans).length, 1);
  assert.equal(readingInput(spans, []).current_photo.length, 0);
});
void test('joins line/page breaks, skips running heads, keeps exact independent anchors', () => {
  const spans = [
    line('L1', 'left', 'A VERY LONG TITLE'),
    line('L2', 'left', 'He thought the store was'),
    line('R1', 'right', 'ANOTHER BOOK TITLE'),
    line('R2', 'right', 'his whole world. Then he left.'),
  ];
  const sentences = buildSentences(spans);
  assert.equal(sentences[0].text, 'He thought the store was his whole world.');
  assert.deepEqual(sentences[0].sides, ['left', 'right']);
  const notes = resolveAnnotations(
    {
      annotations: [
        { type: '理解', comment: 'test', anchors: sentences[0].anchors },
      ],
    },
    spans,
  );
  assert.equal(notes[0].anchors.length, 2);
  assert.equal(sentences[1].text, 'Then he left.');
});
void test('repairs end-of-line hyphens while retaining original OCR coordinate references', () => {
  const spans = [
    line('L1', 'left', 'The quiet shop was a con-'),
    line('L2', 'left', 'stant part of her life.'),
  ];
  assert.equal(
    buildSentences(spans)[0].text,
    'The quiet shop was a constant part of her life.',
  );
  assert.equal(
    buildSentences(spans)[0].anchors[0].quote,
    'The quiet shop was a con',
  );
});
void test('uses only two earlier photos in chronological order, never later/current photos', () => {
  const photos = [5, 1, 4, 2, 3].map(
    (sequence) => ({ sequence, id: `photo${sequence}` }) as Spread,
  );
  assert.deepEqual(
    previousSpreads(photos, photos[2]).map((p) => p.sequence),
    [2, 3],
  );
  assert.deepEqual(previousSpreads(photos, photos[1]), []);
});
void test('history has no selectable sentence IDs and keeps left-before-right order', () => {
  const input = readingInput(
    [
      line('R1', 'right', 'Today she came back.'),
      line('L1', 'left', 'She left yesterday.'),
    ],
    [
      {
        spreadId: 'prior',
        revision: 1,
        sequence: 2,
        lines: [
          { side: 'right', text: 'Last night.' },
          { side: 'left', text: 'Yesterday.' },
        ],
      },
    ],
  );
  assert.equal(input.current_photo[0].text, 'She left yesterday.');
  assert.deepEqual(input.previous_photos[0].left, ['Yesterday.']);
  assert.ok(!JSON.stringify(input.previous_photos).includes('sentence_id'));
  assert.equal(
    englishWordCount(
      "He can't leave the well-known shop. It feels like his home.",
    ),
    11,
  );
});
