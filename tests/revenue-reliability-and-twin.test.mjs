import test from 'node:test';
import assert from 'node:assert/strict';
import { wilson, correlationFirewall, localizeFailure, marketEscape, allocateContextual, counterfactualAutopsy } from '../src/revenue-reliability.mjs';
import { compileUberClose, compileBuyingGroup } from '../src/decision-twin.mjs';

test('wilson never turns a tiny sample into a fact', () => {
  assert.ok(wilson(1, 1).lower < 0.5);
  assert.equal(wilson(0, 0).n, 0);
  assert.ok(wilson(50, 100).lower < 0.5 && wilson(50, 100).upper > 0.5);
});

test('correlation firewall collapses evidence sharing one upstream source', () => {
  const r = correlationFirewall([{ sourceKey: 'dir-A' }, { sourceKey: 'dir-A' }, { sourceKey: 'dir-A' }, { sourceKey: 'site-B' }]);
  assert.equal(r.rawCount, 4); assert.equal(r.independentCount, 2); assert.equal(r.collapsed, 2);
  assert.equal(correlationFirewall([{}, {}]).unkeyedTreatedAsIndependentButFlagged, 2);
});

test('failure localization blames the EARLIEST broken stage and refuses to blame on thin samples', () => {
  const broken = localizeFailure({ SENT: 500, DELIVERED: 200, REPLIED: 2, QUALIFIED_REPLY: 0, PRICED: 0, PAID: 0 });
  assert.equal(broken.earliestBrokenStage, 'DELIVERED');
  assert.equal(broken.verdict, 'ATTACK_EARLIEST_BROKEN_STAGE');
  const thin = localizeFailure({ SENT: 10, DELIVERED: 2, REPLIED: 0 });
  assert.equal(thin.earliestBrokenStage, null);
  assert.equal(thin.verdict, 'UNKNOWN_COLLECT_MORE_BEFORE_CHANGING_ANYTHING');
  const healthy = localizeFailure({ SENT: 400, DELIVERED: 380, REPLIED: 30, QUALIFIED_REPLY: 12, PRICED: 8, PAID: 3, ACCEPTED: 3 });
  assert.equal(healthy.earliestBrokenStage, null);
});

test('market escape needs sample; safety signals pause regardless of sample', () => {
  assert.equal(marketEscape({ sends: 20, positiveReplies: 0 }).decision, 'KEEP_TESTING');
  assert.equal(marketEscape({ sends: 3, complaints: 1 }).decision, 'PAUSE_AND_INVESTIGATE');
  assert.equal(marketEscape({ sends: 100, hardBounces: 5 }).decision, 'PAUSE_AND_INVESTIGATE');
  assert.equal(marketEscape({ sends: 400, positiveReplies: 0 }).decision, 'ESCAPE_MARKET_PRESERVE_RESURRECTION_CONDITION');
  assert.equal(marketEscape({ sends: 400, positiveReplies: 0, paid: 1 }).decision, 'KEEP_TESTING');
});

test('allocation keeps a bounded challenger share and sums to total slots', () => {
  const a = allocateContextual([{ id: 'A', sends: 200, positive: 20 }, { id: 'B', sends: 20, positive: 2 }, { id: 'C', sends: 0, positive: 0 }], { totalSlots: 10 });
  assert.equal(a.champion, 'A');
  assert.equal(a.allocations.reduce((s, x) => s + x.slots, 0), 10);
  assert.ok(a.allocations.filter(x => x.role === 'CHALLENGER').every(x => x.slots >= 0));
  assert.ok(a.exploreShare >= 0.1 && a.exploreShare <= 0.3);
  assert.equal(allocateContextual([], {}).champion, null);
});

test('counterfactual autopsy refuses causal claims without a holdout or sample', () => {
  assert.equal(counterfactualAutopsy({ treated: { n: 100, positive: 10 } }).causalClaim, 'NOT_ESTABLISHED');
  assert.equal(counterfactualAutopsy({ treated: { n: 10, positive: 5 }, holdout: { n: 10, positive: 0 } }).causalClaim, 'NOT_ESTABLISHED');
  assert.match(counterfactualAutopsy({ treated: { n: 400, positive: 80 }, holdout: { n: 400, positive: 8 } }).causalClaim, /TREATMENT_BETTER/);
});

test('UberClose downgrades any cash stage lacking cleared provider evidence', () => {
  const claimed = compileUberClose({ deal: { stage: 'PAID_CLEARED', paymentEvidence: { cleared: false } } });
  assert.equal(claimed.stage, 'PAYMENT_REQUESTED'); assert.equal(claimed.stageDowngradedForMissingPaymentEvidence, true);
  const real = compileUberClose({ deal: { stage: 'PAID_CLEARED', paymentEvidence: { cleared: true, providerTransactionId: 'tx1' } } });
  assert.equal(real.stage, 'PAID_CLEARED');
  assert.equal(real.nextBestAction.sendsAutomatically, false); assert.equal(real.authority, 'MANUAL_MOHAMED');
});

test('buying group never promotes an inferred role to known and flags single-threading', () => {
  const g = compileBuyingGroup({ contacts: [{ contactRef: 'c1', role: 'economic_buyer', engaged: true }, { contactRef: 'c2', role: 'blocker', statedBy: 'c1' }] });
  assert.equal(g.members[0].basis, 'INFERRED');
  assert.ok(g.gaps.includes('economic-buyer-not-confirmed') && g.gaps.includes('no-confirmed-champion') && g.gaps.includes('unaddressed-blocker'));
  assert.equal(g.singleThreaded, true);
  const twin = compileUberClose({ deal: { stage: 'QUALIFYING', contacts: [{ contactRef: 'c1', role: 'economic_buyer', engaged: true }] } });
  assert.ok(twin.championSupport.length >= 1);
});
