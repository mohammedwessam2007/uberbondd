import test from 'node:test';
import assert from 'node:assert/strict';
import { compileSenderFleetExpansionPlan as plan, STATEMENT_CLASSES as C, RAMP_STAGE_DAILY_CAP } from '../src/winnr-expansion-planner.mjs';

const NOW = new Date('2026-10-02T12:00:00Z');
const domains = n => Array.from({ length: n }, (_, i) => `send${i + 1}.example`);
const pilot = [
  { ordinal: 1, address: 'm1@cedar.example', smtpVerified: true, imapVerified: true, rampStage: 1 },
  { ordinal: 2, address: 'm2@cedar.example', smtpVerified: true, imapVerified: true, rampStage: 1 },
  { ordinal: 3, address: 'm3@cedar.example', smtpVerified: true, imapVerified: true, quarantined: true, quarantineReason: 'GMAIL_PLACEMENT_RED', rampStage: 0 }
];
const target = (patch = {}) => ({ mailboxes: 50, ownedDomains: domains(30), mailboxesPerDomainMax: 3, reservePoolFraction: 0.2, primaryBrandDomains: ['uberbond.example'], truthfulMailboxNames: ['mohamed', 'm.wessam', 'mohamed.w'], ...patch });
const run = (patch = {}) => plan({ observed: { entitlement: { plan: 'PILOT_3', mailboxLimit: 3, observedAt: '2026-10-02', source: 'provider-export' }, mailboxes: pilot, domains: [] }, target: target(), now: NOW, ...patch });

test('observed pilot capacity is measured from green mailboxes at their evidence-earned ramp cap; the quarantined ordinal contributes zero', () => {
  const p = run();
  assert.equal(p.capacity.currentEvidenceCapacityPerDay, 2 * RAMP_STAGE_DAILY_CAP[1]);
  assert.equal(p.capacity.greenMailboxes, 2);
  assert.equal(p.capacity.quarantinedMailboxes, 1);
  assert.equal(p.capacity.providerMaximumIsNotASafeSendRate, true);
  assert.equal(p.capacity.domainCountIsNotSendAuthority, true);
  assert.ok(p.capacity.plannedFullRampPerDay > p.capacity.currentEvidenceCapacityPerDay, 'planned capacity is reported separately and never becomes the cap');
});

test('quality caps bound ramp caps; a lower evidence cap wins over the ramp stage', () => {
  const p = plan({ observed: { entitlement: null, mailboxes: [{ address: 'a@x.example', smtpVerified: true, rampStage: 3, qualityCapPerDay: 4 }], domains: [] }, target: target({ mailboxes: 0 }), now: NOW });
  assert.equal(p.capacity.currentEvidenceCapacityPerDay, 4);
});

test('the 50-mailbox / 30-domain topology spreads risk: a reserve pool is never allocated and no domain exceeds the per-domain maximum', () => {
  const p = run();
  assert.equal(p.topology.reserveDomains.length, 6);
  assert.equal(p.topology.activeDomains.length, 24);
  assert.equal(p.topology.activeDomains.reduce((s, d) => s + d.mailboxes, 0), 50);
  assert.ok(p.topology.activeDomains.every(d => d.mailboxes <= 3));
  assert.ok(Math.max(...p.topology.activeDomains.map(d => d.mailboxes)) - Math.min(...p.topology.activeDomains.map(d => d.mailboxes)) <= 1, 'even spread');
  const reserve = new Set(p.topology.reserveDomains);
  assert.ok(p.topology.activeDomains.every(d => !reserve.has(d.domain)));
});

test('the primary brand domain is refused even if supplied, and is never allocated mailboxes', () => {
  // The brand domain is listed FIRST so that, were it not excluded, it would land in the active pool.
  const p = run({ target: target({ ownedDomains: ['uberbond.example', ...domains(30)] }) });
  assert.ok(p.refusals.includes('primary-brand-domain-never-used-for-cold-volume:uberbond.example'));
  assert.ok(!JSON.stringify(p.topology.activeDomains).includes('uberbond.example'));
});

test('a topology that cannot meet the target within the per-domain limit is a blocker, not a silent over-pack', () => {
  const p = run({ target: target({ ownedDomains: domains(10) }) });
  assert.ok(p.blockers.some(b => b.startsWith('topology-cannot-meet-target')));
  assert.ok(p.topology.activeDomains.every(d => d.mailboxes <= 3));
});

test('no invented identities: without a truthful mailbox name scheme the plan is blocked', () => {
  const p = run({ target: target({ truthfulMailboxNames: [] }) });
  assert.ok(p.blockers.includes('truthful-mailbox-name-scheme-required'));
});

test('the quarantined sender is held, not replaced; replacement requires an explicit retirement decision', () => {
  const held = run();
  const q = held.quarantine[0];
  assert.equal(q.address, 'm3@cedar.example');
  assert.equal(q.capacityContribution, 0);
  assert.equal(q.disposition, 'HOLD_QUARANTINED_NO_AUTOMATIC_REPLACEMENT');
  assert.equal(q.replacementAllowed, false);
  const retired = run({ retirementDecisions: [{ address: 'm3@cedar.example', ref: 'founder-decision-1' }] });
  assert.equal(retired.quarantine[0].replacementAllowed, true);
  assert.equal(retired.quarantine[0].disposition, 'RETIRE_PER_EXPLICIT_DECISION');
  assert.equal(run({ retirementDecisions: [{ address: 'm3@cedar.example' }] }).quarantine[0].replacementAllowed, false, 'a decision without a reference is not a decision');
});

test('entitlement is observed, never assumed: unobserved or insufficient entitlement blocks expansion', () => {
  assert.ok(plan({ observed: { mailboxes: pilot }, target: target(), now: NOW }).blockers.includes('provider-entitlement-unobserved'));
  assert.ok(run().blockers.some(b => b.startsWith('provider-entitlement-insufficient')));
  const covered = run({ observed: { entitlement: { plan: 'STARTUP_50', mailboxLimit: 50, observedAt: '2026-10-02' }, mailboxes: pilot, domains: [] } });
  assert.ok(!covered.blockers.some(b => b.startsWith('provider-entitlement')));
});

test('PLAN / AUTHORIZED / OBSERVED never blur: with no authorization every mutating step is PLAN, nothing is performed, spend is zero', () => {
  const p = run();
  for (const step of p.steps.filter(s => s.mutates)) assert.equal(step.class, C.PLAN);
  assert.equal(p.authorizedExternalMutations.length, 0);
  assert.equal(p.externalMutationsPerformed, 0);
  assert.equal(p.providerCalls, 0);
  assert.equal(p.spend, 0);
  assert.equal(p.sendAuthority, false);
  assert.equal(p.observedState.class, C.OBSERVED_PROVIDER_STATE);
  assert.equal(p.topology.class, C.PLAN);
  assert.equal(p.observedState.mailboxCount, 3, 'planned mailboxes never appear as observed ones');
});

test('an authorization counts only for the exact action AND exact plan digest, unexpired and referenced; none is inferred', () => {
  const base = run();
  const digest = base.planDigest;
  const ok = { action: 'PURCHASE_PLAN', planDigest: digest, ref: 'founder-spend-1', expiresAt: '2026-10-03T00:00:00Z' };
  const authorized = run({ authorizations: [ok] });
  assert.deepEqual(authorized.authorizedExternalMutations, [{ action: 'PURCHASE_PLAN', authorizationRef: 'founder-spend-1' }]);
  assert.equal(authorized.steps.find(s => s.action === 'CREATE_MAILBOXES').class, C.PLAN, 'other mutating steps stay PLAN');
  for (const bad of [{ ...ok, planDigest: 'f'.repeat(64) }, { ...ok, expiresAt: '2026-10-01T00:00:00Z' }, { ...ok, ref: '' }, { ...ok, action: 'WRITE_DNS_ALL' }, { ...ok, planDigest: undefined }]) {
    assert.equal(run({ authorizations: [bad] }).authorizedExternalMutations.length, 0, JSON.stringify(bad));
  }
  assert.equal(run({ target: target({ mailboxes: 40 }), authorizations: [ok] }).authorizedExternalMutations.length, 0, 'an authorization does not survive a change to the plan');
});

test('every mutating step declares reversibility and a rollback; DNS is planned, never written', () => {
  const p = run();
  for (const step of p.steps) { assert.equal(typeof step.reversible, 'boolean'); assert.ok(step.rollback); }
  assert.ok(p.steps.some(s => s.action === 'WRITE_DNS' && s.mutates && s.class === C.PLAN));
  assert.equal(p.steps.find(s => s.action === 'PURCHASE_PLAN').reversible, false);
});

test('expansion is recommended only when capacity is demonstrably the bottleneck', () => {
  assert.equal(run().expansionDecision.capacityIsBinding, null);
  assert.equal(run().expansionDecision.expansionRecommended, false);
  const slack = run({ demand: { eligibleProspectsPerDay: 2 } });
  assert.equal(slack.expansionDecision.capacityIsBinding, false);
  assert.equal(slack.expansionDecision.expansionRecommended, false);
  assert.match(slack.expansionDecision.reason, /solve nothing/);
  const binding = run({ demand: { eligibleProspectsPerDay: 80 } });
  assert.equal(binding.expansionDecision.capacityIsBinding, true);
  assert.equal(binding.expansionDecision.expansionRecommended, true);
  assert.equal(binding.expansionDecision.purchaseRequiresExplicitFounderSpendAuthority, true);
  const noCapacity = plan({ observed: { mailboxes: [pilot[2]], entitlement: null, domains: [] }, target: target(), demand: { eligibleProspectsPerDay: 80 }, now: NOW });
  assert.equal(noCapacity.expansionDecision.expansionRecommended, false, 'no green mailbox: expansion is never the fix for a reputation problem');
});

test('new mailboxes start at ramp stage 0 with a zero cap, and the plan is deterministic', () => {
  const a = run(); const b = run();
  assert.equal(a.planDigest, b.planDigest);
  const create = a.steps.find(s => s.action === 'CREATE_MAILBOXES');
  assert.equal(create.detail.startingRampStage, 0);
  assert.equal(create.detail.startingCapPerDay, 0);
  assert.match(a.steps.find(s => s.action === 'IMPORT_CREDENTIALS').detail.storage, /never plaintext/);
});
