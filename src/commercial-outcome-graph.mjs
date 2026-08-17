// Unifies the spine's lineage as typed edges over canonical objects that
// already exist elsewhere (MarketSignal, genome candidate, scored
// opportunity, experiment, distribution decision, outcome) -- this module
// creates no new truth of its own, only references. Persistence reuses the
// existing auditLog writer; no new collection, no duplicate Revenue Ledger.
export const COMMERCIAL_OUTCOME_GRAPH_POLICY_VERSION = 'commercial-outcome-graph-1.0.0';

const NODE_TYPES = Object.freeze([
  'MarketSignal', 'BusinessGenome', 'Opportunity', 'CommercialExperiment',
  'DistributionDecision', 'SimulatedOutcome', 'RealOutcome'
]);

function node(type, id, extra = {}) {
  if (!NODE_TYPES.includes(type)) throw new TypeError(`unknown node type: ${type}`);
  return { type, id, ...extra };
}

// Pure: builds the lineage graph in memory from already-computed stage
// outputs. Any stage the caller doesn't have yet is simply omitted --
// this never fabricates a missing stage.
export function buildCommercialOutcomeGraph({ signals = [], genomeCandidate, scoredOpportunity, experiment, distributionDecision, outcome, isSynthetic = false } = {}) {
  const nodes = [];
  const edges = [];
  const add = (type, id, extra) => { const n = node(type, id, extra); nodes.push(n); return n; };

  const signalNodes = signals.filter(s => s?.ok).map(s => add('MarketSignal', s.signalId, { evidenceClass: s.evidenceClass }));

  let genomeNode = null;
  if (genomeCandidate?.ok) {
    genomeNode = add('BusinessGenome', genomeCandidate.candidate.id, { evidenceRefs: genomeCandidate.candidate.evidenceRefs });
    for (const s of signalNodes) edges.push({ from: s.id, to: genomeNode.id, relation: 'INFORMS' });
  }

  let opportunityNode = null;
  if (scoredOpportunity?.ok) {
    opportunityNode = add('Opportunity', scoredOpportunity.id, { compositeScore: scoredOpportunity.compositeScore, confidence: scoredOpportunity.confidence });
    if (genomeNode) edges.push({ from: genomeNode.id, to: opportunityNode.id, relation: 'SCORED_AS' });
  }

  let experimentNode = null;
  if (experiment?.ok) {
    experimentNode = add('CommercialExperiment', experiment.experimentId);
    if (opportunityNode) edges.push({ from: opportunityNode.id, to: experimentNode.id, relation: 'COMPILED_INTO' });
  }

  let distributionNode = null;
  if (distributionDecision?.ok) {
    distributionNode = add('DistributionDecision', `${experiment?.experimentId || 'unknown'}:${distributionDecision.timestamp}`, { decision: distributionDecision.decision, selectedChannel: distributionDecision.selectedChannel });
    if (experimentNode) edges.push({ from: experimentNode.id, to: distributionNode.id, relation: 'ALLOCATED_BY' });
  }

  let outcomeNode = null;
  if (outcome) {
    const outcomeType = isSynthetic ? 'SimulatedOutcome' : 'RealOutcome';
    outcomeNode = add(outcomeType, outcome.id || `${experiment?.experimentId || 'unknown'}:outcome`, { outcomeType: outcome.type, magnitude: outcome.magnitude ?? null, synthetic: isSynthetic });
    if (distributionNode) edges.push({ from: distributionNode.id, to: outcomeNode.id, relation: 'PRODUCED' });
    else if (experimentNode) edges.push({ from: experimentNode.id, to: outcomeNode.id, relation: 'PRODUCED' });
  }

  return { ok: true, policyVersion: COMMERCIAL_OUTCOME_GRAPH_POLICY_VERSION, nodes, edges, isSynthetic };
}

// Optional persistence: one audit receipt per edge, reusing store.log().
export async function persistCommercialOutcomeGraph(store, graph) {
  if (!store || typeof store.log !== 'function' || !graph?.ok) return null;
  const receipts = [];
  for (const edge of graph.edges) {
    receipts.push(await store.log('commercial_outcome_edge', { ...edge, isSynthetic: graph.isSynthetic, policyVersion: graph.policyVersion }));
  }
  return receipts;
}
