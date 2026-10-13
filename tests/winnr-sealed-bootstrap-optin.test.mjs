import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The sealed bootstrap can send real canary mail. It must never start on an unattended boot unless explicitly enabled.
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const server = fs.readFileSync(path.join(REPO_ROOT, 'server.mjs'), 'utf8');

test('the sealed bootstrap auto-run is gated behind an explicit environment opt-in', () => {
  const call = server.indexOf('runWinnrSealedBootstrapController({ config })');
  assert.ok(call > 0, 'the controller call exists');
  const gate = server.lastIndexOf("WINNR_SEALED_BOOTSTRAP_AUTORUN", call);
  assert.ok(gate > 0 && call - gate < 400, 'the opt-in check sits directly above the call');
  assert.match(server.slice(gate, call), /=== '1'/, 'only the exact value 1 enables it');
});
