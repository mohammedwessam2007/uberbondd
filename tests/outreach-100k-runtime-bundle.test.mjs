import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { compileOutreach100kRuntimeBundle, writeOutreach100kRuntimeBundle } from '../src/outreach-100k-runtime-bundle.mjs';
import { compileOutreach100kPackets } from '../src/outreach-100k-packet-compiler.mjs';
import { materializeOutreach100kPacketCorpus } from '../src/outreach-100k-corpus-materializer.mjs';
import { prepareOutreach100kRuntime } from '../src/outreach-100k-runtime-control.mjs';

const NOW = new Date('2026-09-15T12:00:00.000Z');
const observedAt = '2026-09-15T11:30:00.000Z';

function fleetInput() {
  return {
    runtime: { ready: true, state: 'RUNTIME_EVIDENCE_READY', observedAt, evidenceRef: 'runtime:proof' },
    domains: [
      { domainId: 'sender.example', ownerAuthorized: true, dnsAuthenticated: true, reputationHealthy: true, observedAt, evidenceRef: 'domain:proof' }
    ],
    mailboxes: [
      { mailboxId: 'm1', address: 'm1@sender.example', domainId: 'sender.example', egressRouteId: 'r1', authenticated: true, warmupStatus: 'WARMUP_COMPLETE', paused: false, observedColdDailyCap: 3, observedColdHourlyCap: 3, usedToday: 0, minGapSeconds: 0, observedAt, evidenceRef: 'mailbox:proof' }
    ],
    egressRoutes: [
      { routeId: 'r1', ready: true, authorized: true, termsCompatible: true, observedColdDailyCap: 3, usedToday: 0, observedAt, evidenceRef: 'egress:proof' }
    ],
    smtpRoutes: [
      { routeId: 'r1', authorized: true, termsCompatible: true, authenticated: true, evidenceRef: 'smtp:proof', host: 'smtp.example', port: 587, secure: false, usernameEnv: 'SMTP_USER', passwordEnv: 'SMTP_PASS' }
    ],
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
  const email = `p${i}@example.com`;
  return {
    recipient: { id: `r${i}`, email, providerId, timeZone: 'America/New_York', accountKey: `a${i}`, verified: true, safeForOutreach: true, verificationEvidenceRef: `verify:${i}` },
    legal: { eligible: true, status: 'PASSED', evidenceId: `legal:${i}`, policyVersion: 'v1' },
    suppression: { checked: true, suppressed: false, unsubscribeRequested: false, unsubscribed: false },
    campaign: { id: 'c1' },
    message: { subject: `subject ${i}`, body: `body ${i}` },
    dispatchAuthorization: { authorized: true, receiptId: `auth${i}`, authorizedBy: 'founder', recipientEmail: email, campaignId: 'c1', expiresAt: '2026-09-17T23:00:00.000Z' }
  };
}

async function files() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ub100k-runtime-bundle-'));
  return { bundlePath: path.join(dir, 'bundle.json'), corpusPath: path.join(dir, 'corpus.ndjson') };
}

test('runtime bundle compiler preserves fresh observed fleet evidence', () => {
  const result = compileOutreach100kRuntimeBundle(fleetInput(), { now: NOW });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.bundle.mailboxes[0].mailboxId, 'm1');
  assert.equal(result.bundle.smtpRoutes[0].routeId, 'r1');
  assert.equal(result.bundle.campaignAuthorization.receiptId, 'campaign-auth');
  assert.match(result.bundleDigest, /^sha256:/);
  assert.equal(result.externalEffectsAuthorized, false);
});

test('runtime bundle refuses stale evidence and unknown route binding', () => {
  const input = fleetInput();
  input.domains[0].observedAt = '2026-09-10T00:00:00.000Z';
  input.mailboxes[0].egressRouteId = 'missing';
  const result = compileOutreach100kRuntimeBundle(input, { now: NOW });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.some(code => code.includes('fresh-evidence-required')));
  assert.ok(result.reasonCodes.some(code => code.includes('bound-egress-and-smtp-route-required')));
});

test('evidence bundle -> packet compiler -> corpus materializer -> runtime preparation', async () => {
  const { bundlePath, corpusPath } = await files();
  const compiledPackets = compileOutreach100kPackets([
    record(1, 'gmail'),
    record(2, 'gmail'),
    record(3, 'microsoft')
  ], { now: NOW });
  assert.equal(compiledPackets.ok, true, JSON.stringify(compiledPackets));

  const materialized = await materializeOutreach100kPacketCorpus({
    candidates: compiledPackets.packets,
    mailboxes: fleetInput().mailboxes.map(row => ({ ...row, ready: true, remainingDailyCap: 3, observedHourlyCap: 3 })),
    campaignId: 'c1',
    outputPath: corpusPath,
    target: 3,
    now: NOW
  });
  assert.equal(materialized.ok, true, JSON.stringify(materialized));

  const bundleInput = { ...fleetInput(), recipientSetDigest: materialized.recipientSetDigest };
  const written = await writeOutreach100kRuntimeBundle({ outputPath: bundlePath, ...bundleInput }, { now: NOW });
  assert.equal(written.ok, true, JSON.stringify(written));

  const prepared = await prepareOutreach100kRuntime({
    bundlePath,
    corpusPath,
    liveSummary: { workerOnline: true, schedulerActive: true, providerConfirmedToday: 0, outbound: { enabled: true, dryRun: false, globalPaused: false, uncertain: 0 } },
    now: NOW
  });
  assert.equal(prepared.ok, false, 'prepareOutreach100kRuntime must still enforce exact 100,000 target in production path');
  assert.ok((prepared.reasonCodes || prepared.corpus?.reasonCodes || []).some(code => String(code).includes('exact-count') || String(code).includes('100k-corpus-not-ready')));
});
