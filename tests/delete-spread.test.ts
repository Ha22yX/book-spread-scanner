import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { DELETE_SPREAD_SQL, removeSpreadFiles } from '../lib/delete-spread';

void test('delete fences running jobs, clears content, remains idempotent and session scoped', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE spreads(id TEXT, session_id TEXT, status TEXT, revision INTEGER, job_started INTEGER, data TEXT)');
  db.prepare('INSERT INTO spreads VALUES(?,?,?,?,?,?)').run('photo', 'session', 'processing', 2, 123, '{"spans":["book text"]}');
  assert.equal(db.prepare(DELETE_SPREAD_SQL).run('photo', 'other-session').changes, 0);
  assert.equal(db.prepare(DELETE_SPREAD_SQL).run('photo', 'session').changes, 1);
  assert.deepEqual({ ...db.prepare('SELECT status,revision,job_started,data FROM spreads').get() }, {status:'deleted', revision:3, job_started:null, data:'{}'});
  assert.equal(db.prepare("UPDATE spreads SET status='annotated' WHERE id=? AND revision=?").run('photo', 2).changes, 0);
  assert.equal(db.prepare("UPDATE spreads SET status='processing' WHERE id=? AND job_started=?").run('photo', 123).changes, 0);
  assert.equal(db.prepare(DELETE_SPREAD_SQL).run('photo', 'session').changes, 0);
  db.close();
});

void test('image cleanup visits every revision and page under only the selected capture prefix', async () => {
  const deleted: string[] = [];
  const prefix = 'session/photo/';
  const bucket = {
    list: async (options: {prefix:string; cursor?:string}) => {
      assert.equal(options.prefix, prefix);
      return options.cursor ? {objects:[{key:prefix+'2/right.jpg'}],truncated:false} : {objects:[{key:prefix+'original.jpg'},{key:prefix+'1/left.jpg'}],truncated:true,cursor:'next'};
    },
    delete: async (keys:string[]) => { deleted.push(...keys); },
  } as unknown as R2Bucket;
  await removeSpreadFiles(bucket, prefix);
  assert.deepEqual(deleted, [prefix+'original.jpg',prefix+'1/left.jpg',prefix+'2/right.jpg']);
});
