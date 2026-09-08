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
  let calls = 0;
  globalThis.fetch = async () => { calls++; return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({page_numbers:{left:'22',right:'23'},annotations:[{type:'结构',comment,evidence:[{sentence_id:'S1',quote:'The shop'}]},{type:'理解',comment:'Her life feels small.',evidence:[{sentence_id:'S1',quote:'her whole world'}]}]})}]}]}); };
  try {
    assert.equal((await annotate([span],'test-key','gpt-5.6-sol')).annotations[0].comment, comment);
    comment = 'The shop now feels like her whole world and only family.';
    calls = 0;
    await assert.rejects(annotate([span],'test-key','gpt-5.6-sol'), /校验/);
    assert.equal(calls, 2, 'invalid output gets only one repair, never an infinite loop');
  } finally { globalThis.fetch = original; }
});

void test('one repair recovers an overlong note without truncating the answer', async () => {
  const text = 'The shop was her whole world.';
  const span: TextSpan = {id:'L1',side:'left',text,confidence:98,words:[{text,start:0,end:text.length,box:{x0:1,y0:1,x1:100,y1:20}}]};
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    const comment = ++calls === 1 ? 'The shop now feels like her whole world and only family.' : 'Work becomes her whole world.';
    return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({page_numbers:{left:null,right:null},annotations:[{type:'结构',comment,evidence:[{sentence_id:'S1',quote:'The shop'}]},{type:'理解',comment:'Her life feels small.',evidence:[{sentence_id:'S1',quote:'her whole world'}]}]})}]}]});
  };
  try {
    const result = await annotate([span], 'test-key', 'gpt-5.6-sol');
    assert.equal(calls, 2);
    assert.equal(result.annotations[0].comment, 'Work becomes her whole world.');
  } finally { globalThis.fetch = original; }
});
