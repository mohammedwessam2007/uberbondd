import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../../revenue-os/src/store.mjs';
import { buildMessageDraft, buildApprovalPacket, decideApproval, expireStaleApprovals, bulkDecideApprovals, ApprovalError, messageHash } from '../../revenue-os/src/approval.mjs';
import {
  OUTBOUND_MODES, createFakeReplayOutboundProvider, createSendHandoff, revalidateBeforeSend,
  checkSendCaps, recordExternalSend, quarantineUncertainSend, recipientMessageHash, OutboundError
} from '../../revenue-os/src/outbound.mjs';

async function harness() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ros-approval-'));
  const store = new Store(dir);
  await store.init();
  return store;
}

async function seedOpportunity(store, overrides = {}) {
  return store.add('opportunities', { organizationDomain: 'agency-x.example.com', channel: 'referral_intro', status: 'candidate', data: { buyerRole: 'owner', confidence: 0.8 }, ...overrides });
}

const OFFER = { offerKey: 'FOUNDING_AGENCY_REVENUE_LEAK_DIAGNOSTIC', priceCents: 25000 };
const CAP_CONFIG = { dailyCap: 25, rollingCap: 100, rollingWindowDays: 7 };

// --- message drafts / packets ---

test('buildMessageDraft requires opportunityId, channel, and a non-empty body', () => {
  assert.throws(() => buildMessageDraft({ channel: 'referral_intro', body: 'hi' }));
  assert.throws(() => buildMessageDraft({ opportunityId: 'o1', body: 'hi' }));
  assert.throws(() => buildMessageDraft({ opportunityId: 'o1', channel: 'referral_intro', body: '   ' }));
  const draft = buildMessageDraft({ opportunityId: 'o1', channel: 'referral_intro', body: 'hi' });
  assert.equal(draft.messageHash, messageHash(draft));
});

test('buildApprovalPacket refuses a draft that does not belong to the opportunity', () => {
  const draft = buildMessageDraft({ opportunityId: 'other-opp', channel: 'referral_intro', body: 'hi' });
  assert.throws(() => buildApprovalPacket({ opportunity: { id: 'o1', organizationDomain: 'a.example.com', channel: 'referral_intro', data: {} }, draft, offer: OFFER }), ApprovalError);
});

test('buildApprovalPacket assembles every mission-named field from already-loaded data, nothing invented', () => {
  const opportunity = { id: 'o1', organizationDomain: 'agency-x.example.com', channel: 'referral_intro', data: { buyerRole: 'owner', demandSignals: ['hiring page live'], portfolioItems: [], confidence: 0.7 } };
  const draft = buildMessageDraft({ opportunityId: 'o1', channel: 'referral_intro', body: 'hi', subject: 'subj' });
  const evidence = [{ id: 'ev1', sourceUrl: 'https://agency-x.example.com', capturedAt: new Date().toISOString(), verified: true }];
  const packet = buildApprovalPacket({ opportunity, evidenceItems: evidence, draft, offer: OFFER, proofAssets: ['sample_report'], risks: ['low volume'] });
  assert.equal(packet.data.organizationDomain, 'agency-x.example.com');
  assert.equal(packet.data.buyerRole, 'owner');
  assert.equal(packet.data.channel, 'referral_intro');
  assert.equal(packet.data.evidence.length, 1);
  assert.deepEqual(packet.data.demandSignals, ['hiring page live']);
  assert.equal(packet.data.offerKey, OFFER.offerKey);
  assert.equal(packet.data.messageHash, draft.messageHash);
  assert.ok(packet.expiresAt);
  assert.equal(packet.status, 'pending');
});

// --- approval decisions ---

test('decideApproval rejects an already-decided or expired approval, and expireStaleApprovals sweeps expiry', async () => {
  const store = await harness();
  const opportunity = await seedOpportunity(store);
  const draft = await store.add('messageDrafts', buildMessageDraft({ opportunityId: opportunity.id, channel: 'referral_intro', body: 'hi' }));
  const approval = await store.add('approvals', buildApprovalPacket({ opportunity, draft, offer: OFFER, expiryHours: -1 }));
  await assert.rejects(() => decideApproval(store, approval.id, 'approved'), ApprovalError);
  assert.equal((await store.get('approvals', approval.id)).status, 'expired');

  const approval2 = await store.add('approvals', buildApprovalPacket({ opportunity, draft, offer: OFFER }));
  await decideApproval(store, approval2.id, 'approved', { actor: 'owner' });
  await assert.rejects(() => decideApproval(store, approval2.id, 'rejected'), ApprovalError);

  const approval3 = await store.add('approvals', buildApprovalPacket({ opportunity, draft, offer: OFFER, expiryHours: -1 }));
  const swept = await expireStaleApprovals(store);
  assert.ok(swept.expired >= 1);
  assert.equal((await store.get('approvals', approval3.id)).status, 'expired');
});

test('bulkDecideApprovals preserves exact recipient-message pairing across a mixed batch (some ok, some failing)', async () => {
  const store = await harness();
  const opportunity = await seedOpportunity(store);
  const draft = await store.add('messageDrafts', buildMessageDraft({ opportunityId: opportunity.id, channel: 'referral_intro', body: 'hi' }));
  const good = await store.add('approvals', buildApprovalPacket({ opportunity, draft, offer: OFFER }));
  const results = await bulkDecideApprovals(store, [good.id, 'not-a-real-id'], 'approved', { actor: 'owner' });
  assert.equal(results.length, 2);
  assert.equal(results[0].approvalId, good.id);
  assert.equal(results[0].ok, true);
  assert.equal(results[1].approvalId, 'not-a-real-id');
  assert.equal(results[1].ok, false);
});

// --- outbound: never sends for real ---

test('OUTBOUND_MODES contains no real-send mode, and createSendHandoff refuses an unknown mode', async () => {
  assert.deepEqual([...OUTBOUND_MODES].sort(), ['draft-only', 'dry-run', 'export-only', 'fake-replay', 'manual-copy'].sort());
  const store = await harness();
  await assert.rejects(() => createSendHandoff(store, { mode: 'real-send' }), OutboundError);
});

test('createSendHandoff in fake-replay mode only ever calls the in-memory fake provider, never a real network path', async () => {
  const store = await harness();
  const opportunity = await seedOpportunity(store);
  const draft = await store.add('messageDrafts', buildMessageDraft({ opportunityId: opportunity.id, channel: 'referral_intro', body: 'hi' }));
  const approval = await decideApproval(store, (await store.add('approvals', buildApprovalPacket({ opportunity, draft, offer: OFFER }))).id, 'approved', { actor: 'owner' });
  const provider = createFakeReplayOutboundProvider();
  const handoff = await createSendHandoff(store, { approval, draft, opportunity, mode: 'fake-replay', provider, config: CAP_CONFIG });
  assert.equal(handoff.status, 'fake-sent');
  assert.equal(handoff.data.externallyPerformedSend, false);
  assert.equal(provider._debug.calls.length, 1);
});

test('createSendHandoff refuses to send without an approval in approved status', async () => {
  const store = await harness();
  const opportunity = await seedOpportunity(store);
  const draft = await store.add('messageDrafts', buildMessageDraft({ opportunityId: opportunity.id, channel: 'referral_intro', body: 'hi' }));
  const approval = await store.add('approvals', buildApprovalPacket({ opportunity, draft, offer: OFFER })); // still pending
  await assert.rejects(() => createSendHandoff(store, { approval, draft, opportunity, mode: 'export-only', config: CAP_CONFIG }), OutboundError);
});

test('revalidateBeforeSend blocks on a suppressed organization even with an approved, unexpired approval', async () => {
  const store = await harness();
  const opportunity = await seedOpportunity(store);
  const draft = await store.add('messageDrafts', buildMessageDraft({ opportunityId: opportunity.id, channel: 'referral_intro', body: 'hi' }));
  const approval = await decideApproval(store, (await store.add('approvals', buildApprovalPacket({ opportunity, draft, offer: OFFER }))).id, 'approved', { actor: 'owner' });
  await store.add('suppressions', { reason: 'complaint', data: { organizationDomain: opportunity.organizationDomain } });
  const result = await revalidateBeforeSend(store, { approval, draft, opportunity });
  assert.equal(result.blocked, true);
  assert.ok(result.blockers.some(b => b.code === 'organization-suppressed'));
});

test('revalidateBeforeSend blocks a duplicate send for the exact same recipient+message pair', async () => {
  const store = await harness();
  const opportunity = await seedOpportunity(store);
  const draft = await store.add('messageDrafts', buildMessageDraft({ opportunityId: opportunity.id, channel: 'referral_intro', body: 'hi' }));
  const approval = await decideApproval(store, (await store.add('approvals', buildApprovalPacket({ opportunity, draft, offer: OFFER }))).id, 'approved', { actor: 'owner' });
  const provider = createFakeReplayOutboundProvider();
  await createSendHandoff(store, { approval, draft, opportunity, mode: 'fake-replay', provider, config: CAP_CONFIG });
  const result = await revalidateBeforeSend(store, { approval, draft, opportunity });
  assert.ok(result.blockers.some(b => b.code === 'duplicate-send'));
});

test('checkSendCaps enforces both the daily and rolling caps from persisted send records, not an in-memory counter', async () => {
  const store = await harness();
  for (let i = 0; i < 3; i++) await store.add('sendRecords', { approvalId: 'a', mode: 'dry-run', idempotencyKey: `k${i}`, recipientMessageHash: `h${i}`, status: 'exported', data: {} });
  const result = await checkSendCaps(store, { dailyCap: 3, rollingCap: 100, rollingWindowDays: 7 });
  assert.equal(result.blocked, true);
  assert.ok(result.blockers.some(b => b.code === 'daily-cap-reached'));
});

test('recordExternalSend is the only path that ever sets externallyPerformedSend, and it requires performedBy', async () => {
  const store = await harness();
  const opportunity = await seedOpportunity(store);
  const draft = await store.add('messageDrafts', buildMessageDraft({ opportunityId: opportunity.id, channel: 'referral_intro', body: 'hi' }));
  const approval = await decideApproval(store, (await store.add('approvals', buildApprovalPacket({ opportunity, draft, offer: OFFER }))).id, 'approved', { actor: 'owner' });
  const handoff = await createSendHandoff(store, { approval, draft, opportunity, mode: 'export-only', config: CAP_CONFIG });
  assert.equal(handoff.data.externallyPerformedSend, false);
  await assert.rejects(() => recordExternalSend(store, handoff.id, {}), OutboundError);
  const recorded = await recordExternalSend(store, handoff.id, { performedBy: 'owner' });
  assert.equal(recorded.data.externallyPerformedSend, true);
});

test('quarantineUncertainSend marks a send uncertain without deleting its history', async () => {
  const store = await harness();
  const opportunity = await seedOpportunity(store);
  const draft = await store.add('messageDrafts', buildMessageDraft({ opportunityId: opportunity.id, channel: 'referral_intro', body: 'hi' }));
  const approval = await decideApproval(store, (await store.add('approvals', buildApprovalPacket({ opportunity, draft, offer: OFFER }))).id, 'approved', { actor: 'owner' });
  const handoff = await createSendHandoff(store, { approval, draft, opportunity, mode: 'export-only', config: CAP_CONFIG });
  const quarantined = await quarantineUncertainSend(store, handoff.id, 'operator unsure whether email actually went out');
  assert.equal(quarantined.status, 'uncertain-quarantined');
  assert.equal(quarantined.data.uncertainReason, 'operator unsure whether email actually went out');
  assert.equal(quarantined.data.channel, 'referral_intro', 'original data must survive the patch, not be wiped');
});

test('recipientMessageHash is deterministic and idempotency-key-shaped (same inputs -> same hash)', () => {
  assert.equal(recipientMessageHash('a.example.com', 'hash1'), recipientMessageHash('a.example.com', 'hash1'));
  assert.notEqual(recipientMessageHash('a.example.com', 'hash1'), recipientMessageHash('b.example.com', 'hash1'));
});
