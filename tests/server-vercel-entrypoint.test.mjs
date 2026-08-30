import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Vercel treats server.mjs as the project root entrypoint. Its loader requires
// a default function or server; a named-only export builds successfully but
// fails every invocation at runtime.
test('server root exposes the request handler as the default export', async () => {
  const source = await readFile(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'server.mjs'), 'utf8');
  assert.match(source, /export default requestHandler;/);
});
