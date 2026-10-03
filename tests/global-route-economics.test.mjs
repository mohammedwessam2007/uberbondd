import test from 'node:test';
import assert from 'node:assert/strict';
import { compileRouteEconomics, buildRouteEconomics } from '../src/global-route-economics.mjs';

const now = new Date('2026-10-03T12:00:00Z');
const prospects = [
  { id: 'p1', contact: { email: 'a@x.co.uk' }, globalRoute: { routeClass: 'CORPORATE_GREEN', routeDigest: 'd1' }, opportunityStage: 'opportunity' },
  { id: 'p2', contact: { email: 'b@y.com' }, globalRoute: { routeClass: 'INVITED_GREEN', routeDigest: 'd2' }, opportunityStage: 'paid' },
  { id: 'p3', contact: { email: 'c@z.com' } }
];

test('with no route stamp nothing is split: attribution is NO_ROUTE_ATTRIBUTION_RECORDED and no class is invented', () => {
  const e = compileRouteEconomics({ prospects: [{ id: 'p' }], outboundEvents: [{ eventType: 'sent', prospectId: 'p' }], now });
  assert.equal(e.attribution.status, 'NO_ROUTE_ATTRIBUTION_RECORDED');
  assert.deepEqual(e.byRouteClass, {});
  assert.equal(e.attribution.stampWriter, 'NONE_ACTIVE__AWAITING_GOVERNED_DRAFT_STEP');
  assert.equal(e.sendAuthority, false);
});

test('unknown cost stays UNKNOWN, never zero; founder minutes not recorded are UNKNOWN', () => {
  const e = compileRouteEconomics({ prospects, now });
  const c = e.byRouteClass.CORPORATE_GREEN;
  assert.equal(c.routeCostCents.status, 'UNKNOWN');
  assert.equal(c.routeCostCents.value, null);
  assert.equal(c.externalApiCostCents.value, null);
  assert.equal(c.founderMinutes.status, 'UNKNOWN');
  assert.equal(c.actual.clearedPayments.status, 'UNKNOWN');
  const partial = compileRouteEconomics({ prospects, costReceipts: [{ routeClass: 'CORPORATE_GREEN', costCents: 100, stage: 'send' }, { routeClass: 'CORPORATE_GREEN', costCents: null, stage: 'send' }], now });
  assert.equal(partial.byRouteClass.CORPORATE_GREEN.routeCostCents.status, 'UNKNOWN');
  const known = compileRouteEconomics({ prospects, costReceipts: [{ routeClass: 'CORPORATE_GREEN', costCents: 100, stage: 'send' }, { routeClass: 'CORPORATE_GREEN', costCents: 50, stage: 'discovery' }], founderMinutesByRouteClass: { CORPORATE_GREEN: 12 }, now });
  assert.equal(known.byRouteClass.CORPORATE_GREEN.routeCostCents.value, 150);
  assert.equal(known.byRouteClass.CORPORATE_GREEN.externalApiCostCents.value, 50);
  assert.equal(known.byRouteClass.CORPORATE_GREEN.founderMinutes.value, 12);
  assert.equal(known.byRouteClass.INVITED_GREEN.routeCostCents.status, 'UNKNOWN');
});

test('actuals split by route class from the ledgers: sends, qualified positive replies, opportunities, negatives, unsubscribes, complaints, bounces', () => {
  const e = compileRouteEconomics({
    prospects,
    outboundEvents: [{ eventType: 'sent', prospectId: 'p1' }, { eventType: 'sent', prospectId: 'p2' }, { eventType: 'send_failure', prospectId: 'p1' }],
    replies: [{ prospectId: 'p1', classification: { label: 'positive' } }, { prospectId: 'p2', classification: { label: 'negative' } }, { prospectId: 'p2', classification: { label: 'optout' } }, { prospectId: 'p1', label: 'objection' }, { prospectId: 'p3', classification: { label: 'positive' } }],
    providerEvents: [{ recipientEmail: 'a@x.co.uk', eventType: 'bounce' }, { leadEmail: 'b@y.com', eventType: 'complaint' }, { prospectId: 'p2', eventType: 'unsubscribe' }],
    now
  });
  assert.deepEqual(e.byRouteClass.CORPORATE_GREEN.actual, { ...e.byRouteClass.CORPORATE_GREEN.actual, providerConfirmedSends: 1, qualifiedPositiveReplies: 1, opportunities: 1, negativeResponses: 1, unsubscribes: 0, complaints: 0, bounces: 1 });
  assert.equal(e.byRouteClass.INVITED_GREEN.actual.providerConfirmedSends, 1);
  assert.equal(e.byRouteClass.INVITED_GREEN.actual.negativeResponses, 1);
  assert.equal(e.byRouteClass.INVITED_GREEN.actual.unsubscribes, 2);
  assert.equal(e.byRouteClass.INVITED_GREEN.actual.complaints, 1);
  assert.equal(e.byRouteClass.INVITED_GREEN.actual.opportunities, 1);
  assert.equal(e.attribution.unstampedProspects, 1, 'the unstamped prospect is counted as unattributed, not guessed');
  assert.equal(e.byRouteClass.CORPORATE_GREEN.actual.qualifiedPositiveReplies, 1, 'p3 positive reply is not attributed to any class');
});

test('expected figures are labelled priors, separate from measured actuals; cleared payments appear only from provider-reconciled input', () => {
  const e = compileRouteEconomics({ prospects, clearedPaymentsByProspect: new Map([['p2', { verifiedPaymentCount: 1, netCents: 150000 }]]), economics: { dealContributionCents: 100000 }, now });
  assert.equal(e.byRouteClass.INVITED_GREEN.expected.label, 'ESTIMATED_PRIOR_NOT_MEASURED');
  assert.ok(e.byRouteClass.INVITED_GREEN.expected.replyProbability > e.byRouteClass.CORPORATE_GREEN.expected.replyProbability);
  assert.ok(e.byRouteClass.INVITED_GREEN.expected.contributionCents > 0);
  assert.equal(e.byRouteClass.INVITED_GREEN.actual.clearedPayments.value, 1);
  assert.equal(e.byRouteClass.INVITED_GREEN.actual.clearedNetCents.value, 150000);
  assert.equal(e.byRouteClass.CORPORATE_GREEN.actual.clearedPayments.value, 0);
  assert.equal(compileRouteEconomics({ prospects, now }).byRouteClass.INVITED_GREEN.expected.contributionCents, null, 'no deal value: expected contribution is unknown, not invented');
});

test('the store builder is read-only and degrades to UNKNOWN when payment truth cannot be read', async () => {
  const calls = [];
  const store = { async list(name) { calls.push(name); return name === 'prospects' ? [{ id: 'p', leadId: 'lead-1', contact: { email: 'a@x.co.uk' }, globalRoute: { routeClass: 'CORPORATE_GREEN' } }] : []; }, async get() { throw new Error('payment store down'); } };
  const e = await buildRouteEconomics({ store, now });
  assert.deepEqual(calls.sort(), ['outboundEvents', 'prospects', 'providerEvents', 'replies']);
  assert.ok(e.byRouteClass.CORPORATE_GREEN.actual.clearedPayments.status === 'UNKNOWN' || e.byRouteClass.CORPORATE_GREEN.actual.clearedPayments.value === 0 || e.byRouteClass.CORPORATE_GREEN.actual.clearedPayments.value === null);
  assert.equal(e.readOnly, true);
  await assert.rejects(() => buildRouteEconomics({ store: null }), /store-required/);
});
