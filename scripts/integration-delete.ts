import assert from 'node:assert/strict';
import sharp from 'sharp/lib/index.js';
import { readFile } from 'node:fs/promises';

process.loadEnvFile('.dev.vars');
const base = process.env.TEST_URL || process.env.PROCESSOR_BASE_URL!;
const request = (path: string, init: RequestInit = {}) => {
  const headers = new Headers(init.headers);
  if (new URL(base).hostname.endsWith('.chatgpt.site')) headers.set('OAI-Sites-Authorization', `Bearer ${process.env.SITE_ACCESS_TOKEN}`);
  return fetch(base+path, { ...init, headers });
};
const sessionResponse = await request('/api/sessions', {method:'POST'});
assert.equal(sessionResponse.status, 201);
const session = (await sessionResponse.json() as {id:string}).id;
const photo = await sharp(await readFile(process.argv[2])).resize({width:1600}).jpeg().toBuffer();
const id = crypto.randomUUID();
const upload = () => request(`/api/sessions/${session}/spreads`, {method:'POST',headers:{'Content-Type':'image/jpeg','X-Upload-Id':id},body:new Uint8Array(photo).buffer});
assert.equal((await upload()).status,201);
const path = `/api/sessions/${session}/spreads/${id}`;
assert.equal((await request(path, {method:'DELETE',headers:{Origin:'https://unrelated.example'}})).status,403);
assert.equal((await request(path+'/image/original')).status,200);
assert.equal((await request(path,{method:'DELETE'})).status,200);
assert.equal((await request(path,{method:'DELETE'})).status,200);
assert.equal((await request(path+'/image/original')).status,404);
assert.equal((await upload()).status,410);
const after = await request(`/api/sessions/${session}`);
assert.equal((await after.json() as {spreads:unknown[]}).spreads.length,0);
assert.equal((await request(path+'/process',{method:'POST',headers:{'Content-Type':'application/json'},body:'{"revision":1}'})).status,404);
console.log('PASS: delete capture, reject cross-origin deletion, idempotent retry, hide images, prevent resurrection and processing. Only this test capture was deleted.');
