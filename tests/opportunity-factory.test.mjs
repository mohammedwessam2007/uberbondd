import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { sha256 } from '../src/omnia-v9/canonical.mjs';
import {
  buildOpportunityFunnel,
  compileCanaryProspectDraft,
  compileOpportunityPacket,
  evaluateOpportunity,
  normalizeOpportunity,
  normalizeOpportunityAssets,
  normalizeOpportunityProfile,
  OpportunityFactoryError,
  scoreOpportunityFit,
  transitionOpportunityState
} from '../src/opportunity-factory.mjs';

const execFileAsync = promisify(execFile);

const NOW = new Date('2026-08-10T12:00:00.000Z');
const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

const assets = [
  {
    id: 'resume', kind: 'RESUME', label: 'Truthful resume', digest: HASH_A,
    status: 'VERIFIED_PRESENT', observedAt: '2026-08-10T10:00:00.000Z'
  },
  {
    id: 'portfolio', kind: 'PORTFOLIO', label: 'Selected work', digest: HASH_B,
    status: 'VERIFIED_PRESENT', observedAt: '2026-08-10T10:00:00.000Z'
  }
];

const profile = {
  schemaVersion: 'uberbond.opportunity-profile.v1',
  id: 'mohamed-wessam',
  relevantExperienceYears: 1,
  languages: ['en', 'ar'],
  residenceCountry: 'EG',
  b2bContractStatus: 'VERIFIED',
  b2bEvidenceDigest: HASH_A,
  claims: [
    {
      id: 'structured-qa', status: 'EVIDENCED',
      text: 'Structured public-site QA and release-readiness reporting',
      evidenceAssetIds: ['portfolio']
    },
    {
      id: 'medical-domain', status: 'EVIDENCED',
      text: 'Medical-domain familiarity', evidenceAssetIds: ['resume']
    },
    {
      id: 'senior-wordpress', status: 'PROHIBITED',
      text: 'Senior WordPress/PHP specialist', evidenceAssetIds: []
    }
  ],
  prohibitedPhrases: ['senior wordpress specialist', 'guaranteed conversions', 'paid client results']
};

function opportunity(overrides = {}) {
  return {
    schemaVersion: 'uberbond.opportunity.v1',
    id: 'opp-agency-qa',
    organization: 'Example Agency',
    organizationDomain: 'agency.example',
    title: 'Freelance website QA collaborator',
    sourceUrl: 'https://agency.example/careers/freelancers',
    sourceExcerpt: 'We invite independent website quality-assurance collaborators to submit an application.',
    sourceObservedAt: '2026-08-10T10:00:00.000Z',
    sourceExpiresAt: '2026-08-17T10:00:00.000Z',
    jurisdiction: 'CA',
    routeType: 'SOLICITED_APPLICATION',
    permissionScope: 'CONTRACTOR_APPLICATION',
    submissionMechanism: 'EMAIL',
    recipientEmail: 'careers@agency.example',
    recipientName: 'Hiring team',
    subject: 'Freelance website QA collaborator',
    body: 'Hello, I focus on structured public-site QA and release-readiness reporting. I can share truthful selected work for review.',
    requirements: [
      { id: 'resume-required', kind: 'REQUIRED_ASSET', mandatory: true, value: 'resume', note: 'Official page asks for a resume.' },
      { id: 'qa-required', kind: 'REQUIRED_CLAIM', mandatory: true, value: 'structured-qa', note: 'QA is explicit.' },
      { id: 'global', kind: 'RESIDENCE_COUNTRY', mandatory: true, value: ['GLOBAL'], note: 'Remote worldwide.' }
    ],
    fitSignals: {
      qaExplicit: true,
      freelanceExplicit: true,
      remoteExplicit: true,
      agencyContext: true,
      websiteScopeExplicit: true,
      medicalContext: true,
      fixedDiagnosticFit: true,
      estimatedDecisionDays: 7,
      applicationMinutes: 20
    },
    requiredAssetIds: ['resume', 'portfolio'],
    claimIds: ['structured-qa', 'medical-domain'],
    strategyLane: 'DIAGNOSTIC_WEDGE',
    notes: 'Fixture only; no live recipient.',
    ...overrides
  };
}

function evaluate(overrides = {}, options = {}) {
  return evaluateOpportunity({
    opportunity: opportunity(overrides),
    profile: options.profile || profile,
    assets: options.assets || assets,
    tombstones: options.tombstones || [],
    now: options.now || NOW
  });
}

test('opportunity input is closed, source-bound, and rejects caller-supplied scores', () => {
  assert.throws(
    () => normalizeOpportunity(opportunity({ score: 100 })),
    error => error instanceof OpportunityFactoryError && error.code === 'UNKNOWN_FIELD'
  );
  assert.throws(
    () => normalizeOpportunity(opportunity({ sourceUrl: 'https://unrelated.example/jobs/1' })),
    error => error.code === 'SOURCE_AUTHORITY_MISMATCH'
  );
  assert.throws(
    () => normalizeOpportunity(opportunity({ sourceExcerpt: 'short' })),
    error => error.code === 'SOURCE_EXCERPT_EMPTY'
  );
});

test('transparent score is recomputed from bounded signals', () => {
  const normalized = normalizeOpportunity(opportunity());
  const score = scoreOpportunityFit(normalized);
  assert.equal(score.total, 95);
  assert.equal(score.components.qaExplicit, 20);
  assert.equal(score.methodology, 'uberbond.opportunity-score.v1');
});

test('a current exact solicited email route becomes owner-review ready, never send-ready', () => {
  const result = evaluate();
  assert.equal(result.decision, 'READY_FOR_OWNER_REVIEW');
  assert.equal(result.externalActionAuthorized, false);
  assert.match(result.nextAction, /Owner reviews/);
});

test('an official manual form can be prepared without inventing an email recipient', () => {
  const result = evaluate({
    submissionMechanism: 'MANUAL_FORM',
    recipientEmail: '',
    subject: '',
    permissionScope: 'JOB_APPLICATION'
  });
  assert.equal(result.decision, 'READY_FOR_OWNER_REVIEW');
  assert.match(result.nextAction, /manually submits/);
});

test('recipient, domain, source, or exact-message history blocks a new initial application', () => {
  const bodyDigest = sha256(opportunity().body);
  const result = evaluate({}, {
    tombstones: [{
      id: 'contacted-1', organizationDomain: 'agency.example',
      recipientEmail: 'careers@agency.example',
      sourceUrl: 'https://agency.example/careers/freelancers',
      contactedAt: '2026-08-09T12:00:00.000Z', status: 'SENT',
      messageDigest: bodyDigest, threadId: 'thread-1', note: 'Known contact'
    }]
  });
  assert.equal(result.decision, 'BLOCKED_PRIOR_CONTACT');
  assert.deepEqual(result.priorContact.match, ['organization-domain', 'recipient-email', 'source-url', 'message-digest']);
  assert.equal(result.externalActionAuthorized, false);
});

test('expired, future, and stale evidence is blocked before fit scoring can authorize work', () => {
  assert.equal(evaluate({
    sourceObservedAt: '2026-08-01T10:00:00.000Z',
    sourceExpiresAt: '2026-08-09T10:00:00.000Z'
  }).decision, 'BLOCKED_SOURCE_RECHECK');
  assert.equal(evaluate({
    sourceObservedAt: '2026-08-10T13:00:00.000Z',
    sourceExpiresAt: '2026-08-17T13:00:00.000Z'
  }).decision, 'BLOCKED_SOURCE_RECHECK');
  assert.equal(evaluate({
    sourceObservedAt: '2026-08-01T10:00:00.000Z',
    sourceExpiresAt: '2026-08-20T10:00:00.000Z'
  }).decision, 'BLOCKED_SOURCE_RECHECK');
});

test('hard experience and language mismatches are rejected without embellishment', () => {
  const result = evaluate({
    requirements: [
      { id: 'years', kind: 'MIN_RELEVANT_YEARS', mandatory: true, value: 3, note: '' },
      { id: 'croatian', kind: 'REQUIRED_LANGUAGE', mandatory: true, value: 'hr', note: '' }
    ]
  });
  assert.equal(result.decision, 'REJECT_REQUIREMENT_MISMATCH');
  assert(result.reasons.some(reason => reason.startsWith('years:')));
  assert(result.reasons.some(reason => reason.startsWith('croatian:')));
});

test('unverified B2B legal ability is an external hold, not a guessed pass', () => {
  const heldProfile = { ...profile, b2bContractStatus: 'UNVERIFIED' };
  const result = evaluate({
    requirements: [{ id: 'b2b', kind: 'B2B_LEGAL_ABILITY', mandatory: true, value: 'VERIFIED', note: '' }]
  }, { profile: heldProfile });
  assert.equal(result.decision, 'HOLD_EXTERNAL_REQUIREMENT');
  assert.deepEqual(result.reasons, ['b2b:b2b-contract-status-unverified']);
  assert.throws(
    () => normalizeOpportunityProfile({ ...profile, b2bEvidenceDigest: '' }),
    error => error.code === 'B2B_EVIDENCE_REQUIRED'
  );
});

test('missing, broken, or stale required assets hold the packet', () => {
  for (const status of ['MISSING', 'BROKEN', 'STALE']) {
    const changed = assets.map(asset => asset.id === 'portfolio' ? { ...asset, status } : asset);
    const result = evaluate({}, { assets: changed });
    assert.equal(result.decision, 'HOLD_MATERIALS');
    assert(result.reasons.includes('asset-not-ready:portfolio'));
  }
});

test('unproven claims and prohibited phrases are rejected before packet compilation', () => {
  assert.equal(evaluate({ claimIds: ['senior-wordpress'] }).decision, 'REJECT_CLAIM_RISK');
  assert.equal(evaluate({ body: 'I am a senior WordPress specialist with guaranteed conversions.' }).decision, 'REJECT_CLAIM_RISK');
});

test('low-fit opportunities do not consume owner review time', () => {
  const result = evaluate({
    fitSignals: {
      qaExplicit: false,
      freelanceExplicit: false,
      remoteExplicit: false,
      agencyContext: false,
      websiteScopeExplicit: false,
      medicalContext: false,
      fixedDiagnosticFit: false,
      estimatedDecisionDays: 365,
      applicationMinutes: 300
    }
  });
  assert.equal(result.decision, 'HOLD_LOW_PRIORITY');
  assert.equal(result.score.total, 9);
});

test('packet compilation binds source, message, claims, and asset digests', () => {
  const input = opportunity();
  const evaluation = evaluate();
  const packet = compileOpportunityPacket({ opportunity: input, evaluation, profile, assets });
  assert.equal(packet.approvalStatus, 'NOT_REQUESTED');
  assert.equal(packet.externalActionAuthorized, false);
  assert.equal(packet.assets.length, 2);
  assert.match(packet.packetDigest, /^[a-f0-9]{64}$/);

  const claimBoundInput = opportunity({ requiredAssetIds: ['resume'] });
  const claimBoundEvaluation = evaluate({ requiredAssetIds: ['resume'] });
  const claimBoundPacket = compileOpportunityPacket({
    opportunity: claimBoundInput,
    evaluation: claimBoundEvaluation,
    profile,
    assets
  });
  assert.deepEqual(claimBoundPacket.assets.map(asset => asset.id).sort(), ['portfolio', 'resume']);

  assert.throws(
    () => compileOpportunityPacket({ opportunity: { ...input, body: `${input.body} changed` }, evaluation, profile, assets }),
    error => error.code === 'EVALUATION_DIGEST_MISMATCH'
  );
  const swappedAssets = assets.map(asset => asset.id === 'portfolio' ? { ...asset, digest: 'c'.repeat(64) } : asset);
  assert.throws(
    () => compileOpportunityPacket({ opportunity: input, evaluation, profile, assets: swappedAssets }),
    error => error.code === 'EVALUATION_REGISTRY_MISMATCH'
  );
  const changedProfile = {
    ...profile,
    claims: profile.claims.map(claim => claim.id === 'structured-qa' ? { ...claim, text: `${claim.text} changed` } : claim)
  };
  assert.throws(
    () => compileOpportunityPacket({ opportunity: input, evaluation, profile: changedProfile, assets }),
    error => error.code === 'EVALUATION_REGISTRY_MISMATCH'
  );
});

test('email compilation creates only an owner-review prospect with no approval', () => {
  const input = opportunity();
  const evaluation = evaluate();
  const draft = compileCanaryProspectDraft({
    opportunity: input,
    evaluation,
    profile,
    assets,
    campaignId: 'campaign-1',
    inbox: 'A',
    unsubscribeUrl: 'https://uberbond.example/unsubscribe/tok',
    now: NOW
  });
  assert.equal(draft.status, 'owner-review');
  assert.equal(draft.outreachApproval, null);
  assert.equal(draft.externalActionAuthorized, false);
  assert.equal(draft.contact.email, 'careers@agency.example');
  assert.equal(draft.outreachRoute.routeType, 'SOLICITED_APPLICATION');
});

test('manual forms and platforms cannot be converted into Gmail prospects', () => {
  const input = opportunity({ submissionMechanism: 'MANUAL_FORM', recipientEmail: '', subject: '' });
  const evaluation = evaluate({ submissionMechanism: 'MANUAL_FORM', recipientEmail: '', subject: '' });
  assert.throws(
    () => compileCanaryProspectDraft({ opportunity: input, evaluation, profile, assets, campaignId: 'campaign-1', now: NOW }),
    error => error.code === 'MANUAL_ROUTE_ONLY'
  );
});

test('state transitions require owner authority and external evidence at consequence states', () => {
  assert.throws(
    () => transitionOpportunityState({ currentState: 'READY_FOR_OWNER_REVIEW', nextState: 'OWNER_APPROVED_PREPARATION', actorKind: 'SYSTEM' }),
    error => error.code === 'OWNER_AUTHORITY_REQUIRED'
  );
  assert.deepEqual(
    transitionOpportunityState({ currentState: 'READY_FOR_OWNER_REVIEW', nextState: 'OWNER_APPROVED_PREPARATION', actorKind: 'OWNER' }),
    { currentState: 'READY_FOR_OWNER_REVIEW', nextState: 'OWNER_APPROVED_PREPARATION', actorKind: 'OWNER', evidenceDigest: '' }
  );
  assert.throws(
    () => transitionOpportunityState({ currentState: 'EXTERNAL_SUBMISSION_PENDING', nextState: 'SUBMITTED', actorKind: 'OWNER' }),
    error => error.code === 'EXTERNAL_EVIDENCE_REQUIRED'
  );
  assert.throws(
    () => transitionOpportunityState({ currentState: 'DISCOVERED', nextState: 'PAID_DIAGNOSTIC', actorKind: 'OWNER', evidenceDigest: HASH_A }),
    error => error.code === 'STATE_TRANSITION_INVALID'
  );
});

test('funnel counts revenue only from receipt-backed cleared-payment evidence', () => {
  const events = [
    { id: 'e1', opportunityId: 'o1', eventType: 'DISCOVERED', occurredAt: NOW.toISOString(), valueUsd: 0, receiptDigest: '' },
    { id: 'e2', opportunityId: 'o1', eventType: 'OWNER_REVIEWED', occurredAt: NOW.toISOString(), valueUsd: 0, receiptDigest: '' },
    { id: 'e3', opportunityId: 'o1', eventType: 'SUBMITTED', occurredAt: NOW.toISOString(), valueUsd: 0, receiptDigest: HASH_A },
    { id: 'e4', opportunityId: 'o1', eventType: 'REPLIED', occurredAt: NOW.toISOString(), valueUsd: 0, receiptDigest: HASH_A },
    { id: 'e5', opportunityId: 'o1', eventType: 'PAYMENT_CLEARED', occurredAt: NOW.toISOString(), valueUsd: 250, receiptDigest: HASH_B },
    { id: 'e6', opportunityId: 'o2', eventType: 'PAYMENT_CLEARED', occurredAt: NOW.toISOString(), valueUsd: 999, receiptDigest: '' }
  ];
  const funnel = buildOpportunityFunnel(events);
  assert.equal(funnel.paid, 1);
  assert.equal(funnel.revenueUsd, 250);
  assert.equal(funnel.recommendation, 'CONTINUE_BOUNDED');
  assert.equal(funnel.automaticVolumeIncreaseAuthorized, false);

  const duplicateSameReceipt = buildOpportunityFunnel([
    ...events,
    { id: 'e7', opportunityId: 'o1', eventType: 'PAYMENT_CLEARED', occurredAt: NOW.toISOString(), valueUsd: 250, receiptDigest: HASH_B }
  ]);
  assert.equal(duplicateSameReceipt.revenueUsd, 250);
  assert.throws(
    () => buildOpportunityFunnel([
      ...events,
      { id: 'e8', opportunityId: 'o2', eventType: 'PAYMENT_CLEARED', occurredAt: NOW.toISOString(), valueUsd: 999, receiptDigest: HASH_B }
    ]),
    error => error.code === 'EVENT_RECEIPT_CONFLICT'
  );
});

test('profile and asset registries are closed and reject malformed identities', () => {
  assert.throws(
    () => normalizeOpportunityProfile({ ...profile, magic: true }),
    error => error.code === 'UNKNOWN_FIELD'
  );
  assert.throws(
    () => normalizeOpportunityAssets([{ ...assets[0], digest: 'not-a-digest' }]),
    error => error.code === 'ASSET_RECORD_INVALID'
  );
  assert.throws(
    () => normalizeOpportunityAssets([{ ...assets[0], observedAt: 'not-a-date' }]),
    error => error.code === 'ASSET_RECORD_INVALID'
  );
});

test('claim evidence assets and contact tombstones fail closed when malformed or missing', () => {
  const missingClaimEvidence = {
    ...profile,
    claims: profile.claims.map(claim => claim.id === 'structured-qa'
      ? { ...claim, evidenceAssetIds: ['missing-evidence-asset'] }
      : claim)
  };
  const missingEvidenceResult = evaluate({}, { profile: missingClaimEvidence });
  assert.equal(missingEvidenceResult.decision, 'HOLD_MATERIALS');
  assert(missingEvidenceResult.reasons.includes('asset-not-ready:missing-evidence-asset'));

  const malformedTombstone = [{
    id: 'bad', organizationDomain: '', recipientEmail: '', sourceUrl: '',
    contactedAt: 'not-a-date', status: 'SENT', messageDigest: '', threadId: '', note: ''
  }];
  const result = evaluate({}, { tombstones: malformedTombstone });
  assert.equal(result.decision, 'REJECT_INVALID');
  assert(result.reasons[0].startsWith('TOMBSTONE_RECORD_INVALID:'));
});

test('the live seed preserves the exact edited Innovate By Day body as a prior-contact tombstone', async () => {
  const register = JSON.parse(await fs.readFile(new URL('../data/opportunity-factory/seed-register.json', import.meta.url), 'utf8'));
  const innovate = register.opportunities.find(item => item.id === 'opp-innovate-by-day-2026-08-10');
  const tombstone = register.tombstones.find(item => item.id === 'innovate-by-day-exact-edited-message');
  assert.equal(sha256(innovate.body), 'c3f8015ebba1ed3c93327ce8aff243efdc9198d91e811384eed5a5fa3158473a');
  assert.equal(tombstone.messageDigest, sha256(innovate.body));
  assert.equal(tombstone.recipientEmail, 'careers@innovatebyday.ca');
  assert.match(innovate.body, /I can share a truthful demonstration report and relevant website work for review\./);
  const evaluation = evaluateOpportunity({
    opportunity: innovate,
    profile: register.profile,
    assets: register.assets,
    tombstones: register.tombstones,
    now: new Date(register.asOf)
  });
  assert.equal(evaluation.decision, 'BLOCKED_PRIOR_CONTACT');
});

test('the opportunity compiler contains no network or provider-send client', async () => {
  const source = await fs.readFile(new URL('../src/opportunity-factory.mjs', import.meta.url), 'utf8');
  for (const forbidden of [/\bfetch\s*\(/, /\baxios\b/, /\bgoogleapis\b/, /\bsendMail\s*\(/, /createTransport\s*\(/]) {
    assert.equal(forbidden.test(source), false, `forbidden effect client matched ${forbidden}`);
  }
});

test('seed dry run is deterministic and materializes no packet while external gates remain red', async () => {
  const first = await fs.mkdtemp(path.join(os.tmpdir(), 'uberbond-opportunity-first-'));
  const second = await fs.mkdtemp(path.join(os.tmpdir(), 'uberbond-opportunity-second-'));
  try {
    const script = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../scripts/opportunity-factory-dry-run.mjs');
    await execFileAsync(process.execPath, [script, '--output', first], { cwd: path.resolve(path.dirname(new URL(import.meta.url).pathname), '..') });
    await execFileAsync(process.execPath, [script, '--output', second], { cwd: path.resolve(path.dirname(new URL(import.meta.url).pathname), '..') });
    const [left, right] = await Promise.all([
      fs.readFile(path.join(first, 'DRY_RUN_REPORT.json'), 'utf8'),
      fs.readFile(path.join(second, 'DRY_RUN_REPORT.json'), 'utf8')
    ]);
    assert.equal(left, right);
    const report = JSON.parse(left);
    assert.equal(report.totalOpportunities, 7);
    assert.equal(report.packets.length, 0);
    assert.equal(report.canaryDrafts.length, 0);
    assert.equal(report.externalActionLedger.externalActionAuthorized, false);
    assert(report.evaluations.every(item => item.externalActionAuthorized === false));
  } finally {
    await Promise.all([fs.rm(first, { recursive: true, force: true }), fs.rm(second, { recursive: true, force: true })]);
  }
});
