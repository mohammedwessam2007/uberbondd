import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { toPublicFleetReceipt, WINNR_PUBLIC_RECEIPT_SCHEMA } from '../src/winnr-public-receipt.mjs';
import { assertPublicSafe, PublicArtifactLeak } from '../src/winnr-public-artifact-guard.mjs';

const ATTESTATION = { kind: 'owner-mission', mission: 'UBERBOND_WINNR_FLEET_FINAL_INTEGRATION', dated: '2026-10-13' };
const FULL_SHA = '4ea739b1d80b6e4f7606d4d69b71e695e18c2490';
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COMMITTED = path.join(REPO_ROOT, 'winnr/receipts/FLEET_INTEGRATION_RECEIPT_20261013.json');

function rawPhases() {
  return {
    read: { ok: true, startedAt: '2026-10-13T12:00:00.000Z', finishedAt: '2026-10-13T12:00:01.000Z', result: { startupAccounts: 50, grantedScopes: ['read', 'write'] } },
    'probe-smtp': {
      ok: true,
      result: {
        classificationCounts: { AUTH_CONFIRMED: 50 },
        perAccount: [{ slotDigest: 'a1b2c3d4e5f60718', classification: 'AUTH_CONFIRMED' }]
      }
    },
    import: { ok: false, error: 'connect failed for user-fixture@startup-fixture.co', errorClass: 'ECONNRESET' }
  };
}

test('per-account rows, digests and raw error messages are removed at any depth', () => {
  const receipt = toPublicFleetReceipt({ generatedAt: '2026-10-13T12:00:00.000Z', baseCommit: FULL_SHA, ownerAttestation: ATTESTATION, phases: rawPhases() });
  const text = JSON.stringify(receipt);
  assert.equal(text.includes('slotDigest'), false);
  assert.equal(text.includes('perAccount'), false);
  assert.equal(text.includes('"error"'), false);
  assert.equal(text.includes('user-fixture'), false);
  assert.equal(receipt.phases.import.errorClass, 'ECONNRESET', 'the fixed class survives');
  assert.equal(receipt.phases['probe-smtp'].result.classificationCounts.AUTH_CONFIRMED, 50, 'aggregates survive');
});

test('the header is rebuilt from fixed values and carries no full commit or attestation string', () => {
  const receipt = toPublicFleetReceipt({ generatedAt: '2026-10-13T12:00:00.000Z', baseCommit: FULL_SHA, ownerAttestation: ATTESTATION, phases: {} });
  assert.equal(receipt.schemaVersion, WINNR_PUBLIC_RECEIPT_SCHEMA);
  assert.equal(receipt.baseCommitShort, FULL_SHA.slice(0, 12));
  assert.equal(JSON.stringify(receipt).includes(FULL_SHA), false);
  assert.equal('ownerAttestationRef' in receipt, false);
  assert.deepEqual(receipt.ownerAttestation, ATTESTATION);
});

test('a leak smuggled into an allowed field refuses the whole receipt', () => {
  const phases = rawPhases();
  phases.import.result = { note: 'contact ops@startup-fixture.co' };
  assert.throws(() => toPublicFleetReceipt({ generatedAt: 'x', baseCommit: FULL_SHA, ownerAttestation: ATTESTATION, phases }), PublicArtifactLeak);
});

test('a customer domain name in a value refuses the whole receipt', () => {
  const phases = { read: { ok: true, result: { detail: 'startup-fixture.co is live' } } };
  assert.throws(() => toPublicFleetReceipt({ generatedAt: 'x', baseCommit: FULL_SHA, ownerAttestation: ATTESTATION, phases }), PublicArtifactLeak);
});

test('an identity-bearing key refuses the whole receipt even when its value is a count', () => {
  const phases = { read: { ok: true, result: { mailboxCount: 50 } } };
  assert.throws(() => toPublicFleetReceipt({ generatedAt: 'x', baseCommit: FULL_SHA, ownerAttestation: ATTESTATION, phases }), PublicArtifactLeak);
});

test('a receipt without an owner attestation descriptor is refused', () => {
  assert.throws(() => toPublicFleetReceipt({ generatedAt: 'x', baseCommit: FULL_SHA, phases: {} }), error => error.code === 'OWNER_ATTESTATION_DESCRIPTOR_REQUIRED');
});

test('the committed fleet receipt is public-safe and free of per-account identifiers', () => {
  const committed = JSON.parse(fs.readFileSync(COMMITTED, 'utf8'));
  assert.equal(committed.schemaVersion, WINNR_PUBLIC_RECEIPT_SCHEMA);
  assert.doesNotThrow(() => assertPublicSafe(committed));
  const text = fs.readFileSync(COMMITTED, 'utf8');
  assert.equal(text.includes('slotDigest'), false);
  assert.equal(text.includes('perAccount'), false);
  assert.equal(text.includes(FULL_SHA), false, 'only the short commit identifier is published');
});
