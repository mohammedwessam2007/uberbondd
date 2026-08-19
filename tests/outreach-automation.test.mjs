import test from 'node:test';
import assert from 'node:assert/strict';
import {
  automationTriggerForProviderEvent,
  evaluateAutomationPlan,
  normalizeAutomationPlan
} from '../src/outreach-automation.mjs';

test('automation plans normalize triggers, conditions, actions and owner-local mode', () => {
  const plan = normalizeAutomationPlan({
    name: 'Route positive replies', trigger: 'reply', enabled: true,
    conditions: [{ field: 'prospect.campaignId', operator: 'exists' }],
    actions: [{ type: 'stop_sequence' }, { type: 'create_opportunity' }]
  }, { id: 'auto_1', now: '2026-08-12T10:00:00Z' });
  assert.equal(plan.trigger, 'lead_replied');
  assert.equal(plan.mode, 'owner-local');
  assert.equal(plan.actions.length, 2);
});

test('automation evaluation requires the trigger and every condition', () => {
  const plan = normalizeAutomationPlan({
    name: 'Positive route', trigger: 'lead_positive', enabled: true,
    conditions: [{ field: 'prospect.replyLabel', operator: 'equals', value: 'positive' }],
    actions: [{ type: 'create_opportunity' }]
  }, { id: 'auto_2', now: '2026-08-12T10:00:00Z' });
  const event = { eventType: 'positive', providerEventKey: 'instantly:positive:1' };
  const matched = evaluateAutomationPlan({ plan, event, prospect: { replyLabel: 'positive' }, now: '2026-08-12T10:00:00Z' });
  assert.equal(matched.matched, true);
  assert.equal(matched.actions[0].type, 'create_opportunity');
  const failed = evaluateAutomationPlan({ plan, event, prospect: { replyLabel: 'negative' }, now: '2026-08-12T10:00:00Z' });
  assert.equal(failed.status, 'condition_failed');
  assert.equal(failed.matched, false);
});

test('provider event mapping and HTTP parity stay truthful about external effects', () => {
  assert.equal(automationTriggerForProviderEvent({ eventType: 'reply' }), 'lead_replied');
  const plan = normalizeAutomationPlan({
    name: 'External handoff review', trigger: 'reply', enabled: true,
    actions: [{ type: 'http_request', params: { url: 'https://example.test/hook', method: 'POST' } }]
  });
  const result = evaluateAutomationPlan({ plan, event: { eventType: 'reply' }, now: '2026-08-12T10:00:00Z' });
  assert.equal(result.matched, true);
  assert.equal(result.actions.length, 0);
  assert.deepEqual(result.blockedActions, [{ type: 'http_request', reason: 'external-http-action-disabled' }]);
  assert.equal(result.providerCalls, 0);
  assert.equal(result.externalEffects, 0);
});

test('automation conditions support an explicit OR mode while preserving empty AND behavior', () => {
  const plan = normalizeAutomationPlan({
    name: 'Route high-signal replies', trigger: 'any_event', enabled: true, conditionMode: 'any',
    conditions: [
      { field: 'prospect.replyLabel', operator: 'equals', value: 'positive' },
      { field: 'event.eventType', operator: 'equals', value: 'meeting_booked' }
    ],
    actions: [{ type: 'create_owner_review' }]
  }, { id: 'auto_or', now: '2026-08-12T10:00:00Z' });
  assert.equal(plan.conditionMode, 'any');
  const result = evaluateAutomationPlan({ plan, event: { eventType: 'reply' }, prospect: { replyLabel: 'neutral' }, now: '2026-08-12T10:00:00Z' });
  assert.equal(result.conditionMode, 'any');
  assert.equal(result.matched, false);
  const meeting = evaluateAutomationPlan({ plan, event: { eventType: 'meeting_booked' }, prospect: { replyLabel: 'neutral' }, now: '2026-08-12T10:00:00Z' });
  assert.equal(meeting.matched, true);
});
