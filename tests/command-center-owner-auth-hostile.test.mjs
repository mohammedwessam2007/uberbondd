import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const commandCenter = readFileSync(join(root, 'public/uberbond.js'), 'utf8');
const graphClient = readFileSync(join(root, 'public/uberbond-graph.js'), 'utf8');
const html = readFileSync(join(root, 'public/uberbond.html'), 'utf8');
const combined = `${commandCenter}\n${graphClient}`;

const persistentBearerPatterns = [
  /localStorage\s*\.\s*(?:revenueEngineToken|nightshiftToken|uberbondGraphToken)/,
  /localStorage\s*\.\s*setItem\s*\([^)]*(?:token|bearer|admin)/i,
  /sessionStorage\s*\.\s*(?:revenueEngineToken|nightshiftToken|uberbondGraphToken)/,
  /sessionStorage\s*\.\s*setItem\s*\([^)]*(?:token|bearer|admin)/i
];

for (const pattern of persistentBearerPatterns) {
  test(`owner bearer is not persisted by Command Center clients: ${pattern}`, () => {
    assert.doesNotMatch(combined, pattern);
  });
}

test('full Command Center exposes only a process-memory bearer bridge', () => {
  assert.match(commandCenter, /window\.__uberbondOwnerBearer\s*=\s*\(\)\s*=>\s*token/);
  assert.match(graphClient, /window\.__uberbondOwnerBearer/);
  assert.doesNotMatch(graphClient, /document\.cookie/);
});

test('Ultimate Graph requests do not put owner authority in the URL', () => {
  assert.match(graphClient, /authorization:\s*`Bearer \$\{owner\}`/);
  assert.doesNotMatch(graphClient, /searchParams\.(?:set|append)\([^)]*(?:token|bearer|admin)/i);
  assert.doesNotMatch(graphClient, /[?&](?:token|bearer|admin(?:_token)?)=/i);
});

test('owner token field does not opt into browser autofill persistence', () => {
  assert.match(html, /id="owner-token"[^>]*type="password"/);
  assert.doesNotMatch(html, /id="owner-token"[^>]*autocomplete="(?:username|email)"/i);
});

test('deployment-protected mode is explicit and cannot silently grant consequence authority', () => {
  const explicitDeploymentBoundary = /document\.documentElement\.dataset\.uberbondAuthMode\s*===\s*'deployment-protected'/;
  assert.match(commandCenter, explicitDeploymentBoundary);
  assert.match(graphClient, explicitDeploymentBoundary);
  assert.doesNotMatch(combined, /businessEffectAuthority\s*=\s*['"](?:ALLOW|FULL|UNLIMITED)['"]/i);
});
