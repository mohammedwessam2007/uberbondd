import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const canonicalClient = readFileSync(new URL('../public/uberbond.js', import.meta.url), 'utf8');
const liteBuild = readFileSync(new URL('../lite/scripts/build-visual-cortex.mjs', import.meta.url), 'utf8');
const staleLiteClient = new URL('../lite/public/uberbond.js', import.meta.url);

function assertAbsent(source, pattern, message) {
  assert.equal(pattern.test(source), false, message);
}

test('canonical UberBond owner bearer remains page-memory only', () => {
  assertAbsent(canonicalClient, /localStorage\s*\.(?:revenueEngineToken|nightshiftToken|uberbondGraphToken)/,
    'canonical owner client reads a privileged bearer from persistent localStorage');
  assertAbsent(canonicalClient, /localStorage\s*\.\s*setItem\s*\([^)]*(?:token|bearer|admin)/i,
    'canonical owner client persists a privileged bearer in localStorage');
  assertAbsent(canonicalClient, /sessionStorage\s*\.(?:revenueEngineToken|nightshiftToken|uberbondGraphToken)/,
    'canonical owner client reads a privileged bearer from sessionStorage');
  assert.match(canonicalClient, /window\.__uberbondOwnerBearer\s*=\s*\(\)\s*=>\s*token/,
    'canonical client must expose only its process/page-memory bearer bridge');
});

test('lite source cannot carry a second stale owner client', () => {
  assert.equal(existsSync(staleLiteClient), false,
    'lite/public/uberbond.js must be generated from the canonical hardened client, not tracked as a divergent copy');
  assert.match(liteBuild, /copyFile\(path\.join\(repoRoot, 'public', file\), path\.join\(publicDir, file\)\)/,
    'lite build must copy public assets from the canonical root client');
  assert.match(liteBuild, /\['uberbond\.css', 'uberbond\.js', 'uberbond-graph\.css', 'uberbond-graph\.js'\]/,
    'lite build must explicitly regenerate uberbond.js from the canonical source');
});
