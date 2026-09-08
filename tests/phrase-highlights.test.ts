import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSentences } from '../lib/sentences';
import { evidenceAnchors } from '../lib/evidence';
import { resolveAnnotations } from '../lib/anchors';
import { queueSpread } from '../lib/pipeline';
import { attachPageNumbers, pageLabel, pageNumbersSchema } from '../lib/page-numbers';
import { NOTE_COLORS } from '../lib/note-colors';
import type { Spread, TextSpan } from '../lib/types';
const line=(text:string,id='L1',side:'left'|'right'='left'):TextSpan=>({id,side,text,confidence:99,polygon:[{x:10,y:10},{x:410,y:30},{x:410,y:50},{x:10,y:30}],words:[{text,start:0,end:text.length,box:{x0:10,y0:10,x1:410,y1:50}}]});
function locate(spans:TextSpan[],quote:string,sentence_id='S1'){
  const anchors=evidenceAnchors([{sentence_id,quote}],buildSentences(spans),spans);
  return resolveAnnotations({annotations:[{comment:'Her world feels small.',type:'结构',anchors}]},spans)[0];
}
void test('partial phrase clips both edges of a tilted OCR line and preserves original OCR',()=>{
  const spans=[line('The shop was her whole world, not just work.')];
  const before=JSON.stringify(spans);
  const a=locate(spans,'her whole world').anchors[0];
  assert.equal(a.quote,'her whole world');
  assert.equal(a.geometry,'estimated');
  assert.ok(a.polygon![0].x>10 && a.polygon![1].x<410);
  assert.ok(a.polygon![0].y>10 && a.polygon![1].y<30);
  assert.equal(JSON.stringify(spans),before);
});
void test('phrase preserves source offsets across line breaks, repaired hyphens and pages',()=>{
  const spans=[line('Her whole iden-'),line('tity was the shop.','R1','right')];
  const n=locate(spans,'identity was the shop');
  assert.deepEqual(n.anchors.map(a=>[a.side,a.quote]),[['left','iden'],['right','tity was the shop']]);
  const paged=attachPageNumbers([n],{left:'22',right:'23'})[0];
  assert.deepEqual(paged.pages,['22','23']);
  assert.deepEqual(paged.anchors.map(a=>a.pageNumber),['22','23']);
});
void test('sentence map handles leading whitespace, paragraph boundaries and inserted spaces',()=>{
  const spans=[line('  She left.She cried.  '),{...line('She hid the key.','L2'),paragraphStart:true}];
  const sentences=buildSentences(spans);
  for(const s of sentences) assert.equal(s.source!.length,s.text.length);
  const n=locate(spans,'She cried','S2');
  assert.equal(n.anchors[0].start,11);
});
void test('invented and ambiguous evidence is rejected; repeated line text uses explicit offsets',()=>{
  const spans=[line('She ran. She ran.')];
  assert.equal(locate(spans,'She ran','S2').anchors[0].start,9);
  assert.throws(()=>locate(spans,'She flew'));
  assert.throws(()=>locate([line('She ran and ran.')],'ran'));
  assert.throws(()=>locate(spans,'She ran','old-photo'));
});
void test('separate quotes on one line do not highlight the unrelated words between them',()=>{
  const spans=[line('She hid the key but kept her old routine.')];
  const a=evidenceAnchors([{sentence_id:'S1',quote:'hid the key'},{sentence_id:'S1',quote:'old routine'}],buildSentences(spans),spans);
  assert.equal(a.length,2);
  assert.deepEqual(a.map(r=>r.quote),['hid the key','old routine']);
});
void test('annotation-only queue preserves notes, text, geometry and image revision',()=>{
  const old={id:'s',status:'annotated',revision:7,spans:[line('She hid the key.')],annotations:[{id:'old'}],left:{width:420,height:800},seam:{top:0.4,bottom:0.5},pageNumbers:{left:'22',right:'23'}} as Spread;
  const next=queueSpread(old,'annotations');
  assert.equal(next.pipeline?.mode,'annotations');
  for(const field of ['spans','annotations','seam','left','pageNumbers','revision'] as const)assert.equal(next[field],old[field]);
  assert.throws(()=>queueSpread({...old,spans:undefined},'annotations'));
});
void test('printed folios support Roman numerals and explicit unknowns; never guess sequence',()=>{
  assert.deepEqual(pageNumbersSchema.parse({left:'iv',right:null}),{left:'iv',right:null});
  assert.equal(pageLabel({sequence:1,pageNumbers:{left:'22',right:'23'}}),'P22 - P23');
  assert.equal(pageLabel({sequence:99,pageNumbers:{left:null,right:null}}),'P? - P?');
  assert.throws(()=>pageNumbersSchema.parse({left:'Chapter 1',right:'23'}));
  assert.equal(new Set(NOTE_COLORS.map(c=>c.fill)).size,4);
});
