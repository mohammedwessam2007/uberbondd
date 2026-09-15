import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { compileOutreach100kPacket, compileOutreach100kPackets } from '../src/outreach-100k-packet-compiler.mjs';
import { materializeOutreach100kPacketCorpus } from '../src/outreach-100k-corpus-materializer.mjs';
import { inspectOutreach100kPacketCorpus } from '../src/outreach-100k-packet-corpus.mjs';

const NOW = new Date('2026-09-15T12:00:00.000Z');
const record = (i) => ({
  recipient: {
    id: `r${i}`,
    email: `p${i}@example.com`,
    providerId: i % 2 ? 'gmail' : 'microsoft',
    timeZone: 'America/New_York',
    accountKey: `a${i}`,
    verified: true,
    safeForOutreach: true,
    verificationEvidenceRef: `verify:${i}`
  },
  legal: { eligible: true, status: 'PASSED', evidenceId: `legal:${i}`, policyVersion: 'v1' },
  suppression: { checked: true, suppressed: false, unsubscribeRequested: false, unsubscribed: false },
  campaign: { id: 'c1' },
  message: { subject: `subject ${i}`, body: `body ${i}` },
  dispatchAuthorization: {
    authorized: true,
    receiptId: `auth${i}`,
    authorizedBy: 'founder',
    recipientEmail: `p${i}@example.com`,
    campaignId: 'c1',
    expiresAt: '2026-09-17T23:00:00.000Z'
  }
});

const boxes = [
  { mailboxId: 'm1', ready: true, remainingDailyCap: 2, observedHourlyCap: 2, minGapSeconds: 0 },
  { mailboxId: 'm2', ready: true, remainingDailyCap: 2, observedHourlyCap: 2, minGapSeconds: 0 }
];

async function targetFile() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ub100k-compiler-'));
  return path.join(dir, 'corpus.ndjson');
}

test('compiler binds caller-supplied evidence and authority into canonical packet', () => {
  const result = compileOutreach100kPacket(record(1), { now: NOW });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.packet.recipientId, 'r1');
  assert.equal(result.packet.launchInput.recipient.safeForOutreach, true);
  assert.equal(result.packet.launchInput.legal.status, 'PASSED');
  assert.equal(result.packet.dispatchAuthorization.receiptId, 'auth1');
  assert.match(result.packet.idempotencyKey, /^ub100k:c1:/);
  assert.equal(result.externalEffectsAuthorized, false);
});

test('compiler refuses missing verification/legal/suppression/authorization evidence', () => {
  const broken = record(1);
  broken.recipient.verificationEvidenceRef = '';
  broken.legal.eligible = false;
  broken.suppression.checked = false;
  broken.dispatchAuthorization.authorized = false;
  const result = compileOutreach100kPacket(broken, { now: NOW });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('recipient-verification-evidence-required'));
  assert.ok(result.reasonCodes.includes('recipient-legal-evidence-required'));
  assert.ok(result.reasonCodes.includes('recipient-suppression-gate-not-precleared'));
  assert.ok(result.reasonCodes.includes('exact-dispatch-authorization-required'));
});

test('batch compiler preserves rejected rows instead of silently coercing them', () => {
  const bad = record(2);
  bad.dispatchAuthorization.expiresAt = '2026-09-15T11:00:00.000Z';
  const result = compileOutreach100kPackets([record(1), bad], { now: NOW });
  assert.equal(result.ok, false);
  assert.equal(result.compiledCount, 1);
  assert.equal(result.rejectedCount, 1);
  assert.ok(result.rejected[0].reasonCodes.includes('dispatch-authorization-expired'));
});

test('compiler -> materializer -> existing inspector closes packet chain', async () => {
  const compiled = compileOutreach100kPackets([record(1), record(2), record(3)], { now: NOW });
  assert.equal(compiled.ok, true, JSON.stringify(compiled));
  const outputPath = await targetFile();
  const materialized = await materializeOutreach100kPacketCorpus({
    candidates: compiled.packets,
    mailboxes: boxes,
    campaignId: 'c1',
    outputPath,
    target: 3,
    now: NOW
  });
  assert.equal(materialized.ok, true, JSON.stringify(materialized));
  const inspection = await inspectOutreach100kPacketCorpus({ filePath: outputPath, mailboxes: boxes, campaignId: 'c1', expectedCount: 3, now: NOW });
  assert.equal(inspection.ok, true, JSON.stringify(inspection));
  assert.equal(inspection.count, 3);
});
