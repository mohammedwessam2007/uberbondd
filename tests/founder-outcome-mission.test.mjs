import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  classifyFounderOutcomeIntent,
  compileFounderOutcomeMission,
  evaluateFounderOutcomeMission,
  compileFounderEconomicPulsePlan
} from '../src/founder-outcome-mission.mjs';

const now = new Date('2026-09-10T23:32:00.000Z'); // 02:32 Cairo Sep 11
const command = 'From now until 12:00 PM Africa/Cairo today, make me as much money as legally and truthfully possible while I sleep. New spend ceiling is $0. PayPal.me/Sarawessam';
const structuredObservation = (throughAt, over = {}) => ({
  clearedContributionProfitCents: 0,
  providerOrigin: true,
  reconciled: true,
  independentVerification: true,
  evidenceClass: 'PROVIDER_ORIGIN_RECONCILIATION',
  throughAt,
  evidenceRefs: ['receipt://paypal-reconciliation/observed-zero'],
  environment: 'LIVE',
  ...over
});

test('natural founder revenue command compiles into an active mission instead of terminal prose', () => {
  assert.equal(classifyFounderOutcomeIntent(command).recognized, true);
  const mission = compileFounderOutcomeMission({ founderIntent:command, now, timezoneOffsetMinutes:180, sourceRevision:'6eab9de69bf2d7ba8eea6b10e11372f5c8f579b0' });
  assert.equal(mission.ok, true);
  assert.equal(mission.state, 'ACTIVE');
  assert.equal(mission.terminal, false);
  assert.equal(mission.terminalResultAllowed, false);
  assert.equal(mission.deadlineAt, '2026-09-11T09:00:00.000Z');
  assert.equal(mission.nominatedPaymentDestination, 'PayPal.me/Sarawessam');
  assert.equal(mission.spendCeilingCents, 0);
  assert.equal(mission.authority.outboundAuthorityInferredFromIntent, false);
});

test('null deadline does not become the Unix epoch before natural-language parsing', () => {
  const mission = compileFounderOutcomeMission({ founderIntent:command, now, deadline:null, timezoneOffsetMinutes:180 });
  assert.equal(mission.ok, true);
  assert.equal(mission.deadlineAt, '2026-09-11T09:00:00.000Z');
});

test('explicit named calendar date is honored and an explicit past date is never silently shifted', () => {
  const exact = compileFounderOutcomeMission({ founderIntent:'Make revenue by 12 PM Africa/Cairo on September 11, 2026', now, timezoneOffsetMinutes:180 });
  assert.equal(exact.ok, true);
  assert.equal(exact.deadlineAt, '2026-09-11T09:00:00.000Z');
  const past = compileFounderOutcomeMission({ founderIntent:'Make revenue by 12 PM Africa/Cairo on September 10, 2026', now, timezoneOffsetMinutes:180 });
  assert.equal(past.ok, false);
  assert.ok(past.reasonCodes.includes('future-mission-deadline-required'));
});

test('unobserved zero before deadline is unknown and never the terminal mission result', () => {
  const mission = compileFounderOutcomeMission({ founderIntent:command, now, timezoneOffsetMinutes:180 });
  const state = evaluateFounderOutcomeMission({ mission, now:new Date('2026-09-11T00:15:00.000Z'), clearedContributionProfitCents:0 });
  assert.equal(state.ok, true);
  assert.equal(state.status, 'FOUNDER_OUTCOME_MISSION_ACTIVE');
  assert.equal(state.terminal, false);
  assert.equal(state.terminalResultAllowed, false);
  assert.equal(state.currentObservedClearedContributionProfitCents, null);
  assert.equal(state.paymentObservationComplete, false);
});

test('legacy provider-observed zero may be current state but cannot certify a terminal amount', () => {
  const mission = compileFounderOutcomeMission({ founderIntent:command, now, timezoneOffsetMinutes:180 });
  const current = evaluateFounderOutcomeMission({
    mission,
    now:new Date('2026-09-11T00:15:00.000Z'),
    clearedContributionProfitCents:0,
    paymentObservationComplete:true,
    providerEvidenceRefs:['receipt://paypal-reconciliation/observed-zero']
  });
  assert.equal(current.status, 'FOUNDER_OUTCOME_MISSION_ACTIVE');
  assert.equal(current.terminal, false);
  assert.equal(current.currentObservedClearedContributionProfitCents, 0);
  const deadline = evaluateFounderOutcomeMission({
    mission,
    now:new Date('2026-09-11T09:00:01.000Z'),
    clearedContributionProfitCents:0,
    paymentObservationComplete:true,
    providerEvidenceRefs:['receipt://paypal-reconciliation/observed-zero']
  });
  assert.equal(deadline.terminal, false);
  assert.equal(deadline.clearedContributionProfitCents, null);
});

test('terminal money requires provider-origin reconciliation covering the terminal instant', () => {
  const mission = compileFounderOutcomeMission({ founderIntent:command, now, timezoneOffsetMinutes:180 });
  const stale = evaluateFounderOutcomeMission({ mission, now:new Date('2026-09-11T09:00:01.000Z'), paymentObservation:structuredObservation('2026-09-11T08:59:59.000Z') });
  assert.equal(stale.terminal, false);
  const sandbox = evaluateFounderOutcomeMission({ mission, now:new Date('2026-09-11T09:00:01.000Z'), paymentObservation:structuredObservation('2026-09-11T09:00:01.000Z', { environment:'SANDBOX' }) });
  assert.equal(sandbox.terminal, false);
  const internal = evaluateFounderOutcomeMission({ mission, now:new Date('2026-09-11T09:00:01.000Z'), paymentObservation:structuredObservation('2026-09-11T09:00:01.000Z', { evidenceClass:'INTERNAL_LEDGER' }) });
  assert.equal(internal.terminal, false);
  const proven = evaluateFounderOutcomeMission({ mission, now:new Date('2026-09-11T09:00:01.000Z'), paymentObservation:structuredObservation('2026-09-11T09:00:00.000Z') });
  assert.equal(proven.status, 'FOUNDER_OUTCOME_MISSION_DEADLINE_REACHED');
  assert.equal(proven.terminal, true);
  assert.equal(proven.clearedContributionProfitCents, 0);
});

test('early terminalization requires proof-complete branch exhaustion plus provider truth through exhaustion time', () => {
  const mission = compileFounderOutcomeMission({ founderIntent:command, now, timezoneOffsetMinutes:180 });
  const weak = evaluateFounderOutcomeMission({ mission, now:new Date('2026-09-11T01:00:00.000Z'), exhaustionProof:{ complete:true, admissibleBranchCount:20, proofRefs:[] } });
  assert.equal(weak.terminal, false);
  const stale = evaluateFounderOutcomeMission({ mission, now:new Date('2026-09-11T01:00:00.000Z'), exhaustionProof:{ complete:true, admissibleBranchCount:20, proofRefs:['receipt://branch-tournament/1'] }, paymentObservation:structuredObservation('2026-09-11T00:59:59.000Z') });
  assert.equal(stale.status, 'FOUNDER_OUTCOME_MISSION_EXHAUSTED_RECONCILIATION_REQUIRED');
  assert.equal(stale.terminal, false);
  const proven = evaluateFounderOutcomeMission({ mission, now:new Date('2026-09-11T01:00:00.000Z'), exhaustionProof:{ complete:true, admissibleBranchCount:20, proofRefs:['receipt://branch-tournament/1'] }, paymentObservation:structuredObservation('2026-09-11T01:00:00.000Z') });
  assert.equal(proven.status, 'FOUNDER_OUTCOME_MISSION_EXHAUSTED_BEFORE_DEADLINE');
  assert.equal(proven.terminal, true);
});

test('deadline with unknown payment reconciliation stays unresolved, never fake zero', () => {
  const mission = compileFounderOutcomeMission({ founderIntent:command, now, timezoneOffsetMinutes:180 });
  const state = evaluateFounderOutcomeMission({ mission, now:new Date('2026-09-11T09:00:01.000Z'), clearedContributionProfitCents:0 });
  assert.equal(state.terminal, false);
  assert.equal(state.terminalResultAllowed, false);
  assert.equal(state.missionWindowClosed, true);
  assert.equal(state.clearedContributionProfitCents, null);
  assert.equal(state.status, 'FOUNDER_OUTCOME_MISSION_DEADLINE_REACHED_RECONCILIATION_REQUIRED');
});

test('economic pulse keeps preparation and reconciliation alive while withholding outbound without durable authority', () => {
  const mission = compileFounderOutcomeMission({ founderIntent:command, now, timezoneOffsetMinutes:180 });
  const plan = compileFounderEconomicPulsePlan({ mission, now:new Date('2026-09-11T00:15:00.000Z'), paymentReconciliationAvailable:true });
  assert.equal(plan.ok, true);
  assert.equal(plan.status, 'FOUNDER_ECONOMIC_PULSE_PLAN_READY');
  assert.equal(plan.outboundReady, false);
  assert.ok(plan.jobs.some(job => job.type === 'prometheus.commercial.catalog'));
  assert.ok(plan.jobs.some(job => job.type === 'payment.reconciliation.tick'));
  assert.equal(plan.jobs.some(job => job.type === 'outbound.process'), false);
});

test('after the deadline the heartbeat stops new monetization effects and continues reconciliation only', () => {
  const mission = compileFounderOutcomeMission({ founderIntent:command, now, timezoneOffsetMinutes:180 });
  const plan = compileFounderEconomicPulsePlan({ mission, now:new Date('2026-09-11T09:00:01.000Z'), paymentReconciliationAvailable:true });
  assert.equal(plan.status, 'FOUNDER_ECONOMIC_RECONCILIATION_PULSE_PLAN_READY');
  assert.equal(plan.reconciliationOnly, true);
  assert.deepEqual(plan.jobs.map(job => job.type), ['payment.reconciliation.tick']);
});

test('outbound only enters the pulse with current named authority and mandatory health/suppression rechecks', () => {
  const mission = compileFounderOutcomeMission({ founderIntent:command, now, timezoneOffsetMinutes:180 });
  const plan = compileFounderEconomicPulsePlan({
    mission,
    now:new Date('2026-09-11T00:15:00.000Z'),
    outboundAuthorization:{
      current:true,
      channel:'configured-business-email',
      audience:'verified business owners in evidence-backed selected organizations',
      senderHealthVerified:true,
      suppressionRecheckRequired:true,
      authorityRef:'receipt://founder-authority/current'
    }
  });
  assert.equal(plan.outboundReady, true);
  assert.ok(plan.jobs.some(job => job.type === 'outbound.process'));
});

test('resident systemd wiring gives founder outcomes an independent immediate and minute heartbeat under the existing author identity', () => {
  const pathUnit = readFileSync(new URL('../ops/sovereign/uberbond-founder-outcome-mission.path', import.meta.url), 'utf8');
  const timerUnit = readFileSync(new URL('../ops/sovereign/uberbond-founder-outcome-mission.timer', import.meta.url), 'utf8');
  const serviceUnit = readFileSync(new URL('../ops/sovereign/uberbond-founder-outcome-mission.service', import.meta.url), 'utf8');
  const installer = readFileSync(new URL('../ops/sovereign/install-founder-outcome-mission.sh', import.meta.url), 'utf8');
  const pulse = readFileSync(new URL('../scripts/founder-economic-mission-pulse.mjs', import.meta.url), 'utf8');
  assert.match(pathUnit, /PathChanged=\/var\/lib\/uberbond-control\/founder-intents/);
  assert.match(pathUnit, /Unit=uberbond-founder-outcome-mission\.service/);
  assert.match(timerUnit, /OnUnitActiveSec=60s/);
  assert.match(serviceUnit, /User=uberbond-author/);
  assert.match(serviceUnit, /EnvironmentFile=-\/etc\/uberbond\/economic\.env/);
  assert.match(serviceUnit, /compile-founder-outcome-mission\.mjs/);
  assert.match(serviceUnit, /founder-economic-mission-pulse\.mjs/);
  assert.match(installer, /id -u uberbond-author/);
  assert.match(installer, /economicRuntimeEnvPresent/);
  assert.match(pulse, /UBERBOND_EVIDENCE_DIR/);
  assert.match(pulse, /\/var\/lib\/uberbond-evidence/);
  assert.match(pulse, /founder-outcome-payment-observation\.json/);
});
