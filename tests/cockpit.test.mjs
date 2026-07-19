import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACQUISITION_STATUSES,
  approvedDraftPatch,
  buildCockpitSnapshot,
  cockpitExportRows,
  deriveAcquisitionStatus,
  evaluateDraftApproval,
  rejectedDraftPatch
} from '../src/cockpit.mjs';

const campaign = {
  id: 'campaign-a', name: 'UAE clinics', approved: true, enabled: true,
  dryRun: true, autoSend: false, minimumProspectScore: 70,
  minimumEvidenceConfidence: 0.8
};

function reviewProspect(overrides = {}) {
  const selected = {
    subject: 'Atlas Dental booking path',
    body: 'Stored evidence-bound outreach body.',
    quality: { passed: true, score: 94 }
  };
  return {
    id: 'prospect-a', campaignId: campaign.id, company: 'Atlas Dental',
    website: 'https://atlas.example', country: 'AE', city: 'Dubai', niche: 'dentist',
    status: 'research-complete', createdAt: '2026-07-18T01:00:00.000Z',
    score: { total: 88, tier: 'A' },
    issue: {
      title: 'Booking action is difficult to find', service: 'Conversion design',
      evidenceUrl: 'https://atlas.example/appointments',
      evidenceExcerpt: 'Appointments are available by telephone.',
      confidence: 0.94, safeForOutreach: true
    },
    contact: {
      email: 'office@atlas.example', published: true,
      evidence: [{
        sourceUrl: 'https://atlas.example/contact',
        evidenceExcerpt: 'Contact office@atlas.example', published: true
      }]
    },
    outreach: { status: 'needs-review', selected, ownerApproval: 'pending' },
    subject: selected.subject, draft: selected.body,
    draftApproval: { status: 'pending' },
    ...overrides
  };
}

const cfg = { outbound: { dryRun: true, minEvidenceConfidence: 0.75 } };

test('the cockpit models every required acquisition state deterministically', () => {
  assert.equal(ACQUISITION_STATUSES.length, 24);
  for (const status of ACQUISITION_STATUSES) {
    assert.equal(deriveAcquisitionStatus({ id: status, acquisitionStatus: status }), status);
  }
  assert.equal(deriveAcquisitionStatus({ status: 'error' }), 'audit-failed');
  assert.equal(deriveAcquisitionStatus({ status: 'bounce' }), 'bounced');
  assert.equal(deriveAcquisitionStatus({ status: 'suppressed' }), 'unsubscribed');
  assert.equal(deriveAcquisitionStatus({ status: 'paid' }), 'paid');
  assert.equal(deriveAcquisitionStatus({ status: 'replied' }, { reply: { classification: { label: 'interested' } } }), 'interested');
});

test('the default attention snapshot contains only actionable buckets and safe projections', () => {
  const draft = reviewProspect();
  const failed = reviewProspect({ id: 'failed', company: 'Failed Clinic', status: 'error', error: 'browser failed', outreach: null, draft: '', subject: '', draftApproval: null });
  const interested = reviewProspect({ id: 'interested', company: 'Reply Clinic' });
  const unknown = reviewProspect({ id: 'unknown', company: 'Review Clinic' });
  const paid = reviewProspect({ id: 'paid', company: 'Paid Clinic' });
  const delivery = reviewProspect({ id: 'delivery', company: 'Delivery Clinic', delivery: { status: 'queued' } });
  const snapshot = buildCockpitSnapshot({
    prospects: [draft, failed, interested, unknown, paid, delivery],
    campaigns: [campaign, { id: 'disabled-demo', name: 'Disabled demo', enabled: false, dryRun: true }, { id: 'system', systemKey: 'inbound', name: 'hidden' }],
    replies: [
      { id: 'reply-1', prospectId: interested.id, classification: { label: 'interested' }, responseDraft: { status: 'needs-owner-approval' }, body: 'private reply body', from: 'owner@reply.example', createdAt: '2026-07-18T02:00:00.000Z' },
      { id: 'reply-unknown', prospectId: unknown.id, classification: { label: 'unknown-needs-review', humanReviewRequired: true }, body: 'private ambiguous body', from: 'unknown@reply.example', createdAt: '2026-07-18T02:30:00.000Z' },
      { id: 'reply-orphan', prospectId: null, match: { source: 'unmatched', ambiguous: false }, classification: { label: 'asks-for-information' }, body: 'private orphan body', from: 'orphan@reply.example', createdAt: '2026-07-18T03:30:00.000Z' }
    ],
    orders: [{ id: 'order-1', prospectId: paid.id, status: 'paid', amountCents: 4900, currency: 'USD', providerReference: 'secret-provider-reference', createdAt: '2026-07-18T03:00:00.000Z' }],
    senderHealth: [{ id: 'sender_A', inbox: 'A', paused: false, email: 'private-inbox@example.com', oauthToken: 'secret', hardBouncesToday: 0 }],
    settings: { outboundPaused: true, outboundPauseReason: 'Owner pause', databaseUrl: 'secret' },
    outbound: { enabled: false, dryRun: true, liveSendApproved: false }
  });

  assert.equal(snapshot.defaultView, 'attention');
  assert.deepEqual(snapshot.attention.drafts.map(row => row.id), [draft.id]);
  assert.deepEqual(snapshot.attention.urgent.map(row => row.id), ['reply:reply-orphan', unknown.id, failed.id]);
  assert.deepEqual(snapshot.attention.positiveReplies.map(row => row.id), [interested.id]);
  assert.deepEqual(snapshot.attention.payments.map(event => event.id), ['order-1']);
  assert.deepEqual(snapshot.attention.delivery.map(row => row.id), [delivery.id]);
  assert.equal(snapshot.counts['needs-review'], 1);
  assert.equal(snapshot.counts['audit-failed'], 1);
  assert.equal(snapshot.counts.interested, 1);
  assert.equal(snapshot.counts.replied, 1);
  assert.equal(snapshot.counts.paid, 1);
  assert.equal(snapshot.counts['delivery-queued'], 1);
  assert.equal(snapshot.controls.globalOutboundPaused, true);
  assert.equal(snapshot.controls.campaigns.find(item => item.id === 'disabled-demo').disabled, true);
  assert.equal(snapshot.controls.campaigns.find(item => item.id === 'disabled-demo').paused, false);
  assert.equal(snapshot.attention.positiveReplies[0].replyId, 'reply-1');
  assert.equal(snapshot.attention.positiveReplies[0].responseDraftStatus, 'needs-owner-approval');
  assert.deepEqual(snapshot.controls.inboxes[0], {
    slot: 'A', paused: false, pauseReason: '', hardBouncesToday: 0,
    complaintsToday: 0, failureStreak: 0
  });

  const serialized = JSON.stringify(snapshot);
  for (const forbidden of ['office@atlas.example', 'private reply body', 'owner@reply.example', 'private ambiguous body', 'unknown@reply.example', 'private orphan body', 'orphan@reply.example', 'private-inbox@example.com', 'secret-provider-reference', 'oauthToken', 'databaseUrl', 'Stored evidence-bound outreach body.']) {
    assert.equal(serialized.includes(forbidden), false, `snapshot leaked ${forbidden}`);
  }
});

test('cockpit filters and safe exports preserve useful business fields without PII', () => {
  const snapshot = buildCockpitSnapshot({ prospects: [
    reviewProspect(),
    reviewProspect({ id: 'uk', company: 'London Clinic', country: 'GB', city: 'London', niche: 'medical', score: { total: 64, tier: 'C' } })
  ] }, { campaignId: campaign.id, country: 'AE', niche: 'dent', minimumScore: 80, status: 'needs-review', dateFrom: '2026-07-18', dateTo: '2026-07-18' });
  assert.deepEqual(snapshot.rows.map(row => row.id), ['prospect-a']);
  const rows = cockpitExportRows(snapshot);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].company, 'Atlas Dental');
  assert.equal(Object.hasOwn(rows[0], 'email'), false);
  assert.equal(Object.hasOwn(rows[0], 'draft'), false);
  assert.equal(Object.hasOwn(rows[0], 'providerReference'), false);
  assert.equal(Object.hasOwn(rows[0], 'deliveryMode'), true);
});

test('owner approval rechecks every safety boundary and never makes a draft send-eligible', () => {
  const prospect = reviewProspect();
  const approved = evaluateDraftApproval({ prospect, campaign, cfg });
  assert.equal(approved.ok, true);
  assert.equal(approved.approvalMode, 'dry-run');
  assert.equal(approved.liveSendEligible, false);

  const cases = [
    [reviewProspect({ contact: { email: 'person@gmail.com', externallyVerified: true, verificationStatus: 'valid' } }), campaign, [], 'free-mail-contact'],
    [reviewProspect({ issue: { ...prospect.issue, evidenceExcerpt: '' } }), campaign, [], 'incomplete-evidence'],
    [reviewProspect({ score: { total: 20 } }), campaign, [], 'score-below-campaign-threshold'],
    [reviewProspect({ draft: 'different stored body' }), campaign, [], 'draft-record-mismatch'],
    [reviewProspect(), { ...campaign, enabled: false }, [], 'campaign-not-enabled'],
    [reviewProspect(), campaign, [{ value: 'office@atlas.example' }], 'suppressed'],
    [reviewProspect({ status: 'sent' }), campaign, [], 'prospect-terminal']
  ];
  for (const [candidate, candidateCampaign, suppressions, reason] of cases) {
    assert.equal(evaluateDraftApproval({ prospect: candidate, campaign: candidateCampaign, cfg, suppressions }).reason, reason);
  }
});

test('approval and rejection patches stop follow-ups and preserve the no-send invariant', () => {
  const approvedAt = '2026-07-18T04:00:00.000Z';
  const approved = approvedDraftPatch(reviewProspect(), approvedAt);
  assert.equal(approved.status, 'approved');
  assert.equal(approved.outreach.liveSendEligible, false);
  assert.equal(approved.nextFollowupAt, null);
  assert.equal(approved.draftApproval.approvedAt, approvedAt);

  const rejected = rejectedDraftPatch('Not a fit', approvedAt);
  assert.equal(rejected.status, 'rejected');
  assert.equal(rejected.nextFollowupAt, null);
  assert.equal(rejected.draftApproval.reason, 'Not a fit');
});
