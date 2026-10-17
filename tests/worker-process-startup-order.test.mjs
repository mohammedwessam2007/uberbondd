import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

test('worker startup readiness log occurs only after SIGTERM and SIGINT drain handlers are registered',()=>{
  const source = readFileSync(fileURLToPath(new URL('../worker.mjs', import.meta.url)), 'utf8');
  const ready = source.lastIndexOf('started using ${config.storeBackend}');
  const term = source.lastIndexOf("process.on('SIGTERM'");
  const interrupt = source.lastIndexOf("process.on('SIGINT'");
  assert.ok(ready > 0 && term > 0 && interrupt > 0);
  assert.ok(ready > term && ready > interrupt, 'shutdown handlers must be ready before startup announcement');
});
