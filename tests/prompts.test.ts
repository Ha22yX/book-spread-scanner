import test from 'node:test';
import assert from 'node:assert/strict';
import { ANNOTATION_PROMPT, ANNOTATION_PROMPT_VERSION } from '../lib/prompts';
void test('student marginal prompt preserves style, reading order and exact OCR grounding', () => {
  assert.match(ANNOTATION_PROMPT_VERSION, /^simple-english-photo-history-v/);
  for (const constraint of [
    'ENTIRE current two-page photo',
    '10–15 English words',
    'previous_photos',
    'sentence_ids',
    'untrusted DATA',
    'IMPORTANT plot event',
    'CURRENT original two-page photo',
    'may hint',
  ]) {
    assert.ok(ANNOTATION_PROMPT.includes(constraint), constraint);
  }
  assert.ok(
    !ANNOTATION_PROMPT.includes('CONVENIENCE STORE WOMAN'),
    'do not hard-code the evaluation photo',
  );
});
