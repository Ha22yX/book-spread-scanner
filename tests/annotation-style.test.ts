import test from 'node:test';
import assert from 'node:assert/strict';
import { validAnnotationComment } from '../lib/annotation-style';
import { ANNOTATION_PROMPT } from '../lib/prompts';
import { englishWordCount } from '../lib/reading-context';
import { annotate } from '../lib/ai';
import type { TextSpan } from '../lib/types';

void test('accepts concise notes and exactly ten words, rejects eleven and empty comments', () => {
  assert.equal(validAnnotationComment('Why hide?'), true);
  assert.equal(validAnnotationComment('The shop now feels like her whole world and family.'), true);
  assert.equal(validAnnotationComment('The shop now feels like her whole world and only family.'), false);
  for (const text of ['', '   ', '...', '她很担心', 'She 很担心']) assert.equal(validAnnotationComment(text), false);
  assert.equal(validAnnotationComment("She's worried about the well-hidden key."), true);
});
void test('all prompt examples obey the limit and correctly state their word count', () => {
  const examples = [...ANNOTATION_PROMPT.matchAll(/: "([^"]+)" \((\d+) words\)/g)];
  assert.equal(examples.length, 3);
  for (const [, text, count] of examples) {
    assert.equal(englishWordCount(text), Number(count));
    assert.equal(validAnnotationComment(text), true);
  }
  assert.ok(!ANNOTATION_PROMPT.includes('10–15'));
  assert.ok(!ANNOTATION_PROMPT.includes('25 words'));
});
void test('generation keeps short English intact but never returns an overlong note', async () => {
  const text = 'The shop was her whole world.';
  const span: TextSpan = {id:'L1',side:'left',text,confidence:98,words:[{text,start:0,end:text.length,box:{x0:1,y0:1,x1:100,y1:20}}]};
  const original = globalThis.fetch;
  let comment = 'Her work becomes her whole world.';
  globalThis.fetch = async () => Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({annotations:[{type:'结构',comment,sentence_ids:['S1']}]})}]}]});
  try {
    assert.equal((await annotate([span],'test-key','gpt-5.6-sol')).annotations[0].comment, comment);
    comment = 'The shop now feels like her whole world and only family.';
    await assert.rejects(annotate([span],'test-key','gpt-5.6-sol'), /校验/);
  } finally { globalThis.fetch = original; }
});
