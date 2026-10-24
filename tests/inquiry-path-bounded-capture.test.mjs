import test from 'node:test';
import assert from 'node:assert/strict';
import { readBoundedResponseClone, INQUIRY_CAPTURE_MAX_BYTES } from '../src/inquiry-path-bounded-capture.mjs';

test('an ordinary HTML clone is read as exact bytes without network calls', async () => {
  const body = '<html>Call us: +1 (512) 555-2671</html>';
  assert.equal(await readBoundedResponseClone(new Response(body)), body);
});

test('a body over the cap is not buffered into a partial clean result', async () => {
  const payload = 'a'.repeat(INQUIRY_CAPTURE_MAX_BYTES + 1);
  assert.equal(await readBoundedResponseClone(new Response(payload)), null);
});

test('zero-size body and unavailable response streams have bounded outcomes', async () => {
  assert.equal(await readBoundedResponseClone(new Response('')), '');
  assert.equal(await readBoundedResponseClone({}), null);
});
