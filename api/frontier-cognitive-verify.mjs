import { compileFrontierCognitivePlan, buildFrontierCognitiveReceipt } from '../src/frontier-cognitive-fabric.mjs';
import { normalizeModelBenchmark } from '../src/agent-model-router.mjs';

const NOW = new Date('2026-09-04T20:00:00.000Z');
const FRESH = '2026-09-04T19:00:00.000Z';

function profile(overrides = {}) {
  const provider = overrides.provider ?? 'openai';
  const model = overrides.model ?? 'frontier-a';
  return {
    id: overrides.id ?? `${provider}-${model}`.replace(/[^a-z0-9._-]/gi, '-').toLowerCase(),
    provider,
    model,
    revision: overrides.revision ?? 'rev-1',
    transportProvider: overrides.transportProvider ?? (provider === 'anthropic' ? 'anthropic' : 'ai-gateway'),
    transportModel: overrides.transportModel ?? `${provider}/${model}`,
    transportSourceRef: overrides.transportSourceRef ?? 'official://transport',
    transportVerifiedAt: overrides.transportVerifiedAt ?? FRESH,
    transportEvidenceClass: overrides.transportEvidenceClass ?? 'OFFICIAL_SOURCE',
    taskClasses: overrides.taskClasses ?? ['general', 'coding', 'research'],
    roles: overrides.roles ?? ['general', 'builder', 'researcher', 'critic', 'adjudicator'],
    allowedDataClasses: overrides.allowedDataClasses ?? ['PUBLIC', 'INTERNAL_NON_SECRET'],
    reasoningBindings: overrides.reasoningBindings ?? {
      FAST: { settingRef: `${provider}:fast:v1`, sourceRef: 'official://reasoning', verifiedAt: FRESH, evidenceClass: 'OFFICIAL_SOURCE' },
      STANDARD: { settingRef: `${provider}:standard:v1`, sourceRef: 'official://reasoning', verifiedAt: FRESH, evidenceClass: 'OFFICIAL_SOURCE' },
      DEEP: { settingRef: `${provider}:deep:v1`, sourceRef: 'official://reasoning', verifiedAt: FRESH, evidenceClass: 'OFFICIAL_SOURCE' },
      FRONTIER_MAX: { settingRef: `${provider}:frontier-max:v1`, sourceRef: 'official://reasoning', verifiedAt: FRESH, evidenceClass: 'OFFICIAL_SOURCE' }
    },
    pricingVerifiedAt: overrides.pricingVerifiedAt ?? FRESH,
    pricingSourceRef: overrides.pricingSourceRef ?? 'official://pricing',
    pricingEvidenceClass: overrides.pricingEvidenceClass ?? 'OFFICIAL_SOURCE',
    maxContextTokens: overrides.maxContextTokens ?? 200000,
    maxOutputTokens: overrides.maxOutputTokens ?? 32000,
    centsPerMillionInputTokens: overrides.centsPerMillionInputTokens ?? 100,
    centsPerMillionOutputTokens: overrides.centsPerMillionOutputTokens ?? 500,
    identityAliases: overrides.identityAliases ?? [model],
    enabled: overrides.enabled ?? true,
    ...overrides
  };
}

function callability(p, overrides = {}) {
  return {
    profileId: p.id,
    status: 'CALLABLE_NOW',
    observedProvider: p.provider,
    observedModel: p.model,
    observedRevision: p.revision,
    observedTransportProvider: p.transportProvider,
    observedTransportModel: p.transportModel,
    observedAt: FRESH,
    sourceRef: 'runtime://identity-probe',
    evidenceClass: 'OBSERVED_RUNTIME',
    identityVerification: 'OBSERVED',
    ...overrides
  };
}

function benchmark(p, overrides = {}) {
  return normalizeModelBenchmark({
    provider: p.provider,
    model: p.model,
    taskClasses: p.taskClasses,
    taskClass: overrides.taskClass ?? 'general',
    quality: overrides.quality ?? 0.95,
    reliability: overrides.reliability ?? 0.95,
    latencyScore: overrides.latencyScore ?? 0.7,
    economicImpact: overrides.economicImpact ?? 0.8,
    evidenceConfidence: overrides.evidenceConfidence ?? 0.95,
    costEfficiency: overrides.costEfficiency ?? 0.5
  }, new Date(overrides.observedAt ?? FRESH));
}

function contextArtifacts() {
  return [
    { id: 'constitution', kind: 'CONSTITUTION', contentRef: 'repo://constitution', tags: ['core'], dependencies: [], estimatedTokens: 1000, priority: 100, immutable: true },
    { id: 'frontier-task-evidence', kind: 'EVIDENCE', contentRef: 'repo://frontier-evidence', tags: ['frontier'], dependencies: ['constitution'], estimatedTokens: 1200, priority: 90 },
    { id: 'irrelevant-history', kind: 'HISTORY', contentRef: 'repo://history', tags: ['history'], dependencies: ['constitution'], estimatedTokens: 50000, priority: 10 }
  ];
}

function task(overrides = {}) {
  return {
    missionId: 'frontier-fabric-runtime-proof',
    taskId: 'solve-frontier-task',
    objective: 'Solve one high-value bounded problem.',
    taskClass: 'general',
    role: 'general',
    dataClass: 'INTERNAL_NON_SECRET',
    reasoningTier: 'FRONTIER_MAX',
    requiredTags: ['frontier'],
    contextTokenBudget: 10000,
    minCouncilSize: 2,
    maxCouncilSize: 2,
    ...overrides
  };
}

function check(name, fn, results) {
  try {
    const detail = fn();
    results.push({ name, ok: true, detail: detail ?? null });
  } catch (error) {
    results.push({ name, ok: false, detail: String(error?.message ?? error).slice(0, 300) });
  }
}
function insist(condition, message) { if (!condition) throw new Error(message); }

export default async function handler(req, res) {
  if (String(req?.method || '').toUpperCase() !== 'GET') return res.status(405).json({ ok: false, status: 'METHOD_NOT_ALLOWED' });
  const results = [];

  check('frontier-quality-beats-free-cost', () => {
    const elite = profile({ id: 'elite', provider: 'openai', model: 'elite', centsPerMillionInputTokens: 1000, centsPerMillionOutputTokens: 5000 });
    const cheap = profile({ id: 'cheap', provider: 'qwen', model: 'cheap', centsPerMillionInputTokens: 0, centsPerMillionOutputTokens: 0 });
    const out = compileFrontierCognitivePlan({ task: task(), profiles: [elite, cheap], callability: [callability(elite), callability(cheap)], benchmarks: [benchmark(elite, { quality: 0.98, costEfficiency: 0.05 }), benchmark(cheap, { quality: 0.82, costEfficiency: 1 })], contextArtifacts: contextArtifacts(), now: NOW });
    insist(out.ok && out.plan.selected.profileId === 'elite', JSON.stringify({ status: out.status, selected: out.plan?.selected?.profileId, reasons: out.reasonCodes }));
  }, results);

  check('task-model-endpoint-injection-ignored', () => {
    const p = profile({ id: 'elite', provider: 'openai', model: 'elite' });
    const out = compileFrontierCognitivePlan({ task: task({ model: 'attacker/model', endpoint: 'https://attacker.invalid' }), profiles: [p], callability: [callability(p)], benchmarks: [benchmark(p)], contextArtifacts: contextArtifacts(), now: NOW });
    insist(out.ok && out.plan.selected.model === 'elite', JSON.stringify({ status: out.status, reasons: out.reasonCodes }));
  }, results);

  check('configured-not-observed-callability-blocks', () => {
    const p = profile({ id: 'p' });
    const out = compileFrontierCognitivePlan({ task: task(), profiles: [p], callability: [callability(p, { evidenceClass: 'CONFIG_ONLY', identityVerification: 'UNVERIFIED' })], benchmarks: [benchmark(p)], contextArtifacts: contextArtifacts(), now: NOW });
    insist(!out.ok && out.status === 'CAPACITY_BLOCKED' && out.blocked?.[0]?.reasonCodes?.includes('callability-not-observed-runtime-evidence'), JSON.stringify({ status: out.status, blocked: out.blocked }));
  }, results);

  check('stale-callability-blocks', () => {
    const p = profile({ id: 'p' });
    const out = compileFrontierCognitivePlan({ task: task(), profiles: [p], callability: [callability(p, { observedAt: '2026-08-01T00:00:00.000Z' })], benchmarks: [benchmark(p)], contextArtifacts: contextArtifacts(), now: NOW });
    insist(!out.ok && out.status === 'CAPACITY_BLOCKED', JSON.stringify({ status: out.status, blocked: out.blocked }));
  }, results);

  check('duplicate-cognitive-identity-rejected', () => {
    const a = profile({ id: 'a', provider: 'openai', model: 'same' });
    const b = profile({ id: 'b', provider: 'openai', model: 'same' });
    const out = compileFrontierCognitivePlan({ task: task(), profiles: [a, b], callability: [], benchmarks: [], contextArtifacts: contextArtifacts(), now: NOW });
    insist(!out.ok && out.status === 'FRONTIER_PROFILE_SET_INVALID' && out.reasonCodes.some(x => x.startsWith('duplicate-cognitive-identity:')), JSON.stringify({ status: out.status, reasons: out.reasonCodes }));
  }, results);

  check('frontier-policy-thresholds-bounded', () => {
    const p = profile({ id: 'p' });
    const out = compileFrontierCognitivePlan({ task: task(), profiles: [p], callability: [callability(p)], benchmarks: [benchmark(p)], contextArtifacts: contextArtifacts(), frontierQualityDelta: 0.5, now: NOW });
    insist(!out.ok && out.status === 'FRONTIER_POLICY_INVALID', JSON.stringify({ status: out.status, reasons: out.reasonCodes }));
  }, results);

  check('council-independent-adjudicator-and-valid-fable-graph', () => {
    const a = profile({ id: 'a', provider: 'openai', model: 'a' });
    const b = profile({ id: 'b', provider: 'anthropic', model: 'b', transportProvider: 'anthropic', transportModel: 'b' });
    const c = profile({ id: 'c', provider: 'google', model: 'c' });
    const out = compileFrontierCognitivePlan({ task: task({ reasoningTier: 'COUNCIL_MAX', minCouncilSize: 2, maxCouncilSize: 2 }), profiles: [a, b, c], callability: [callability(a), callability(b), callability(c)], benchmarks: [benchmark(a, { quality: 0.98 }), benchmark(b, { quality: 0.97 }), benchmark(c, { quality: 0.96 })], contextArtifacts: contextArtifacts(), now: NOW });
    insist(out.ok && out.status === 'COUNCIL_PLAN_READY', JSON.stringify({ status: out.status, reasons: out.reasonCodes }));
    insist(!out.plan.responders.some(x => x.profileId === out.plan.adjudicator.profileId), 'adjudicator overlaps responder');
    insist(out.plan.graph.maxDepth === 1, `canonical FABLE_GRAPH depth mismatch:${out.plan.graph.maxDepth}`);
    insist(out.plan.graph.nodes.filter(x => x.id.startsWith('independent_')).every(x => x.dependencies.length === 0), 'first-pass dependency contamination');
  }, results);

  check('council-without-third-chair-fails-closed', () => {
    const a = profile({ id: 'a', provider: 'openai', model: 'a' });
    const b = profile({ id: 'b', provider: 'anthropic', model: 'b', transportProvider: 'anthropic', transportModel: 'b' });
    const out = compileFrontierCognitivePlan({ task: task({ reasoningTier: 'COUNCIL_MAX' }), profiles: [a, b], callability: [callability(a), callability(b)], benchmarks: [benchmark(a), benchmark(b)], contextArtifacts: contextArtifacts(), now: NOW });
    insist(!out.ok && out.status === 'CAPACITY_BLOCKED' && out.reasonCodes.includes('independent-adjudicator-unavailable'), JSON.stringify({ status: out.status, reasons: out.reasonCodes }));
  }, results);

  check('degraded-council-requires-explicit-policy', () => {
    const a = profile({ id: 'a', provider: 'openai', model: 'a' });
    const b = profile({ id: 'b', provider: 'openai', model: 'b' });
    const out = compileFrontierCognitivePlan({ task: task({ reasoningTier: 'COUNCIL_MAX' }), profiles: [a, b], callability: [callability(a), callability(b)], benchmarks: [benchmark(a), benchmark(b)], contextArtifacts: contextArtifacts(), allowDegradedCouncil: true, now: NOW });
    insist(!out.ok && out.status === 'FRONTIER_POLICY_INVALID' && out.reasonCodes.includes('degradation-policy-ref-required'), JSON.stringify({ status: out.status, reasons: out.reasonCodes }));
  }, results);

  check('receipt-binds-all-executions-identity-transport-reasoning', () => {
    const a = profile({ id: 'a', provider: 'openai', model: 'a' });
    const b = profile({ id: 'b', provider: 'anthropic', model: 'b', transportProvider: 'anthropic', transportModel: 'b' });
    const c = profile({ id: 'c', provider: 'google', model: 'c' });
    const plan = compileFrontierCognitivePlan({ task: task({ reasoningTier: 'COUNCIL_MAX' }), profiles: [a, b, c], callability: [callability(a), callability(b), callability(c)], benchmarks: [benchmark(a, { quality: 0.98 }), benchmark(b, { quality: 0.97 }), benchmark(c, { quality: 0.96 })], contextArtifacts: contextArtifacts(), now: NOW });
    insist(plan.ok, JSON.stringify({ status: plan.status, reasons: plan.reasonCodes }));
    const byId = new Map([a,b,c].map(p => [p.id,p]));
    const executions = plan.plan.members.map(member => {
      const p = byId.get(member.profileId);
      return { profileId: p.id, ok: true, observedProvider: p.provider, observedModel: p.model, observedRevision: p.revision, observedTransportProvider: p.transportProvider, observedTransportModel: p.transportModel, identityVerification: 'OBSERVED', appliedReasoningSettingRef: member.reasoningSettingRef, latencyMs: 10, costCents: 1, resultRef: `proof://${p.id}`, claims: [] };
    });
    const receipt = buildFrontierCognitiveReceipt({ planResult: plan, executions, verifierEvidenceRefs: ['proof://independent-verifier'], adjudication: { decision: 'bounded', decisionBasis: 'EVIDENCE_WEIGHTED', adjudicatorProfileId: plan.plan.adjudicator.profileId, independentFromResponders: true, unresolved: [] }, now: NOW });
    insist(receipt.ok, JSON.stringify({ status: receipt.status, reasons: receipt.reasonCodes }));
  }, results);

  check('receipt-rejects-duplicate-execution-and-reasoning-drift', () => {
    const p = profile({ id: 'p' });
    const plan = compileFrontierCognitivePlan({ task: task(), profiles: [p], callability: [callability(p)], benchmarks: [benchmark(p)], contextArtifacts: contextArtifacts(), now: NOW });
    insist(plan.ok, 'plan failed');
    const e = { profileId: 'p', ok: true, observedProvider: p.provider, observedModel: p.model, observedRevision: p.revision, observedTransportProvider: p.transportProvider, observedTransportModel: p.transportModel, identityVerification: 'OBSERVED', appliedReasoningSettingRef: 'WRONG', latencyMs: 1, costCents: 1, resultRef: 'proof://p', claims: [] };
    const out = buildFrontierCognitiveReceipt({ planResult: plan, executions: [e, e], now: NOW });
    insist(!out.ok && out.status === 'FRONTIER_RECEIPT_BLOCKED' && out.reasonCodes.some(x => x === 'duplicate-execution-profile:p' || x === 'reasoning-setting-not-proven:p'), JSON.stringify({ status: out.status, reasons: out.reasonCodes }));
  }, results);

  const failed = results.filter(x => !x.ok);
  return res.status(failed.length ? 500 : 200).json({ ok: failed.length === 0, status: failed.length ? 'FRONTIER_FABRIC_RUNTIME_PROOF_FAILED' : 'FRONTIER_FABRIC_RUNTIME_PROOF_GREEN', exactModuleVersion: 'uberbond.frontier-cognitive-fabric-1.1.0', checks: results.length, failed });
}
