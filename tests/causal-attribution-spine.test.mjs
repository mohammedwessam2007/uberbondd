import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeAttributionNode,
  normalizeAttributionEdge,
  commercialOutcomeToAttributionNode,
  buildCausalAttributionGraph,
  traceEconomicAttribution
} from '../src/causal-attribution-spine.mjs';

function node(id, type, minute, extra = {}) {
  return { nodeId: id, type, occurredAt: `2026-08-22T00:${String(minute).padStart(2,'0')}:00Z`, truthLevel: 'VERIFIED_LOCAL', evidenceRefs: [`test:${id}`], ...extra };
}
function edge(sourceId, targetId, relation, extra = {}) {
  return { sourceId, targetId, relation, basis: 'DIRECT', evidenceRefs: [`test:${sourceId}->${targetId}`], ...extra };
}
function clearedOutcome(id = 'out-1', amount = 50000) {
  return {
    ok: true,
    outcomeId: id,
    status: 'RECORDED_CLEARED_PAYMENT',
    truthLevel: 'CLEARED_PAYMENT',
    outcomeType: 'PAYMENT_CLEARED',
    occurredAt: '2026-08-22T00:09:00Z',
    lineage: { opportunityId: 'opp-1' },
    paymentProof: { providerEventId: `evt-${id}`, amountCents: amount, currency: 'USD' }
  };
}

test('normalizes explicit evidence-backed nodes and direct edges', () => {
  assert.equal(normalizeAttributionNode(node('signal:1','SIGNAL',1)).ok, true);
  assert.equal(normalizeAttributionEdge(edge('signal:1','opp:1','SUPPORTED')).ok, true);
});

test('DIRECT edge requires evidence', () => {
  const result = normalizeAttributionEdge({ sourceId:'a', targetId:'b', relation:'SUPPORTED', basis:'DIRECT' });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('direct-edge-evidence-required'));
});

test('commercial outcome adapter recognizes cleared payment but does not infer one', () => {
  const payment = commercialOutcomeToAttributionNode(clearedOutcome());
  assert.equal(payment.ok, true);
  assert.equal(payment.type, 'PAYMENT');
  assert.equal(payment.economicProof.amountCents, 50000);
  const fake = commercialOutcomeToAttributionNode({ outcomeId:'fake', truthLevel:'CLEARED_PAYMENT' });
  assert.equal(fake.ok, false);
});

test('ordinary node cannot smuggle amount without commercial proof', () => {
  const result = normalizeAttributionNode(node('reply:1','RESPONSE',5,{ amountCents:999999 }));
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('economic-value-requires-normalized-commercial-proof'));
});

test('builds a complete direct chain to a verified payment anchor', () => {
  const nodes = [
    node('signal:1','SIGNAL',1), node('opp:1','OPPORTUNITY',2), node('exp:1','EXPERIMENT',3),
    node('offer:1','OFFER',4), node('action:1','ACTION',5), node('reply:1','RESPONSE',6), node('checkout:1','CHECKOUT',7)
  ];
  const outcome = clearedOutcome();
  const paymentId = `outcome:${outcome.outcomeId}`;
  const edges = [
    edge('signal:1','opp:1','SUPPORTED'), edge('opp:1','exp:1','SELECTED_FOR'), edge('exp:1','offer:1','COMPILED'),
    edge('offer:1','action:1','DISTRIBUTED_AS'), edge('action:1','reply:1','RECEIVED_RESPONSE'), edge('reply:1','checkout:1','ASSOCIATED_CHECKOUT'),
    edge('checkout:1',paymentId,'ASSOCIATED_PAYMENT')
  ];
  const graph = buildCausalAttributionGraph({ nodes, edges, commercialOutcomes:[outcome] });
  assert.equal(graph.ok, true);
  assert.equal(graph.status, 'VERIFIED_SHAPE');
  assert.equal(graph.economicAnchors.length, 1);
  assert.equal(graph.economicAnchors[0].amountCents, 50000);
  const trace = traceEconomicAttribution({ graph, economicNodeId: paymentId });
  assert.equal(trace.ok, true);
  assert.equal(trace.associationClass, 'DIRECT_EVIDENCE_CHAIN');
  assert.equal(trace.ancestorNodes.length, 7);
  assert.equal(trace.allocationAuthority, 'NONE');
});

test('exact duplicate nodes dedupe without conflict', () => {
  const a = node('signal:1','SIGNAL',1);
  const graph = buildCausalAttributionGraph({ nodes:[a, structuredClone(a)] });
  assert.equal(graph.ok, true);
  assert.equal(graph.nodes.length, 1);
  assert.equal(graph.diagnostics.duplicateNodeCount, 1);
});

test('same node identity with divergent facts is a contradiction', () => {
  const graph = buildCausalAttributionGraph({ nodes:[node('x','SIGNAL',1), node('x','OPPORTUNITY',1)] });
  assert.equal(graph.ok, false);
  assert.equal(graph.status, 'CONTRADICTED');
  assert.deepEqual(graph.diagnostics.nodeIdentityConflicts, ['x']);
});

test('missing edge endpoint degrades instead of inventing node', () => {
  const graph = buildCausalAttributionGraph({ nodes:[node('a','SIGNAL',1)], edges:[edge('a','missing','SUPPORTED')] });
  assert.equal(graph.ok, true);
  assert.equal(graph.status, 'DEGRADED');
  assert.equal(graph.nodes.some(n => n.nodeId === 'missing'), false);
  assert.equal(graph.diagnostics.missingEndpointEdges.length, 1);
});

test('cycle is contradicted and never treated as lineage', () => {
  const nodes = [node('a','SIGNAL',1), node('b','OPPORTUNITY',2)];
  const graph = buildCausalAttributionGraph({ nodes, edges:[edge('a','b','A_TO_B'), edge('b','a','B_TO_A')] });
  assert.equal(graph.ok, false);
  assert.equal(graph.status, 'CONTRADICTED');
  assert.ok(graph.diagnostics.cycle);
});

test('temporal reversal degrades evidence quality', () => {
  const graph = buildCausalAttributionGraph({ nodes:[node('later','SIGNAL',9), node('earlier','OPPORTUNITY',1)], edges:[edge('later','earlier','IMPOSSIBLE_TIME')] });
  assert.equal(graph.ok, true);
  assert.equal(graph.status, 'DEGRADED');
  assert.equal(graph.diagnostics.timeReversalEdges.length, 1);
});

test('inferred edge downgrades trace to hypothesis', () => {
  const outcome = clearedOutcome();
  const paymentId = `outcome:${outcome.outcomeId}`;
  const graph = buildCausalAttributionGraph({
    nodes:[node('action:1','ACTION',5)],
    commercialOutcomes:[outcome],
    edges:[edge('action:1',paymentId,'MAYBE_CAUSED',{ basis:'INFERRED', evidenceRefs:[], confidence:.2 })]
  });
  const trace = traceEconomicAttribution({ graph, economicNodeId:paymentId });
  assert.equal(trace.associationClass, 'HYPOTHESIS');
  assert.equal(trace.weakestConfidence, .2);
  assert.match(trace.attributionWarning, /does not allocate/i);
});

test('attributed association remains weaker than direct evidence', () => {
  const outcome = clearedOutcome();
  const paymentId = `outcome:${outcome.outcomeId}`;
  const graph = buildCausalAttributionGraph({
    nodes:[node('checkout:1','CHECKOUT',7)], commercialOutcomes:[outcome],
    edges:[edge('checkout:1',paymentId,'MATCHED_BY_SESSION',{ basis:'ATTRIBUTED', confidence:.8 })]
  });
  const trace = traceEconomicAttribution({ graph, economicNodeId:paymentId });
  assert.equal(trace.associationClass, 'ATTRIBUTED_ASSOCIATION');
});

test('refund carries negative signed cash impact only from payment proof', () => {
  const refund = {
    ok:true, outcomeId:'refund-1', status:'RECORDED_REFUND_OR_DISPUTE', truthLevel:'REFUND_OR_DISPUTE', outcomeType:'REFUND',
    occurredAt:'2026-08-22T00:10:00Z', lineage:{ opportunityId:'opp-1' },
    paymentProof:{ providerEventId:'evt-refund', amountCents:12000, currency:'USD' }
  };
  const graph = buildCausalAttributionGraph({ commercialOutcomes:[refund] });
  assert.equal(graph.economicAnchors[0].signedCashImpactCents, -12000);
});

test('invalid confidence and malformed evidence refs fail closed', () => {
  assert.equal(normalizeAttributionEdge({ sourceId:'a',targetId:'b',relation:'X_LINK',basis:'INFERRED',confidence:2 }).ok,false);
  assert.equal(normalizeAttributionNode({ nodeId:'a',type:'SIGNAL',occurredAt:'2026-08-22',evidenceRefs:['https://raw.example'] }).ok,false);
});

test('graph never grants spend or allocation authority', () => {
  const graph = buildCausalAttributionGraph({ nodes:[node('a','SIGNAL',1)] });
  assert.equal(graph.authorization.allocation,'DISABLED');
  assert.equal(graph.authorization.spend,'DISABLED');
  assert.ok(Object.values(graph.externalEffectLedger).every(v => v === 0));
});
