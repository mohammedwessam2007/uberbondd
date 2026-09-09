import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  compileFounderConsoleBinding,
  compileFounderConsoleSnapshot,
  parseFounderConsoleInput
} from '../src/sovereign-founder-console.mjs';

test('founder console defaults to loopback without inventing public exposure', () => {
  const out = compileFounderConsoleBinding({});
  assert.equal(out.ok, true);
  assert.equal(out.host, '127.0.0.1');
  assert.equal(out.tokenRequired, false);
  assert.equal(out.publicExposureAuthorized, false);
  assert.equal(out.businessEffectAuthority, 'NONE');
});

test('non-loopback binding requires a strong token', () => {
  const refused = compileFounderConsoleBinding({ host: '0.0.0.0', token: 'short' });
  assert.equal(refused.ok, false);
  assert.ok(refused.reasonCodes.includes('non-loopback-founder-console-requires-strong-token'));
  const admitted = compileFounderConsoleBinding({ host: '192.168.1.10', token: 'x'.repeat(32) });
  assert.equal(admitted.ok, true);
  assert.equal(admitted.tokenRequired, true);
  assert.equal(admitted.publicExposureAuthorized, false);
});

test('natural founder control aliases stay within the fixed control vocabulary', () => {
  assert.equal(parseFounderConsoleInput('continue').command, 'wake');
  assert.equal(parseFounderConsoleInput('stop').command, 'pause');
  assert.equal(parseFounderConsoleInput('what are you doing').command, 'status');
  assert.equal(parseFounderConsoleInput('review').command, 'verify');
});

test('arbitrary founder text becomes context not effect authority', () => {
  const out = parseFounderConsoleInput('Finish the current engineering frontier and explain the next real blocker.');
  assert.equal(out.ok, true);
  assert.equal(out.kind, 'FOUNDER_INTENT');
  assert.equal(out.businessEffectAuthority, 'NONE');
  assert.equal(out.externalEffectAuthority, 'NONE');
  assert.match(out.truthBoundary, /not authority/i);
});

test('snapshot exposes autonomy receipts but never private-life payloads', () => {
  const out = compileFounderConsoleSnapshot({
    autonomyStatus: { status: 'TASK_DISPATCHED_TO_ISOLATED_WORKER', taskId: 't1', baseRevision: 'a'.repeat(40), attemptId: 'b'.repeat(64) },
    continuation: { observedBaseRevision: 'a'.repeat(40), continuation: { status: 'WAIT_FOR_EXISTING_ATTEMPT', decision: 'DO_NOT_CREATE_DUPLICATE_TASK' } },
    latestIntent: { id: 'intent-123', createdAt: '2026-09-10T00:00:00Z', state: 'QUEUED', intent: 'private text must not echo' }
  });
  assert.equal(out.ok, true);
  assert.equal(out.autonomy.status, 'TASK_DISPATCHED_TO_ISOLATED_WORKER');
  assert.equal(out.latestFounderIntent.id, 'intent-123');
  assert.equal(JSON.stringify(out).includes('private text must not echo'), false);
  assert.equal(out.privacy.personalCivilizationVaultRead, false);
});

test('server uses fixed argv control execution and has no business providers', () => {
  const server = readFileSync(new URL('../scripts/sovereign-founder-console-server.mjs', import.meta.url), 'utf8');
  assert.match(server, /execFile\(AUTHORCTL, \[command\]/);
  assert.doesNotMatch(server, /exec\s*\(/);
  assert.doesNotMatch(server, /paypal|stripe|sendgrid|resend|twilio/i);
  assert.match(server, /FOUNDER_INTENT_QUEUED/);
  assert.match(server, /businessEffectAuthority:'NONE'/);
  assert.match(server, /externalEffectAuthority:'NONE'/);
});

test('systemd service and installer preserve local-only default', () => {
  const service = readFileSync(new URL('../ops/sovereign/uberbond-founder-console.service', import.meta.url), 'utf8');
  const installer = readFileSync(new URL('../ops/sovereign/install-authoring-node.sh', import.meta.url), 'utf8');
  assert.match(service, /^User=uberbond-author$/m);
  assert.match(service, /^NoNewPrivileges=true$/m);
  assert.match(service, /^ProtectSystem=strict$/m);
  assert.match(installer, /UBERBOND_FOUNDER_CONSOLE_HOST=127\.0\.0\.1/);
  assert.match(installer, /http:\/\/127\.0\.0\.1:8787\//);
  assert.match(installer, /release signing authority must not live/i);
});
