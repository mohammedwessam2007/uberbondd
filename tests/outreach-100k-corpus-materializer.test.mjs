import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { materializeOutreach100kPacketCorpus } from '../src/outreach-100k-corpus-materializer.mjs';
import { inspectOutreach100kPacketCorpus } from '../src/outreach-100k-packet-corpus.mjs';

const NOW = new Date('2026-09-15T12:00:00.000Z');
const boxes = [
  { mailboxId: 'm1', ready: true, remainingDailyCap: 2, observedHourlyCap: 2, minGapSeconds: 0 },
  { mailboxId: 'm2', ready: true, remainingDailyCap: 2, observedHourlyCap: 2, minGapSeconds: 0 }
];
const candidate = (i, overrides = {}) => {
  const to = `p${i}@example.com`;
  const row = {
    recipientId: `r${i}`,
    accountKey: `a${i}`,
    recipientProviderId: i % 2 ? 'gmail' : 'microsoft',
    recipientTimeZone: 'America/New_York',
    campaignId: 'c1',
    message: { to, subject: `subject ${i}`, body: `body ${i}` },
    dispatchAuthorization: {
      authorized: true,
      receiptId: `auth${i}`,
      authorizedBy: 'founder',
      recipientEmail: to,
      campaignId: 'c1',
      expiresAt: '2026-09-17T23:00:00.000Z'
    },
    launchInput: {
      recipient: { email: to, verified: true, safeForOutreach: true, verificationEvidenceRef: `verify:${i}` },
      campaign: { id: 'c1' },
      legal: { eligible: true, status: 'PASSED', evidenceId: `legal:${i}`, policyVersion: 'v1' },
      suppression: { checked: true, suppressed: false, unsubscribeRequested: false }
    }
  };
  return Object.assign(row, overrides);
};
async function targetFile() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ub100k-materializer-'));
  return path.join(dir, 'outreach-100k-corpus.ndjson');
}

test('materializer writes exact governed corpus and round-trips existing inspector', async () => {
  const outputPath = await targetFile();
  const result = await materializeOutreach100kPacketCorpus({ candidates: [candidate(1), candidate(2), candidate(3)], mailboxes: boxes, campaignId: 'c1', outputPath, target: 3, now: NOW });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.status, 'OUTREACH_100K_CORPUS_MATERIALIZED');
  assert.equal(result.messagesSent, 0);
  const inspect = await inspectOutreach100kPacketCorpus({ filePath: outputPath, mailboxes: boxes, campaignId: 'c1', expectedCount: 3, now: NOW });
  assert.equal(inspect.ok, true, JSON.stringify(inspect));
  assert.equal(inspect.count, 3);
  assert.equal(result.recipientSetDigest, inspect.recipientSetDigest);
});

test('materializer refuses duplicate recipient instead of filling target with duplicate identity', async () => {
  const outputPath = await targetFile();
  const a = candidate(1);
  const b = candidate(2);
  b.message.to = a.message.to;
  b.launchInput.recipient.email = a.message.to;
  b.dispatchAuthorization.recipientEmail = a.message.to;
  const result = await materializeOutreach100kPacketCorpus({ candidates: [a, b], mailboxes: boxes, campaignId: 'c1', outputPath, target: 2, now: NOW });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('insufficient-precleared-candidate-inventory'));
});

test('materializer refuses expired authorization', async () => {
  const outputPath = await targetFile();
  const row = candidate(1);
  row.dispatchAuthorization.expiresAt = '2026-09-15T11:59:00.000Z';
  const result = await materializeOutreach100kPacketCorpus({ candidates: [row], mailboxes: boxes, campaignId: 'c1', outputPath, target: 1, now: NOW });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('insufficient-precleared-candidate-inventory'));
});

test('materializer refuses when observed mailbox capacity cannot cover target', async () => {
  const outputPath = await targetFile();
  const limited = [{ mailboxId: 'm1', ready: true, remainingDailyCap: 1, observedHourlyCap: 1, minGapSeconds: 0 }];
  const result = await materializeOutreach100kPacketCorpus({ candidates: [candidate(1), candidate(2)], mailboxes: limited, campaignId: 'c1', outputPath, target: 2, now: NOW });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('insufficient-observed-mailbox-capacity'));
});

test('materializer fails closed when dispatch authorization expires before schedulable business window', async () => {
  const outputPath = await targetFile();
  const row = candidate(1);
  row.recipientTimeZone = 'Pacific/Auckland';
  row.dispatchAuthorization.expiresAt = '2026-09-15T12:10:00.000Z';
  const result = await materializeOutreach100kPacketCorpus({ candidates: [row], mailboxes: boxes, campaignId: 'c1', outputPath, target: 1, now: NOW });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('unable-to-schedule-exact-target-within-observed-capacity-and-authorization'));
});
