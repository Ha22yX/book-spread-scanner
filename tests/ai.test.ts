import { test } from 'node:test';
import assert from 'node:assert/strict';
import { annotate } from '../lib/ai';
import type { TextSpan } from '../lib/types';
import { buildSentences } from '../lib/sentences';
void test('Responses request combines current photo, previous original text and selectable current sentences', async () => {
  const original=globalThis.fetch;
  const span:TextSpan={id:'L1',side:'left',text:'The shop was her whole world.',confidence:98,words:[{text:'The shop was her whole world.',start:0,end:28,box:{x0:10,y0:10,x1:290,y1:30}}]};
  let captured:Record<string,unknown>={};
  globalThis.fetch=async (_url,init)=>{
    captured=JSON.parse(init?.body as string) as Record<string,unknown>;
    return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({annotations:[{type:'结构',comment:'This metaphor shows how much the shop controls her daily life.',sentence_ids:['S1']}]})}]}]});
  };
  try {
    const result=await annotate([span],'test-key','gpt-5.6-sol',[{spreadId:'previous',sequence:1,revision:1,lines:[{side:'left',text:'Earlier she worked all day.'}]}],'data:image/jpeg;base64,test');
    assert.equal(result.annotations.length,1);
    assert.equal(result.annotations[0].anchors[0].span_id,'L1');
    assert.equal(captured.store,false);
    const body=JSON.stringify(captured);
    assert.ok(body.includes('input_image'));
    assert.ok(body.includes('Earlier she worked all day.'));
    assert.ok(body.includes('current_photo'));
  } finally {globalThis.fetch=original;}
});
void test('overlapping sentences cannot send nine anchors through an eight-anchor server contract', async () => {
  const parts = ['She worked', 'every day', 'inside the', 'little shop', 'without rest. She felt', 'like the', 'shop was', 'her whole world.'];
  const spans: TextSpan[] = parts.map((text, i) => ({ id:`L-${i}`, side:'left', text, confidence:98,
    words:[{text,start:0,end:text.length,box:{x0:10,y0:10+i*25,x1:290,y1:30+i*25}}] }));
  const sentences = buildSentences(spans);
  assert.equal(sentences.length, 2);
  assert.equal(sentences.flatMap((s) => s.anchors).length, 9);
  const original = globalThis.fetch;
  globalThis.fetch = async () => Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({annotations:[{type:'结构',comment:'This metaphor shows how much the shop controls her daily life.',sentence_ids:sentences.map((s) => s.id)}]})}]}]});
  try {
    await assert.rejects(annotate(spans,'test-key','gpt-5.6-sol'), /校验/);
  } finally { globalThis.fetch = original; }
});
