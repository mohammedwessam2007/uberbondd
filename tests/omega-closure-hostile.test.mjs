// Attacks on the surfaces this merge decided.
//
// Every case here is a way a caller, a stale row or an over-eager lane could
// try to get a stronger answer than the evidence supports. They are written
// down rather than probed once, because a protection nothing attacks is a
// protection nobody notices losing.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync, accessSync, constants, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { classifyFounderAbsenceBlockers } from '../src/founder-absence-blocker-doctor.mjs';
import {
  buildFirstCashCanaryPacket,
  canaryDecision,
  compileFirstCashCanaryArtifact,
  CURRENT_CHAMPION_OFFER
} from '../src/first-cash-canary-packet.mjs';
import { compileDomainPurposePlan, evaluateDomainObservation } from '../src/domain-purpose-plan.mjs';
import { inspectModelProviderReadiness } from '../src/model-provider-doctor.mjs';
import { selectFreeRoute, liveUsableCapacity } from '../src/free-first-outreach-router.mjs';
import { LEAD_PATH_SPRINT_SKU } from '../src/lead-path-sprint-fulfillment.mjs';
import providerRegistry from '../artifacts/outreach/free-first-provider-registry-2026-09-01.json' with { type: 'json' };

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

const AT = '2026-09-02T00:00:00.000Z';
const GATEWAY_KEY = 'gateway-secret-do-not-print-8f3a91c4e7';

const gatewayEnv = (overrides = {}) => ({
  AI_GATEWAY_API_KEY: GATEWAY_KEY,
  AI_GATEWAY_AGENT_ENABLED: 'true',
  AI_GATEWAY_INPUT_USD_PER_MILLION: '1',
  AI_GATEWAY_OUTPUT_USD_PER_MILLION: '2',
  AI_GATEWAY_PRICING_SOURCE: 'official-gateway-pricing:test',
  AI_GATEWAY_PRICING_VERIFIED_AT: '2026-09-01T00:00:00.000Z',
  ...overrides
});

test('a software gap cannot hide an external blocker, and neither can hide the other', () => {
  const both = classifyFounderAbsenceBlockers({
    credentials: ['ai-gateway-key-missing'],
    softwareGaps: ['canon-drift']
  });
  // The credential is what a person has to act on, so it stays the headline.
  assert.equal(both.overall, 'CREDENTIAL_BLOCKED');
  // And the gap is not lost by being outranked.
  assert.deepEqual(both.softwareGaps, ['canon-drift']);
  assert.equal(both.ok, false, 'an open software gap reported ok');

  // Order of the groups is a dependency order, not a severity guess: a missing
  // credential is upstream of a missing account, which is upstream of payment.
  const many = classifyFounderAbsenceBlockers({
    credentials: ['a'], accounts: ['b'], payment: ['c'], distribution: ['d'], deliverability: ['e']
  });
  assert.equal(many.overall, 'CREDENTIAL_BLOCKED');
});

test('CODE_READY is unreachable without proof something actually ran unattended', () => {
  assert.equal(classifyFounderAbsenceBlockers({}).overall, 'ELAPSED_EVIDENCE_PENDING');

  // Each of these is the shape of a proof object that is missing exactly one
  // thing. None of them may be enough.
  const nearMisses = [
    { ok: true, reasonCodes: [], observationProof: {} },
    { ok: true, reasonCodes: ['stale-observation'], observationProof: { sourceCommit: 'abc' } },
    { ok: false, reasonCodes: [], observationProof: { sourceCommit: 'abc' } },
    { ok: true, observationProof: { sourceCommit: 'abc' } },
    { ok: true, reasonCodes: [], observationProof: { sourceCommit: '' } }
  ];
  for (const observationProof of nearMisses) {
    assert.equal(
      classifyFounderAbsenceBlockers({ observationProof }).overall,
      'ELAPSED_EVIDENCE_PENDING',
      `an incomplete observation proof reached CODE_READY: ${JSON.stringify(observationProof)}`
    );
  }

  // A complete proof does reach it, or the rule above would just be a way of
  // never answering.
  assert.equal(classifyFounderAbsenceBlockers({
    observationProof: { ok: true, reasonCodes: [], observationProof: { sourceCommit: 'abc123' } }
  }).overall, 'CODE_READY');

  // But not while software is still unfinished.
  assert.equal(classifyFounderAbsenceBlockers({
    observationProof: { ok: true, reasonCodes: [], observationProof: { sourceCommit: 'abc123' } },
    softwareGaps: ['canon-drift']
  }).overall, 'ELAPSED_EVIDENCE_PENDING');
});

test('the canary cap cannot be walked past by arithmetic', () => {
  // A count that is not a whole number of conversations is not a count.
  for (const bad of [1.5, NaN, Infinity, -0.5, '3.2']) {
    assert.equal(canaryDecision({ qualifiedConversationCount: bad, paidPilotCount: 0 }), 'INVALID',
      `a non-integer conversation count (${bad}) produced a decision`);
  }
  // More paid pilots than conversations did not happen.
  assert.equal(canaryDecision({ qualifiedConversationCount: 2, paidPilotCount: 3 }), 'INVALID');
  // Five is the allowance, so five with nothing paid is the decision point --
  // not the sixth, which would be one conversation past the doctrine.
  assert.equal(canaryDecision({ qualifiedConversationCount: 5, paidPilotCount: 0 }), 'KILL_OR_RETHINK');
  assert.equal(canaryDecision({ qualifiedConversationCount: 500, paidPilotCount: 0 }), 'KILL_OR_RETHINK');
  assert.equal(canaryDecision({ qualifiedConversationCount: 4, paidPilotCount: 0 }), 'CONTINUE');
});

test('contact needs every gate, and the packet cannot be argued into one', () => {
  const allButOne = {
    jurisdictionApproved: true,
    providerPurposeAllowed: true,
    contactProvenanceApproved: true,
    senderReady: true,
    authorityGranted: true,
    canaryOpen: false
  };
  const packet = buildFirstCashCanaryPacket({ gates: allButOne, qualifiedConversationCount: 1, paidPilotCount: 0 });
  assert.equal(packet.canContact, false, 'five of six gates opened contact');
  assert.equal(packet.businessEffectAuthority, 'NONE');
  assert.equal(packet.sku, LEAD_PATH_SPRINT_SKU);
  assert.equal(packet.offer, CURRENT_CHAMPION_OFFER);

  // Commercial truth is not an input. Whatever the caller claims, it is zero.
  const claimed = buildFirstCashCanaryPacket({
    gates: allButOne,
    commercialTruth: { realCustomers: 9, clearedRevenueUsd: 1000 },
    qualifiedConversationCount: 1
  });
  assert.deepEqual(claimed.commercialTruth, {
    realCustomers: 0, clearedRevenueUsd: 0, acceptedPaidDeliveries: 0, retainedCustomers: 0
  });
});

test('the delivery machine will not open for evidence this process can manufacture', () => {
  const artifact = compileFirstCashCanaryArtifact({});
  assert.equal(artifact.canonicalDeliveryRefusal.refused, true,
    'a synthetic payment truth opened a commercial sprint');
  assert.equal(artifact.canonicalDeliveryRefusal.sprintOpened, false);
  assert.ok(artifact.canonicalDeliveryRefusal.reasonCodes.length > 0);
  assert.equal(artifact.commercialDeliveryCount, 0);
  assert.equal(artifact.acceptedDeliveryCount, 0);
});

test('a plan cannot be drawn for a domain UberBond does not own', () => {
  assert.equal(compileDomainPurposePlan({ rootDomain: 'not-uberbond.example' }).ok, false);
  assert.equal(compileDomainPurposePlan({ rootDomain: '' }).ok, false);
  // A subdomain of an owned root is not itself a root to plan from.
  assert.equal(compileDomainPurposePlan({ rootDomain: 'send.uberbond.cloud' }).ok, false);

  // The dangerous shape: an owned root at the top, somebody else's host below.
  const smuggled = compileDomainPurposePlan({
    rootDomain: 'uberbond.agency',
    assignments: { OUTBOUND: 'send.attacker.example' }
  });
  assert.equal(smuggled.ok, false, 'an unowned host was planned under an owned root');
  assert.ok(smuggled.reasonCodes.some(code => code.startsWith('assignment-not-owned')));

  // A near-miss that only looks like the owned root.
  const lookalike = compileDomainPurposePlan({
    rootDomain: 'uberbond.agency',
    assignments: { OUTBOUND: 'send.uberbond.agency.attacker.example' }
  });
  assert.equal(lookalike.ok, false, 'a suffix lookalike was accepted as an owned host');
});

test('a record this system generated cannot become observed proof of itself', () => {
  const plan = compileDomainPurposePlan({ rootDomain: 'uberbond.agency' });
  const row = plan.rows.find(candidate => candidate.purpose === 'OUTBOUND');

  const selfConfirmed = evaluateDomainObservation({
    planRow: row,
    observation: { observedAt: '2026-09-01T23:00:00.000Z', status: 'GREEN', tlsVerified: true, generatedExpectedRecords: true },
    now: AT
  });
  assert.notEqual(selfConfirmed.state, 'VERIFIED', 'a generated expectation verified itself');
  assert.ok(selfConfirmed.reasonCodes.includes('generated-expectations-are-not-observed-proof'));

  // A green self-report with no provenance is still not a reading.
  const unprovenanced = evaluateDomainObservation({
    planRow: row,
    observation: { observedAt: '2026-09-01T23:00:00.000Z', status: 'GREEN', tlsVerified: true },
    now: AT
  });
  assert.notEqual(unprovenanced.state, 'VERIFIED');
  assert.ok(unprovenanced.reasonCodes.includes('observed-provenance-required-for-verification'));

  // An observation from the future is a clock problem, not evidence.
  const future = evaluateDomainObservation({
    planRow: row,
    observation: { observedAt: '2027-01-01T00:00:00.000Z', status: 'GREEN', provenance: 'OBSERVED_DNS' },
    now: AT
  });
  assert.ok(future.reasonCodes.includes('observation-is-future-dated'));
  assert.notEqual(future.state, 'VERIFIED');
});

test('no readiness surface returns the credential it was asked about', () => {
  const doctor = inspectModelProviderReadiness({ env: gatewayEnv() });
  const printed = JSON.stringify(doctor);
  assert.equal(printed.includes(GATEWAY_KEY), false, 'the doctor printed the API key');
  // The pricing evidence is not secret and should survive, or the report is
  // useless -- this asserts the redaction is targeted, not blanket.
  assert.equal(doctor.gateway.pricingEvidencePresent, true);

  // One lane is one lane. Nothing here may read as a chain with somewhere to go.
  assert.equal(doctor.failoverCapable, false);
  assert.equal(doctor.configuredProviderCount, 1);
  assert.equal(doctor.provenProviderCallCount, 0);
});

test('LIVE sending capacity cannot be conjured from an assertion', () => {
  const provider = providerRegistry.providers.find(row => row.id === 'resend-free');
  const forged = { 'resend-free': { configured: true, active: true, domainAuthenticated: true, providerHealthy: true } };

  for (const call of [
    () => selectFreeRoute({ purpose: 'COLD_B2B', providers: [provider], mode: 'LIVE', providerStates: forged, at: AT }),
    () => selectFreeRoute({ purpose: 'TRANSACTIONAL', providers: [provider], mode: 'LIVE', providerStates: forged, at: AT }),
    () => liveUsableCapacity({ providers: [provider], providerStates: forged, at: AT })
  ]) {
    const result = call();
    assert.equal(result.ok, false, 'asserted provider state opened a LIVE path');
    assert.ok(result.reasonCodes.includes('live-provider-states-must-be-derived-from-activation-receipts'));
  }

  // Supplying both sources is a second, separately named mistake.
  const ambiguous = selectFreeRoute({
    purpose: 'TRANSACTIONAL', providers: [provider], mode: 'LIVE',
    providerStates: forged, activationReceipts: [{ providerId: 'resend-free' }], at: AT
  });
  assert.equal(ambiguous.ok, false);
  assert.ok(ambiguous.reasonCodes.includes('provider-states-and-activation-receipts-are-mutually-exclusive'));

  // With nothing supplied at all, capacity is zero rather than the researched
  // pool. That zero is the honest headline number.
  const empty = liveUsableCapacity({ providers: [provider], activationReceipts: [], at: AT });
  assert.equal(empty.capacity30d ?? 0, 0, 'unactivated providers reported usable capacity');
});

test('canon freshness accepts the parent it must name, and nothing else', async () => {
  const { evaluateFounderAbsenceBlockers } = await import('../src/founder-absence-blocker-doctor.mjs');

  const HEAD = 'a'.repeat(40);
  const CANON = 'b'.repeat(40);
  const canonRow = [{
    id: 'canon-drift', subject: 'CODE', removability: 'SOFTWARE', owner: 'executor',
    title: 'canon names a SHA the tree no longer has',
    resolvedWhen: { sourceIncludesCurrentCommit: 'docs/CURRENT_SYSTEM_STATE.md' }
  }];

  const run = ({ namesHead, unchanged, canonCommit = CANON }) => evaluateFounderAbsenceBlockers({
    blockers: canonRow,
    currentSourceCommit: HEAD,
    canonCommit,
    probes: {
      fileExists: () => true,
      sourceIncludes: (_file, needle) => namesHead && needle === HEAD,
      sourceUnchangedSince: commit => unchanged && commit === CANON
    }
  }).softwareGaps;

  // An artifact committed into the tree it describes cannot name the commit
  // that contains it, so an exact-match-only rule reports a gap no work can
  // close -- and a permanently red row is one nobody reads.
  assert.deepEqual(run({ namesHead: false, unchanged: true }), [],
    'canon naming its parent, with only canon changed since, was called drifted');

  // Everything else still is drift.
  assert.deepEqual(run({ namesHead: false, unchanged: false }), ['canon-drift'],
    'source moved under canon and it was called fresh');
  assert.deepEqual(run({ namesHead: false, unchanged: true, canonCommit: null }), ['canon-drift'],
    'canon naming no commit at all was called fresh');

  // And naming the head exactly is fresh regardless of what the diff probe says.
  assert.deepEqual(run({ namesHead: true, unchanged: false }), []);

  // A caller supplying no probe gets the refusing default, not a free pass.
  assert.deepEqual(evaluateFounderAbsenceBlockers({
    blockers: canonRow, currentSourceCommit: HEAD, canonCommit: CANON,
    probes: { fileExists: () => true, sourceIncludes: () => false }
  }).softwareGaps, ['canon-drift'], 'a missing probe was treated as evidence of freshness');
});

// The evaluator tests above prove canon-drift reacts correctly to the probe's
// answer. They cannot prove the probe answers correctly, and the probe is where
// this row has now been loosened twice: first to accept canon naming its parent,
// then to ignore changes outside the source canon describes.
//
// The second loosening is the dangerous one. "Only canon moved" and "nothing
// that matters moved" are different rules, and the gap between them is every
// file in the repository that is not under src/, scripts/, config/ or
// migrations/. If the partition drifted wider, canon could sit stale across a
// real source change and the row would stay quiet.
test('the canon probe judges the source canon describes, and not the rest of the tree', async () => {
  const { describesSource } = await import('../scripts/founder-absence-doctor.mjs');

  for (const file of [
    'src/revenue.mjs',
    'scripts/mutation-war.mjs',
    'config/reachability-classification.json',
    'migrations/001_init.sql'
  ]) {
    assert.equal(describesSource(file), true,
      `${file} moving means canon describes a system that is no longer here`);
  }

  // Canon describing itself. Regenerating rewrites all three in one commit, so
  // counting them made the row impossible to satisfy.
  for (const file of [
    'docs/CURRENT_SYSTEM_STATE.md',
    'artifacts/system-readiness.json',
    'config/system-readiness-input.json'
  ]) {
    assert.equal(describesSource(file), false, `${file} is canon, not the source canon describes`);
  }

  // Prose. Canon makes no claim about it, so it cannot make canon false -- and
  // demanding it stand still made every documentation commit report drift.
  for (const file of ['docs/handoffs/anything.md', 'README.md', 'AGENTS.md']) {
    assert.equal(describesSource(file), false, `${file} is prose; canon does not describe it`);
  }

  // The exemption is exact paths inside the prefix, not the prefix itself.
  assert.equal(describesSource('config/system-readiness-input.json.bak'), true,
    'the exemption is three named files; nothing may extend one of them into a new one');
  assert.equal(describesSource('src/CURRENT_SYSTEM_STATE.md'), true,
    'a canon filename in a source directory is a source file');
});

test('the two canon checks cannot disagree about what counts as source', () => {
  // tests/canon-freshness.test.mjs and the absence doctor ask the same question
  // of the same tree. Two answers to one question is how a row goes quiet: the
  // suite stays green while the doctor reports a gap nobody can close, or worse,
  // the reverse.
  const doctor = readFileSync(join(repoRoot, 'scripts/founder-absence-doctor.mjs'), 'utf8');
  const freshness = readFileSync(join(repoRoot, 'tests/canon-freshness.test.mjs'), 'utf8');
  const prefix = /const CANON_RELEVANT_PREFIX = (\/\^\([^;]+\/);/;

  const inDoctor = doctor.match(prefix);
  const inFreshness = freshness.match(prefix);
  assert.ok(inDoctor && inFreshness, 'both must state the partition where it can be compared');
  assert.equal(inDoctor[1], inFreshness[1],
    'the doctor and the freshness test must partition the tree identically');
});

// And the probe itself, against real history. The partition test above proves
// the doctor knows which files matter; it says nothing about whether the probe
// consults it. A probe hardcoded to `true` would pass every test written so far
// and report canon fresh forever.
test('the canon probe reads git, and a real source change still makes canon stale', async () => {
  const { sourceUnchangedSince } = await import('../scripts/founder-absence-doctor.mjs');
  const git = args => {
    try {
      return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' }).trim();
    } catch { return null; }
  };

  const head = git(['rev-parse', 'HEAD']);
  if (!head) return; // no git here; the refusal cases below still hold

  assert.equal(sourceUnchangedSince(head), true,
    'nothing has changed between HEAD and itself, and the probe said otherwise');

  // The last commit that touched src/, minus one. Source demonstrably moved
  // between that commit and HEAD, so canon named there must read as stale.
  const lastSourceCommit = git(['log', '-n', '1', '--format=%H', '--', 'src/']);
  const before = lastSourceCommit && git(['rev-parse', '--verify', `${lastSourceCommit}^`]);
  if (before) {
    assert.equal(sourceUnchangedSince(before), false,
      'src/ changed between that commit and HEAD, and the probe called canon fresh');
  }

  // Refuses rather than assumes. An unreadable or malformed history is not
  // evidence that the source stood still.
  assert.equal(sourceUnchangedSince('not-a-sha'), false);
  assert.equal(sourceUnchangedSince(''), false);
  assert.equal(sourceUnchangedSince(null), false);
  assert.equal(sourceUnchangedSince('0'.repeat(40)), false,
    'a well-formed SHA naming no commit must refuse, not exempt');
});

// A skip is a refusal to claim, and it is only honest while it is unavoidable.
//
// The mutation war reported SKIPPED_NEEDS_BROWSER for CRAWL-01 on a machine with
// Chromium installed, because it read CHROMIUM_PATH and nothing in this
// repository sets it. In the summary line that skip was indistinguishable from
// one nothing could fix, so a guard went unexercised on hardware that could
// exercise it -- and the run still printed a clean "0 not killed".
//
// Detection closes that, and detection is exactly the kind of convenience that
// turns a refusal into a fabrication if it guesses.
test('the browser gate looks for a browser, and refuses to invent one', async () => {
  const { resolveChromium } = await import('../scripts/resolve-chromium.mjs');

  // A declared path is authoritative and still checked. A variable pointing at
  // nothing is a misconfiguration; treating it as proof of a browser would let
  // a skip be reported as a kill.
  assert.equal(resolveChromium({ CHROMIUM_PATH: '/nonexistent/chrome' }), '',
    'a declared path that is not an executable file must not count as a browser');
  assert.equal(resolveChromium({ CHROMIUM_PATH: '   ' }), resolveChromium({}),
    'a blank declaration is no declaration');

  // A directory is not an executable, and neither is a text file.
  assert.equal(resolveChromium({ CHROMIUM_PATH: repoRoot }), '',
    'a directory is not a browser');
  assert.equal(resolveChromium({ CHROMIUM_PATH: join(repoRoot, 'package.json') }), '',
    'a readable file that cannot be executed is not a browser');

  // Searching an empty tree finds nothing and says so, rather than falling back
  // to a plausible-looking path.
  const empty = mkdtempSync(join(tmpdir(), 'no-browser-'));
  try {
    const found = resolveChromium({ PLAYWRIGHT_BROWSERS_PATH: empty });
    // Only a genuinely installed system browser may answer here.
    if (found) {
      assert.ok(statSync(found).isFile(), 'anything returned must be a real file');
      assert.match(found, /^\/usr\/bin\//, 'an empty search tree may only fall through to a system path');
    }
  } finally {
    rmSync(empty, { recursive: true, force: true });
  }

  // And whatever it does return is executable, because the next thing that
  // happens to it is being handed to a test suite as CHROMIUM_PATH.
  const resolved = resolveChromium({});
  if (resolved) {
    assert.doesNotThrow(() => accessSync(resolved, constants.X_OK),
      'a resolved browser must be executable');
  }
});
