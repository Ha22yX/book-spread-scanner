import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { SUMMARY_SQL, summarizeSpread, spreadVersion, DetailCache } from '../lib/spread-summary';
import { thumbnailPixels } from '../lib/thumbnail';
import type { Spread } from '../lib/types';

export function sampleSpread(sequence: number): Spread {
  return { id:crypto.randomUUID(), sequence, created_at:sequence, revision:1,
    status:'annotated', width:2400, height:1800, left:{width:1200,height:1800},right:{width:1200,height:1800},
    seam:{top:.5,bottom:.5,confidence:1,method:'gutter'},
    pipeline:{stage:'complete',percent:100,updatedAt:sequence,splitReady:true,attempts:1},
    spans:Array.from({length:60}, (_,i) => ({id:`l${i}`,side:i<30?'left':'right',text:'The store becomes a part of her life and changes her identity.',confidence:98,
      words:Array.from({length:14},(_,j)=>({text:'store',start:j*6,end:j*6+5,box:{x0:j*.06,y0:(i%30)*.025,x1:j*.06+.05,y1:(i%30)*.025+.02}}))})),
    annotations:[{id:'a1',comment:'This comparison shows how the store shapes her sense of identity.',type:'comparison',anchors:[]}],
  };
}
void test('100 OCR-rich captures return a bounded lightweight list without text or anchors', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE spreads(id TEXT, session_id TEXT, sequence INTEGER, status TEXT, revision INTEGER, data TEXT)');
  const items = Array.from({length:100},(_,i)=>sampleSpread(i+1));
  for (const s of items) db.prepare('INSERT INTO spreads VALUES(?,?,?,?,?,?)').run(s.id,'s',s.sequence,s.status,s.revision,JSON.stringify(s));
  const rows = db.prepare(SUMMARY_SQL).all('s');
  const summary = rows.map((r)=>({...JSON.parse(r.data as string),status:r.status,revision:r.revision,contentBytes:r.contentBytes}));
  const before = Buffer.byteLength(JSON.stringify(items)), after = Buffer.byteLength(JSON.stringify(summary));
  assert.equal(summary.length,100);
  assert.ok(summary.every((s)=>!('spans' in s) && !('annotations' in s)));
  assert.ok(after < 100_000);
  assert.ok(after / before < .02);
  console.log(`100-capture fixture: ${before} → ${after} bytes (${(100*(1-after/before)).toFixed(1)}% smaller)`);
  db.close();
});
void test('detail cache retains only three recent versions and refreshes progress keys', () => {
  const cache = new DetailCache(3);
  const spreads = Array.from({length:100}, (_,i)=>sampleSpread(i));
  for (const s of spreads) cache.set(spreadVersion(s),s);
  assert.equal(spreads.filter((s)=>cache.get(spreadVersion(s))).length,3);
  const s = spreads[99];
  assert.notEqual(spreadVersion(s),spreadVersion({...s,revision:2}));
  assert.notEqual(spreadVersion(s),spreadVersion({...s,pipeline:{...s.pipeline!,updatedAt:999}}));
  assert.equal(summarizeSpread(s).spans,undefined);
  cache.clear();
  assert.equal(cache.get(spreadVersion(s)),undefined);
});
void test('thumbnail keeps portrait orientation and uses at most 280 pixels on the long side', () => {
  const image = {width:1400,height:2100,data:new Uint8Array(1400*2100*4).fill(255)};
  const thumb = thumbnailPixels(image);
  assert.equal(thumb.height,280);
  assert.equal(thumb.width,187);
  assert.equal(thumb.data.length,187*280*4);
  assert.equal(image.width,1400);
});
