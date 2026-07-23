import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LIFECYCLE_STATES, TERMINAL_STATES, ALL_STATES, canTransition, assertTransition,
  allowedTransitions, isTerminalState, projectLifecycleState, StateMachineError
} from '../src/automation/state-machine.mjs';

test('the full spec vocabulary is present exactly once', () => {
  const expectedLifecycle = [
    'DISCOVERED', 'CRAWLED', 'EVIDENCE_VERIFIED', 'QUALIFIED', 'DRAFT_READY', 'POLICY_ELIGIBLE',
    'SEND_RESERVED', 'SENT', 'REPLIED', 'NO_REPLY', 'FOLLOWUP_ELIGIBLE', 'PROPOSAL_READY',
    'INVOICE_READY', 'PAID', 'ONBOARDING', 'FULFILLMENT_ACTIVE', 'QA', 'DELIVERED',
    'MONITORING_OFFERED', 'MONITORING_ACTIVE', 'CLOSED'
  ];
  assert.deepEqual(LIFECYCLE_STATES, expectedLifecycle);
  assert.deepEqual(TERMINAL_STATES, ['REJECTED', 'SUPPRESSED', 'FAILED', 'REFUNDED', 'CHARGEBACK', 'CANCELLED']);
  assert.equal(new Set(ALL_STATES).size, ALL_STATES.length);
});

test('the documented happy path is fully walkable end to end', () => {
  const path = [
    'DISCOVERED', 'CRAWLED', 'EVIDENCE_VERIFIED', 'QUALIFIED', 'DRAFT_READY', 'POLICY_ELIGIBLE',
    'SEND_RESERVED', 'SENT', 'REPLIED', 'PROPOSAL_READY', 'INVOICE_READY', 'PAID', 'ONBOARDING',
    'FULFILLMENT_ACTIVE', 'QA', 'DELIVERED', 'MONITORING_OFFERED', 'MONITORING_ACTIVE', 'CLOSED'
  ];
  for (let i = 0; i < path.length - 1; i += 1) assertTransition(path[i], path[i + 1]);
});

test('the no-reply-then-followup branch is walkable', () => {
  assertTransition('SENT', 'NO_REPLY');
  assertTransition('NO_REPLY', 'FOLLOWUP_ELIGIBLE');
  assertTransition('FOLLOWUP_ELIGIBLE', 'SEND_RESERVED');
  assertTransition('NO_REPLY', 'CLOSED');
});

test('every non-terminal state can reach a suppression/rejection terminal appropriate to its stage', () => {
  for (const state of LIFECYCLE_STATES) {
    if (['NO_REPLY', 'PAID', 'ONBOARDING', 'FULFILLMENT_ACTIVE', 'QA', 'DELIVERED', 'MONITORING_OFFERED', 'MONITORING_ACTIVE', 'CLOSED'].includes(state)) continue;
    const targets = allowedTransitions(state);
    assert(targets.includes('SUPPRESSED') || targets.includes('REJECTED'), `${state} should reach a rejection/suppression terminal`);
  }
});

test('terminal states allow no outgoing transitions at all', () => {
  for (const terminal of TERMINAL_STATES) {
    assert.equal(allowedTransitions(terminal).length, 0);
    assert.equal(isTerminalState(terminal), true);
    assert.throws(() => assertTransition(terminal, 'DISCOVERED'), StateMachineError);
  }
});

test('forbidden transitions are rejected: cannot skip stages or go backward past a terminal', () => {
  assert.equal(canTransition('DISCOVERED', 'SENT'), false);
  assert.equal(canTransition('PAID', 'DISCOVERED'), false);
  assert.equal(canTransition('SENT', 'PAID'), false);
  assert.throws(() => assertTransition('DISCOVERED', 'PAID'), /not an allowed transition/);
});

test('unknown states are rejected rather than silently ignored', () => {
  assert.equal(canTransition('DISCOVERED', 'NOT_A_STATE'), false);
  assert.throws(() => assertTransition('NOT_A_STATE', 'CRAWLED'), StateMachineError);
});

test('FAILED is only reachable pre-reply, never after a human has replied', () => {
  assert(allowedTransitions('SENT').includes('FAILED'));
  assert(!allowedTransitions('REPLIED').includes('FAILED'));
  assert(!allowedTransitions('PROPOSAL_READY').includes('FAILED'));
});

test('projectLifecycleState maps live acquisitionStatus vocabulary onto the formal states', () => {
  assert.equal(projectLifecycleState({ status: 'queued' }), 'DISCOVERED');
  assert.equal(projectLifecycleState({ status: 'sent', nextFollowupAt: null }), 'NO_REPLY');
  assert.equal(projectLifecycleState({ status: 'sent', nextFollowupAt: '2026-01-01T00:00:00Z' }), 'FOLLOWUP_ELIGIBLE');
  assert.equal(projectLifecycleState({ status: 'interested' }), 'REPLIED');
  assert.equal(projectLifecycleState({}, { order: { paymentState: 'paid' } }), 'PAID');
  assert.equal(projectLifecycleState({}, { delivery: { status: 'delivered' } }), 'DELIVERED');
  assert.equal(projectLifecycleState({}, { subscription: { status: 'active' } }), 'MONITORING_ACTIVE');
});
