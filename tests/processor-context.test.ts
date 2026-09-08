import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { PRIOR_CONTEXT_SQL } from '../lib/processor-context';
import { selectedAnchors } from '../lib/selected-anchors';
import type { TextSpan } from '../lib/types';

void test('history query is bounded, session-scoped and skips deleted/current/future captures', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE spreads(session_id TEXT, sequence INTEGER, status TEXT, revision INTEGER, data TEXT)');
  for (let sequence = 1; sequence <= 100; sequence++) db.prepare('INSERT INTO spreads VALUES(?,?,?,?,?)').run('s',sequence,sequence === 49 ? 'deleted' : 'annotated',1,JSON.stringify({sequence}));
  db.prepare('INSERT INTO spreads VALUES(?,?,?,?,?)').run('other',49,'annotated',1,'{}');
  const rows = db.prepare(PRIOR_CONTEXT_SQL).all('s',50);
  assert.deepEqual(rows.reverse().map((r) => JSON.parse(r.data as string).sequence),[47,48]);
  assert.equal(db.prepare(PRIOR_CONTEXT_SQL).all('s',1).length,0);
  db.close();
});
void test('anchor merging preserves scope and rejects unknown, ambiguous and overbroad selections', () => {
  const spans = Array.from({length:9},(_,i) => ({id:`L${i}`,side:'left',text:`word${i}`,confidence:99,words:[]} as TextSpan));
  const sentences = spans.map((s,i) => ({id:`S${i}`,text:s.text,sides:['left'] as ('left')[],anchors:[{span_id:s.id,quote:s.text}]}));
  assert.throws(() => selectedAnchors(['missing'],sentences,spans));
  assert.throws(() => selectedAnchors(sentences.map(s=>s.id),sentences,spans),/broad/);
  assert.equal(selectedAnchors(['S1','S1'],sentences,spans).length,1);
  assert.throws(() => selectedAnchors(['S1'],sentences,[{...spans[1],text:'word1 word1'}]),/Ambiguous/);
});
