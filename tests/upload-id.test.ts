import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createUploadId } from '../lib/upload-id';

void test('LAN HTTP upload IDs do not require secure-context randomUUID', () => {
  const httpCrypto = {getRandomValues: crypto.getRandomValues.bind(crypto)};
  const ids = Array.from({length: 100}, () => createUploadId(httpCrypto));
  assert.equal(new Set(ids).size, 100);
  for (const id of ids) assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});
