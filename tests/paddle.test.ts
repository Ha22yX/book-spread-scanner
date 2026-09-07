import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paddleLinesToSpans } from '../lib/paddle-lines';
import { buildSentences } from '../lib/sentences';
import { validateSpans, resolveAnnotations } from '../lib/anchors';
void test('maps original tilted line polygons back from detector dimensions and filters noise',()=>{
 const spans=paddleLinesToSpans([
  {text:'23',mean:0.99,box:[[10,10],[20,10],[20,20],[10,20]]},
  {text:'noise',mean:0.3,box:[[0,300],[40,300],[40,330],[0,330]]},
  {text:'This is the first line.',mean:0.95,box:[[100,110],[700,170],[698,190],[98,130]]},
  {text:'This is the second line.',mean:0.96,box:[[100,160],[700,220],[698,240],[98,180]]},
 ],'left',{width:1000,height:1500});
 assert.equal(spans.length,2);
 assert.equal(spans[0].polygon?.[0].x,100*1000/1024);
 assert.ok(spans[0].polygon![0].y<spans[0].polygon![1].y);
 validateSpans(spans,{left:{width:1000,height:1500},right:{width:1000,height:1500}});
 const notes=resolveAnnotations({annotations:[{comment:'test',type:'结构',anchors:buildSentences(spans)[0].anchors}]},spans);
 assert.equal(notes[0].anchors.length,1);
 assert.deepEqual(notes[0].anchors[0].polygon,spans[0].polygon);
});
void test('missing spaces after punctuation do not turn a whole paragraph into one sentence',()=>{
 const spans=paddleLinesToSpans([{text:'He left.It was quiet.Then she came back.',mean:0.96,box:[[10,10],[900,10],[900,35],[10,35]]}],'left',{width:960,height:1440});
 assert.equal(buildSentences(spans).length,3);
 assert.equal(buildSentences(spans)[1].text,'It was quiet.');
});
