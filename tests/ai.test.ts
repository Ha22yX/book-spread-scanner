import { test } from 'node:test';
import assert from 'node:assert/strict';
import { annotate } from '../lib/ai';
import type { TextSpan } from '../lib/types';
import { buildSentences } from '../lib/sentences';
import { selectedAnchors } from '../lib/selected-anchors';
void test('Responses request combines current photo, previous original text and selectable current sentences', async () => {
  const original=globalThis.fetch;
  const span:TextSpan={id:'L1',side:'left',text:'The shop was her whole world.',confidence:98,words:[{text:'The shop was her whole world.',start:0,end:28,box:{x0:10,y0:10,x1:290,y1:30}}]};
  let captured:Record<string,unknown>={};
  globalThis.fetch=async (_url,init)=>{
    captured=JSON.parse(init?.body as string) as Record<string,unknown>;
    return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({page_numbers:{left:'22',right:'23'},annotations:[{type:'结构',comment:'The shop shapes her whole life.',evidence:[{sentence_id:'S1',quote:'The shop'}]},{type:'理解',comment:'Her life feels small.',evidence:[{sentence_id:'S1',quote:'her whole world'}]}]})}]}]});
  };
  try {
    const result=await annotate([span],'test-key','gpt-5.6-sol',[{spreadId:'previous',sequence:1,revision:1,lines:[{side:'left',text:'Earlier she worked all day.'}]}],'data:image/jpeg;base64,test');
    assert.equal(result.annotations.length,2);
    assert.deepEqual(result.pageNumbers,{left:'22',right:'23'});
    assert.deepEqual(result.annotations[0].pages,['22']);
    assert.equal(result.annotations[0].anchors[0].span_id,'L1');
    assert.equal(captured.store,false);
    const body=JSON.stringify(captured);
    assert.ok(body.includes('input_image'));
    assert.ok(body.includes('Earlier she worked all day.'));
    assert.ok(body.includes('current_photo'));
  } finally {globalThis.fetch=original;}
});
void test('overlapping sentences merge their shared OCR line into eight valid anchors', async () => {
  const parts = ['She worked', 'every day', 'inside the', 'little shop', 'without rest. She felt', 'like the', 'shop was', 'her whole world.'];
  const spans: TextSpan[] = parts.map((text, i) => ({ id:`L-${i}`, side:'left', text, confidence:98,
    words:[{text,start:0,end:text.length,box:{x0:10,y0:10+i*25,x1:290,y1:30+i*25}}] }));
  const sentences = buildSentences(spans);
  assert.equal(sentences.length, 2);
  assert.equal(sentences.flatMap((s) => s.anchors).length, 9);
  const anchors=selectedAnchors(sentences.map(s=>s.id),sentences,spans);
  assert.equal(anchors.length,8);
  assert.equal(anchors[4].quote,'without rest. She felt');
});
