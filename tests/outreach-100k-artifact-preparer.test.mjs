import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { prepareOutreach100kArtifacts } from '../src/outreach-100k-artifact-preparer.mjs';
import { inspectOutreach100kPacketCorpus } from '../src/outreach-100k-packet-corpus.mjs';

const NOW = new Date('2026-09-15T12:00:00.000Z');
const observedAt = '2026-09-15T11:30:00.000Z';

function evidence() {
  return {
    runtime: { ready: true, state: 'RUNTIME_EVIDENCE_READY', observedAt, evidenceRef: 'runtime:proof' },
    domains: [{ domainId: 'sender.example', ownerAuthorized: true, dnsAuthenticated: true, reputationHealthy: true, observedAt, evidenceRef: 'domain:proof' }],
    mailboxes: [{ mailboxId: 'm1', address: 'm1@sender.example', domainId: 'sender.example', egressRouteId: 'route1', authenticated: true, warmupStatus: 'WARMUP_COMPLETE', paused: false, observedColdDailyCap: 3, currentDailyCap: 3, remainingDailyCap: 3, observedColdHourlyCap: 3, observedHourlyCap: 3, usedToday: 0, minGapSeconds: 0, observedAt, evidenceRef: 'mailbox:proof' }],
    egressRoutes: [{ routeId: 'route1', ready: true, authorized: true, termsCompatible: true, observedColdDailyCap: 3, usedToday: 0, observedAt, evidenceRef: 'egress:proof' }],
    smtpRoutes: [{ routeId: 'route1', authorized: true, termsCompatible: true, authenticated: true, evidenceRef: 'smtp:proof', host: 'smtp.example', port: 587, secure: false, usernameEnv: 'SMTP_USER', passwordEnv: 'SMTP_PASS' }],
    recipientProviders: [
      { providerId: 'gmail', ready: true, observedDailyBudget: 2, usedToday: 0, observedAt, evidenceRef: 'provider:gmail' },
      { providerId: 'microsoft', ready: true, observedDailyBudget: 1, usedToday: 0, observedAt, evidenceRef: 'provider:microsoft' }
    ],
    campaign: { id: 'c1', authorized: true, dailyCeiling: 3, usedToday: 0, expiresAt: '2026-09-17T00:00:00.000Z', observedAt, evidenceRef: 'campaign:proof' },
    campaignAuthorization: { authorized: true, campaignId: 'c1', receiptId: 'campaign-auth', authorizedBy: 'founder', expiresAt: '2026-09-17T00:00:00.000Z' },
    genome: { policyVersion: 'g1' },
    policy: { businessHourStart: 9, businessHourEnd: 17, maxEvidenceAgeHours: 24 },
    outbound: { enabled: true, dryRun: false, globalPaused: false, uncertain: 0, workerOnline: true, schedulerActive: true, providerConfirmedToday: 0 }
  };
}

function record(i, providerId) {
  const address = `p${i}@example.com`;
  return {
    recipient: { id: `r${i}`, email: address, providerId, timeZone: 'America/New_York', accountKey: `a${i}`, verified: true, safeForOutreach: true, verificationEvidenceRef: `verify:${i}` },
    legal: { eligible: true, status: 'PASSED', evidenceId: `legal:${i}`, policyVersion: 'v1' },
    suppression: { checked: true, suppressed: false, unsubscribeRequested: false, unsubscribed: false },
    campaign: { id: 'c1' },
    message: { subject: `subject ${i}`, body: `body ${i}` },
    dispatchAuthorization: { authorized: true, receiptId: `auth${i}`, authorizedBy: 'founder', recipientEmail: address, campaignId: 'c1', expiresAt: '2026-09-17T23:00:00.000Z' }
  };
}

async function fixture({ corruptSecond = false } = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ub100k-artifacts-'));
  const candidatesPath = path.join(dir, 'candidates.ndjson');
  const evidencePath = path.join(dir, 'evidence.json');
  const corpusPath = path.join(dir, 'corpus.ndjson');
  const bundlePath = path.join(dir, 'bundle.json');
  const rows = [record(1, 'gmail'), record(2, 'gmail'), record(3, 'microsoft')];
  if (corruptSecond) rows[1].suppression.suppressed = true;
  await fs.writeFile(candidatesPath, rows.map(row => JSON.stringify(row)).join('\n') + '\n');
  await fs.writeFile(evidencePath, JSON.stringify(evidence(), null, 2));
  return { candidatesPath, evidencePath, corpusPath, bundlePath };
}

test('artifact preparer turns durable precleared inputs into canonical corpus and runtime bundle', async () => {
  const paths = await fixture();
  const result = await prepareOutreach100kArtifacts({ ...paths, target: 3, now: NOW });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.status, 'OUTREACH_100K_ARTIFACTS_PREPARED');
  assert.equal(result.compiledCandidateCount, 3);
  assert.equal(result.messagesSent, 0);
  assert.match(result.recipientSetDigest, /^sha256:/);
  const bundle = JSON.parse(await fs.readFile(paths.bundlePath, 'utf8'));
  assert.equal(bundle.recipientSetDigest, result.recipientSetDigest);
  const inspected = await inspectOutreach100kPacketCorpus({ filePath: paths.corpusPath, mailboxes: evidence().mailboxes, campaignId: 'c1', expectedCount: 3, now: NOW });
  assert.equal(inspected.ok, true, JSON.stringify(inspected));
});

test('artifact preparer fails closed when candidate inventory loses suppression eligibility', async () => {
  const paths = await fixture({ corruptSecond: true });
  const result = await prepareOutreach100kArtifacts({ ...paths, target: 3, now: NOW });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('insufficient-precleared-candidate-inventory'));
  await assert.rejects(fs.access(paths.corpusPath));
  await assert.rejects(fs.access(paths.bundlePath));
});
