import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDeliverabilitySnapshot,
  buildCampaignSendingStatus,
  buildInboxThreads,
  buildInboxActionPatch,
  buildOwnerReplyDraft,
  buildRevenueWeightedAnalytics,
  buildVariantAnalytics,
  buildSequencePlan,
  defaultSequence,
  enrollProspect,
  markSequenceStepSent,
  advanceSequence,
  normalizeOpportunityStage,
  normalizeSequence,
  nextSendWindowAt,
  previewSequence,
  renderMergeTags,
  sanitizeTags,
  stopReason
} from '../src/outreach-workbench.mjs';

const campaign = {
  id: 'camp_1',
  name: 'QA diagnostic',
  offer: 'a fixed USD 250 website QA diagnostic',
  approved: true,
  minScore: 60,
  sequence: defaultSequence({ offer: 'a fixed USD 250 website QA diagnostic' })
};

const prospect = {
  id: 'pros_1', company: 'Acme Dental', website: 'https://acme.example', domain: 'acme.example',
  country: 'Canada', city: 'Toronto', score: { total: 82 },
  contact: { email: 'owner@acme.example', firstName: 'Calvin' },
  issue: { title: 'The booking path has a visible friction point', evidenceExcerpt: 'The public form returns an unclear success state.', safeForOutreach: true },
  unsubscribeUrl: 'https://app.example/unsubscribe?t=abc'
};

test('normalizes a multi-step sequence and rejects unknown merge tags', () => {
  const sequence = normalizeSequence({
    steps: [
      { id: 'one', name: 'Initial', kind: 'initial', variants: [{ id: 'A', subject: 'Hi {{company}}', body: 'See {{issueTitle}}' }] },
      { id: 'two', name: 'Follow-up', kind: 'followup', delayDays: 3, variants: [{ id: 'A', subject: 'Re: {{company}}', body: 'Checking in' }] }
    ]
  });
  assert.equal(sequence.steps.length, 2);
  assert.equal(sequence.steps[1].delayDays, 3);
  assert.equal(sequence.steps.reduce((sum, step) => sum + step.variants.reduce((inner, variant) => inner + variant.weight, 0), 0), 200);
  const split = normalizeSequence({ steps: [{ subject: 'A', body: 'A', variants: [{ id: 'A', weight: 1, subject: 'A', body: 'A' }, { id: 'B', weight: 1, subject: 'B', body: 'B' }, { id: 'C', weight: 1, subject: 'C', body: 'C' }] }] });
  assert.equal(split.steps[0].variants.reduce((sum, variant) => sum + variant.weight, 0), 100);
  assert.throws(() => normalizeSequence({ steps: [{ subject: 'x {{invented}}', body: 'body' }] }), /Unsupported merge tag/);
});

test('merge-tag preview exposes missing data instead of inventing it', () => {
  const result = renderMergeTags('Hi {{firstName}} at {{company}}: {{issueTitle}}', { company: 'Acme' }, {}, {});
  assert.equal(result.text, 'Hi  at Acme: ');
  assert.deepEqual(result.missingTags, ['firstName', 'issueTitle']);
});

test('sequence preview is deterministic and schedules relative delays', () => {
  const preview = previewSequence({ sequence: campaign.sequence, prospect, campaign, startAt: '2026-08-11T08:00:00.000Z', sender: { name: 'Mohamed' } });
  assert.equal(preview.steps.length, 3);
  assert.equal(preview.steps[0].scheduledAt, '2026-08-11T08:00:00.000Z');
  assert.equal(preview.steps[1].scheduledAt, '2026-08-14T08:00:00.000Z');
  assert.equal(preview.steps[2].scheduledAt, '2026-08-19T08:00:00.000Z');
  assert.equal(preview.steps[0].selectedVariantId, preview.steps[0].selectedVariantId);
  assert.match(preview.steps[0].selected.subject, /Acme Dental/);
});

test('send-window preview respects a fixed IANA timezone instead of silently treating it as UTC', () => {
  const window = { start: 9, end: 17, weekdays: [1, 2, 3, 4, 5], timezone: 'America/Toronto' };
  assert.equal(nextSendWindowAt('2026-08-11T12:00:00.000Z', window), '2026-08-11T13:00:00.000Z');
  assert.equal(nextSendWindowAt('2026-08-11T21:00:00.000Z', window), '2026-08-12T13:00:00.000Z');
});

test('enrollment creates a durable plan but no external authority', () => {
  const state = enrollProspect({ prospect, campaign, now: '2026-08-11T08:00:00.000Z' });
  assert.equal(state.status, 'active');
  assert.equal(state.stepStates.length, 3);
  assert.equal(state.stepStates[0].status, 'scheduled');
  assert.equal(state.stepStates[1].status, 'pending');
  assert.equal(state.externalEffects, undefined);
});

test('sequence advancement turns due work into an owner-review item and stops on reply', () => {
  const state = enrollProspect({ prospect, campaign, now: '2026-08-11T08:00:00.000Z' });
  const ready = advanceSequence({ state, prospect, campaign, now: '2026-08-11T08:01:00.000Z' });
  assert.equal(ready.action, 'ready_for_review');
  assert.equal(ready.state.status, 'ready_for_review');
  assert.equal(ready.state.stepStates[0].status, 'ready_for_review');
  assert.equal(ready.step.selectedVariantId, 'A');
  const stopped = advanceSequence({
    state: ready.state,
    prospect: { ...prospect, repliedAt: '2026-08-11T08:01:30.000Z' },
    campaign,
    now: '2026-08-11T08:02:00.000Z'
  });
  assert.equal(stopped.action, 'stopped');
  assert.equal(stopped.reason, 'reply-received');
  assert.equal(stopped.state.nextStepAt, null);
});

test('sequence advancement keeps incomplete research out of the owner-review queue', () => {
  const state = enrollProspect({ prospect: { ...prospect, contact: null }, campaign, now: '2026-08-11T08:00:00.000Z' });
  const result = advanceSequence({ state, prospect: { ...prospect, contact: null }, campaign, now: '2026-08-11T08:01:00.000Z' });
  assert.equal(result.action, 'blocked');
  assert.equal(result.reason, 'recipient-missing');
  assert.equal(result.state.status, 'active');
});

test('sequence send state advances from approved work to a windowed next step without external authority', () => {
  const state = {
    ...enrollProspect({ prospect, campaign, now: '2026-08-11T08:00:00.000Z' }),
    status: 'approved', approvedStepIndex: 0, approvedVariantId: 'A', approvedApprovalId: 'approval-1',
    stepStates: enrollProspect({ prospect, campaign, now: '2026-08-11T08:00:00.000Z' }).stepStates.map((step, index) => index === 0 ? { ...step, status: 'approved', approvalId: 'approval-1' } : step)
  };
  const next = markSequenceStepSent({ state, sequence: campaign.sequence, prospect, campaign, stepIndex: 0, sentAt: '2026-08-11T10:00:00.000Z', message: { id: 'msg-1', gmailId: 'gmail-1', threadId: 'thread-1' }, approvalId: 'approval-1' });
  assert.equal(next.status, 'active');
  assert.equal(next.currentStepIndex, 1);
  assert.equal(next.stepStates[0].status, 'sent');
  assert.equal(next.stepStates[0].approvalId, 'approval-1');
  assert.equal(next.nextStepAt, '2026-08-14T10:00:00.000Z');
  assert.equal(next.externalEffects, undefined);
});

test('stop rules halt replies, suppression, and commercial continuity', () => {
  assert.equal(stopReason({ prospect: { ...prospect, repliedAt: '2026-08-11T09:00:00Z' } }), 'reply-received');
  assert.equal(stopReason({ prospect, suppressions: [{ value: 'owner@acme.example' }] }), 'suppressed');
  assert.equal(stopReason({ prospect: { ...prospect, paymentStatus: 'paid' } }), 'payment-state');
});

test('dry-run sequence planning reports gates without crossing the provider boundary', () => {
  const rows = buildSequencePlan({ campaign, prospects: [prospect, { ...prospect, id: 'pros_2', contact: null }], suppressions: [] });
  assert.equal(rows[0].eligible, true);
  assert.equal(rows[0].externalEffects, 0);
  assert.equal(rows[1].eligible, false);
  assert.ok(rows[1].reasons.includes('recipient-missing'));
});

test('revenue-weighted analytics keeps cleared money above email vanity metrics', () => {
  const analytics = buildRevenueWeightedAnalytics({
    prospects: [
      { id: '1', sentAt: '2026-08-11', repliedAt: '2026-08-12', replyLabel: 'positive', opportunityStage: 'paid' },
      { id: '2', sentAt: '2026-08-11', repliedAt: '2026-08-12', replyLabel: 'negative' }
    ],
    messages: [{ prospectId: '1' }, { prospectId: '2' }],
    replies: [{ prospectId: '1', classification: { label: 'positive' } }, { prospectId: '2', classification: { label: 'negative' } }],
    orders: [{ prospectId: '1', status: 'paid', amountCents: 25000 }],
    subscriptions: [{ prospectId: '1', status: 'active' }]
  });
  assert.equal(analytics.counts.sent, 2);
  assert.equal(analytics.counts.paymentSettled, 1);
  assert.equal(analytics.clearedRevenueUsd, 250);
  assert.ok(analytics.weightedOutcomeScore > analytics.counts.sent);
});

test('inbox joins messages, replies, and the opportunity record into one thread', () => {
  const threads = buildInboxThreads({
    prospects: [{ ...prospect, opportunityStage: 'opportunity' }],
    messages: [{ id: 'm1', prospectId: prospect.id, threadId: 'thread-1', sentAt: '2026-08-11T10:00:00Z' }],
    replies: [{ id: 'r1', prospectId: prospect.id, threadId: 'thread-1', receivedAt: '2026-08-12T10:00:00Z', body: 'Interested' }]
  });
  assert.equal(threads.length, 1);
  assert.equal(threads[0].latestReply.body, 'Interested');
  assert.equal(threads[0].prospect.opportunityStage, 'opportunity');
  assert.equal(threads[0].unread, true);
  assert.equal(threads[0].needsAction, true);
});

test('owner inbox actions label or route a thread without provider effects', () => {
  const active = { sequenceState: { status: 'active', nextStepAt: '2026-08-14T10:00:00Z' }, status: 'sent' };
  const positive = buildInboxActionPatch({ action: 'mark positive', prospect: active, now: '2026-08-12T10:00:00Z' });
  assert.equal(positive.action, 'mark_positive');
  assert.equal(positive.patch.replyLabel, 'positive');
  assert.equal(positive.patch.sequenceState.status, 'stopped');
  assert.equal(positive.externalEffects, 0);
  const opportunity = buildInboxActionPatch({ action: 'create_opportunity', prospect: active, now: '2026-08-12T10:00:00Z' });
  assert.equal(opportunity.patch.opportunityStage, 'opportunity');
  assert.equal(opportunity.patch.sequenceState.stoppedReason, 'owner-created-opportunity');
  const snooze = buildInboxActionPatch({ action: 'snooze', snoozedUntil: '2026-08-13T10:00:00Z', now: '2026-08-12T10:00:00Z' });
  assert.equal(snooze.patch.inboxSnoozedUntil, '2026-08-13T10:00:00.000Z');
  assert.throws(() => buildInboxActionPatch({ action: 'snooze', snoozedUntil: '2026-08-11T10:00:00Z', now: '2026-08-12T10:00:00Z' }), /future timestamp/);
});

test('deliverability snapshot scores mailboxes and domains from observed events', () => {
  const snapshot = buildDeliverabilitySnapshot({
    accounts: [{ slot: 'A', email: 'hello@uberbond.example', connected: true }],
    senderHealth: [{ inbox: 'A', hardBouncesToday: 1, complaintsToday: 0, failureStreak: 0, paused: false }],
    outboundEvents: [{ inbox: 'A', eventType: 'sent' }, { inbox: 'A', eventType: 'hard_bounce' }],
    prospects: [prospect]
  });
  assert.equal(snapshot.mailboxes[0].slot, 'A');
  assert.equal(snapshot.mailboxes[0].score, 75);
  assert.equal(snapshot.domains[0].domain, 'uberbond.example');
  assert.equal(snapshot.policy.noGuaranteedPlacement, true);
});

test('owner controls normalize to a bounded local vocabulary', () => {
  assert.equal(normalizeOpportunityStage('PAID'), 'paid');
  assert.equal(normalizeOpportunityStage('not-a-stage'), 'new');
  assert.deepEqual(sanitizeTags(['QA', 'medical site', 'QA', 'unsafe!']), ['qa', 'medicalsite', 'unsafe']);
});

test('advanced templates support precise waits, custom variables, placeholders, conditionals and deterministic spintax', () => {
  const campaignWithVariables = {
    ...campaign,
    customVariables: { diagnosticPrice: 'USD 250' },
    sequence: {
      settings: { placeholderValues: { senderRole: 'website QA specialist' } },
      steps: [{
        id: 'advanced', kind: 'initial', delayValue: 30, delayUnit: 'minutes',
        variants: [{ id: 'A', subject: '{A subject|B subject} {{company}}', body: '{% if diagnosticPrice %}{{diagnosticPrice}}{% else %}{{senderRole}}{% endif %} {{senderRole}}', enabled: true }]
      }]
    }
  };
  const preview = previewSequence({ sequence: campaignWithVariables.sequence, campaign: campaignWithVariables, prospect, startAt: '2026-08-11T08:00:00.000Z' });
  assert.equal(preview.steps[0].scheduledAt, '2026-08-11T08:00:00.000Z');
  assert.match(preview.steps[0].selected.subject, /Acme Dental/);
  assert.match(preview.steps[0].selected.body, /USD 250/);
  assert.equal(preview.steps[0].missingTags.length, 0);
  assert.match(preview.steps[0].selected.body, /website QA specialist/);
});

test('variant analytics produces owner optimization recommendations without mutation', () => {
  const analytics = buildVariantAnalytics({
    campaignId: 'camp_1', campaign: { ...campaign, sequence: { ...campaign.sequence, settings: { minimumOptimizationSamples: 1, autoOptimizeMetric: 'replyRate' } } },
    prospects: [
      { id: 'p1', campaignId: 'camp_1', opportunityStage: 'opportunity' },
      { id: 'p2', campaignId: 'camp_1', opportunityStage: 'new' }
    ],
    messages: [
      { id: 'm1', prospectId: 'p1', campaignId: 'camp_1', stepId: 'step-1', variantId: 'A' },
      { id: 'm2', prospectId: 'p2', campaignId: 'camp_1', stepId: 'step-1', variantId: 'B' }
    ],
    replies: [{ prospectId: 'p1', classification: { label: 'positive' } }]
  });
  assert.equal(analytics.totals.sent, 2);
  assert.equal(analytics.recommendation.variantId, 'A');
  assert.equal(analytics.recommendation.eligible, true);
});

test('campaign diagnostics and reply drafting fail closed into owner review', () => {
  const status = buildCampaignSendingStatus({ campaign: { id: 'c', approved: false, autoSend: false }, prospects: [], accounts: [], senderHealth: [] });
  assert.equal(status.status, 'plan_only');
  assert.ok(status.reasons.includes('owner-plan-only'));
  assert.equal(status.issueTracking.some(issue => issue.code === 'OWNER_PLAN_ONLY'), true);
  assert.deepEqual(status.progress, { completedLeads: 0, totalLeads: 0, percent: 0 });
  const draft = buildOwnerReplyDraft({ prospect: { contact: { firstName: 'Calvin' } }, reply: { label: 'positive', subject: 'QA' }, offer: 'a USD 250 diagnostic' });
  assert.equal(draft.safeToSend, false);
  assert.match(draft.body, /Calvin/);
  assert.match(draft.body, /USD 250/);
});
