import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { printPhase } from '../scripts/winnr-fleet-integration.mjs';

// The runner's printed lines land in public workflow logs, so every printed result must pass the artifact guard.
// The import is safe: the runner runs main() only when it is the entry point.

const SECRET_MARK = 'fixture-secret-mark';

function captureLog(fn) {
  const lines = [];
  const original = console.log;
  console.log = (...args) => lines.push(args.join(' '));
  try { fn(); } finally { console.log = original; }
  return lines.join('\n');
}

test('a clean aggregate result prints as-is', () => {
  const out = captureLog(() => printPhase('read', { startupAccounts: 50, grantedScopes: ['read', 'write'] }));
  assert.equal(out, '[read] {"startupAccounts":50,"grantedScopes":["read","write"]}');
});

test('a result that carries an address is replaced by a fixed refusal code and the address never prints', () => {
  const out = captureLog(() => printPhase('export', { note: `send to ops@startup-fixture.co ${SECRET_MARK}` }));
  assert.equal(out, '[export] {"outputRefused":"PUBLIC_ARTIFACT_LEAK_REFUSED"}');
  assert.equal(out.includes('startup-fixture'), false);
  assert.equal(out.includes('@'), false);
});

test('a result that carries a presigned URL is refused and the URL never prints', () => {
  const out = captureLog(() => printPhase('export', { download: 'https://storage.example.test/x.csv?X-Amz-Signature=abc' }));
  assert.equal(out.includes('X-Amz-Signature'), false);
  assert.equal(out.includes('storage.example'), false);
  assert.match(out, /outputRefused/);
});

test('a result keyed with an identity word is refused even when its value is a count', () => {
  const out = captureLog(() => printPhase('read', { mailboxCount: 50 }));
  assert.match(out, /outputRefused/);
  assert.equal(out.includes('mailboxCount'), false);
});

test('the runner never prints a raw error message, a per-account array, or a digest field', () => {
  const runnerPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'scripts/winnr-fleet-integration.mjs');
  const source = fs.readFileSync(runnerPath, 'utf8');
  const printLines = source.split('\n').filter(l => /console\.(log|error)\(/.test(l));
  for (const line of printLines) {
    assert.equal(/\.message|perAccount|slotDigest|\berror\b:/.test(line), false, `print line must not carry raw error text or per-account rows: ${line.trim()}`);
  }
  assert.equal(/perAccount\s*:\s*\(/.test(source), false, 'no phase returns a per-account array');
});

test('the export phase gates the inventory before any CSV is written to disk', () => {
  const runnerPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'scripts/winnr-fleet-integration.mjs');
  const source = fs.readFileSync(runnerPath, 'utf8');
  const gateAt = source.indexOf('gateCsvInventory({ expected, rows })');
  const writeAt = source.indexOf("writePrivate(ctx.file('creds-export.csv'), csv)");
  assert.ok(gateAt > 0 && writeAt > 0, 'both steps present');
  assert.ok(gateAt < writeAt, 'the gate runs before the CSV is written');
  const providerAt = source.indexOf('gateProviderInventory({ expected, providerDomains');
  const exportAt = source.indexOf('api.exportMailboxes(');
  assert.ok(providerAt > 0 && providerAt < exportAt, 'the provider inventory is checked before any export request');
});
