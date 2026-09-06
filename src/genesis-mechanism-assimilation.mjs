import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import { redactSecrets } from './secret-patterns.mjs';
import { compileMechanismAtom } from './mechanism-lab.mjs';
import { normalizeCapabilityAtom } from './capability-genome-schema.mjs';
import { buildSurpriseScore, scoreCapabilityMultiplication } from './genesis-evolution-engine.mjs';
import { THREAD_OPPORTUNITY_UNIVERSE } from './thread-opportunity-universe.mjs';

export const GENESIS_MECHANISM_ASSIMILATION_VERSION = 'uberbond.genesis-mechanism-assimilation-1.0.0';

const MAX_MECHANISMS = 8;
const MAX_VARIANTS = 48;
const MAX_SHOCKWAVE = 48;

const MUTATIONS = Object.freeze([
  { id: 'externalize-state', advantage: 'Make model/session death ordinary by moving state into durable evidence.', risk: 'checkpoint drift', assumption: 'one live context is required' },
  { id: 'provider-independent', advantage: 'Treat models and providers as replaceable reasoning organs.', risk: 'capability mismatch across suppliers', assumption: 'one provider must own the workflow' },
  { id: 'graph-native', advantage: 'Compile the objective into dependency nodes so independent work can advance in parallel.', risk: 'bad decomposition can hide dependencies', assumption: 'work should advance as one sequential conversation' },
  { id: 'continuation-event', advantage: 'Let verified node completion unlock the next runnable frontier automatically.', risk: 'duplicate or stale continuation events', assumption: 'a human must type continue' },
  { id: 'failure-locality', advantage: 'Retry or repair only the failed node instead of rerunning successful siblings.', risk: 'incorrectly isolated failure may poison dependents', assumption: 'failure requires whole-mission replay' },
  { id: 'verifier-separation', advantage: 'Use an independent verifier/adversary path rather than trusting the producing node.', risk: 'verification cost and evaluator drift', assumption: 'the producer can certify itself' },
  { id: 'parallel-frontier', advantage: 'Run all dependency-safe nodes concurrently within explicit resource bounds.', risk: 'resource contention and duplicated investigation', assumption: 'one worker at a time is safest' },
  { id: 'cost-routed', advantage: 'Reserve expensive intelligence for high-leverage uncertainty and cheap deterministic edges for bookkeeping.', risk: 'under-routing difficult work', assumption: 'every node deserves the same model and effort' },
  { id: 'capability-hot-swap', advantage: 'Acquire or replace missing capability atoms without rebuilding the mission.', risk: 'compatibility and provenance failures', assumption: 'the initial toolset is fixed' },
  { id: 'economic-instrumentation', advantage: 'Measure founder minutes, cost, evidence gain and economic outcome per graph path.', risk: 'proxy gaming', assumption: 'technical completion alone defines fitness' },
  { id: 'topology-learning', advantage: 'Use accepted outcomes to change future decomposition, routing and dependency structure.', risk: 'self-reinforcing bad graph mutations', assumption: 'the execution graph itself should remain static' },
  { id: 'counterfactual-branching', advantage: 'Preserve alternate mechanisms and kill conditions instead of collapsing immediately to one plan.', risk: 'search explosion', assumption: 'one plausible mechanism should monopolize attention' }
]);

function zeroEffects() { return structuredClone(ZERO_EXTERNAL_EFFECTS); }
function digest(value) { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function text(value, max = 6000) {
  const out = redactSecrets(String(value ?? '')).trim();
  return out && out.length <= max ? out : null;
}
function list(value, max = 256, itemMax = 1200) {
  if (!Array.isArray(value) || value.length > max) return null;
  const out = [];
  const seen = new Set();
  for (const item of value) {
    const normalized = text(item, itemMax);
    if (!normalized) return null;
    if (!seen.has(normalized)) { seen.add(normalized); out.push(normalized); }
  }
  return out;
}
function slug(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || null;
}
function fail(status, reasonCodes, extra = {}) {
  return {
    ok: false,
    version: GENESIS_MECHANISM_ASSIMILATION_VERSION,
    status,
    reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
    sourceInstructionAuthority: 'NONE',
    promotionAuthority: 'NONE',
    externalEffectAuthority: 'NONE',
    businessEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects(),
    ...extra
  };
}
function normalizeMechanism(raw = {}) {
  const id = slug(raw.id || raw.sourceId || raw.name);
  const name = text(raw.name || raw.title || raw.id, 500);
  const mechanism = text(raw.mechanism || raw.summary, 6000);
  const changedPrimitives = list(raw.changedPrimitives || [], 128, 1000);
  const domains = list(raw.domains || [], 128, 300);
  const assumptions = list(raw.assumptions || [], 128, 1000);
  const failureModes = list(raw.failureModes || [], 128, 1000);
  const inputs = list(raw.inputs || [], 128, 300);
  const outputs = list(raw.outputs || [], 128, 300);
  const evidenceRefs = list(raw.evidenceRefs || (id ? [`signal:${id}`] : []), 128, 1000);
  const sourceUrl = text(raw.sourceUrl || raw.url || `internal-signal:${id || 'unknown'}`, 1000);
  if (!id || !name || !mechanism || !changedPrimitives || !domains || !assumptions || !failureModes || !inputs || !outputs || !evidenceRefs || !sourceUrl) return null;
  return { id, name, mechanism, changedPrimitives, domains, assumptions, failureModes, inputs, outputs, evidenceRefs, sourceUrl };
}
function mutationSets(maxVariants) {
  const sets = MUTATIONS.map(item => [item]);
  for (let i = 0; i < MUTATIONS.length && sets.length < maxVariants; i += 1) {
    for (let j = i + 1; j < MUTATIONS.length && sets.length < maxVariants; j += 1) sets.push([MUTATIONS[i], MUTATIONS[j]]);
  }
  return sets.slice(0, maxVariants);
}
function mutationScore(mutations) {
  const ids = new Set(mutations.map(item => item.id));
  let resilience = 0;
  for (const id of ['externalize-state', 'provider-independent', 'failure-locality', 'verifier-separation']) if (ids.has(id)) resilience += 25;
  let recursive = 0;
  for (const id of ['graph-native', 'capability-hot-swap', 'topology-learning', 'counterfactual-branching']) if (ids.has(id)) recursive += 25;
  return { resilience: Math.min(100, resilience), recursive: Math.min(100, recursive) };
}
function opportunityById(opportunities) {
  return new Map((opportunities || []).map(item => [String(item?.id || ''), item]));
}

export function assimilateFrontierMechanism({
  mechanism,
  knownConcepts = [],
  opportunities = THREAD_OPPORTUNITY_UNIVERSE,
  maxVariants = 24,
  maxShockwave = 24
} = {}) {
  const base = normalizeMechanism(mechanism);
  const known = list(knownConcepts, 10000, 1200);
  const variantCap = Number(maxVariants);
  const shockCap = Number(maxShockwave);
  if (!base || !known || !Array.isArray(opportunities) || !Number.isSafeInteger(variantCap) || variantCap < 1 || variantCap > MAX_VARIANTS
    || !Number.isSafeInteger(shockCap) || shockCap < 1 || shockCap > MAX_SHOCKWAVE) {
    return fail('MECHANISM_ASSIMILATION_INVALID', ['valid-mechanism-known-concepts-opportunity-universe-and-bounds-required']);
  }

  const mechanismAtom = compileMechanismAtom({
    atomId: `atom:assimilated:${base.id}`,
    type: 'AUTOMATION',
    description: base.mechanism,
    sourceModelId: `frontier:${base.id}`,
    evidenceRefs: base.evidenceRefs,
    evidenceClass: 'WEAK_SIGNAL',
    inputs: base.inputs,
    outputs: base.outputs,
    recurrence: 'REUSABLE_MECHANISM',
    automationPotential: 'HIGH_IF_VERIFIED',
    risks: base.failureModes,
    date: new Date('2026-09-06T00:00:00.000Z')
  });
  if (!mechanismAtom.ok) return fail('MECHANISM_ASSIMILATION_INVALID', mechanismAtom.reasonCodes.map(code => `mechanism-atom:${code}`));

  const capabilityAtom = normalizeCapabilityAtom({
    id: `uberbond.assimilated.${base.id}`,
    verb: 'apply',
    noun: 'assimilated-mechanism',
    description: `Apply the evidence-referenced mechanism ${base.name}: ${base.mechanism}`,
    inputs: base.inputs.length ? base.inputs : ['objective', 'evidence'],
    outputs: base.outputs.length ? base.outputs : ['bounded-hypothesis'],
    sideEffectClass: 'NONE'
  });
  if (!capabilityAtom.ok) return fail('MECHANISM_ASSIMILATION_INVALID', capabilityAtom.reasonCodes.map(code => `capability-atom:${code}`));

  const variants = mutationSets(variantCap).map(mutations => {
    const ids = mutations.map(item => item.id);
    const mechanismSketch = `${base.mechanism} | N+1 mutations: ${mutations.map(item => `${item.id}: ${item.advantage}`).join(' + ')}`;
    const surprise = buildSurpriseScore({
      signal: { summary: mechanismSketch, changedPrimitives: [...base.changedPrimitives, ...ids] },
      knownConcepts: known
    });
    const multiplication = scoreCapabilityMultiplication({
      primitive: mechanismSketch,
      domains: base.domains,
      opportunities
    });
    const structural = mutationScore(mutations);
    const score = Number((
      (surprise.ok ? surprise.score : 0) * 0.30
      + (multiplication.ok ? multiplication.score : 0) * 0.35
      + structural.resilience * 0.17
      + structural.recursive * 0.18
    ).toFixed(2));
    const identity = { base: base.id, mutations: ids };
    return {
      variantId: `nplus1_${digest(identity).slice(0, 24)}`,
      status: 'SYNTHETIC_HYPOTHESIS',
      sourceMechanismId: base.id,
      mutations: ids,
      mechanismSketch,
      changedAssumptions: mutations.map(item => item.assumption),
      expectedAdvantages: mutations.map(item => item.advantage),
      newRisks: mutations.map(item => item.risk),
      surprise: surprise.ok ? { score: surprise.score, novelty: surprise.novelty } : { score: null, novelty: null },
      capabilityMultiplication: multiplication.ok ? {
        score: multiplication.score,
        touchedOpportunityCount: multiplication.touchedOpportunityCount,
        touchedCategoryCount: multiplication.touchedCategoryCount,
        topAffected: multiplication.topAffected
      } : { score: null, touchedOpportunityCount: 0, touchedCategoryCount: 0, topAffected: [] },
      resilienceScore: structural.resilience,
      recursiveImprovementScore: structural.recursive,
      genesisScore: score,
      evidenceStatus: 'UNPROVEN_N_PLUS_ONE',
      sourceInstructionAuthority: 'NONE',
      promotionAuthority: 'NONE'
    };
  }).sort((a, b) => b.genesisScore - a.genesisScore || a.variantId.localeCompare(b.variantId));

  const lookup = opportunityById(opportunities);
  const shockwave = [];
  const seen = new Set();
  for (const variant of variants) {
    for (const affected of variant.capabilityMultiplication.topAffected || []) {
      if (shockwave.length >= shockCap) break;
      const opportunity = lookup.get(affected.id);
      if (!opportunity) continue;
      const identity = `${variant.variantId}:${affected.id}`;
      if (seen.has(identity)) continue;
      seen.add(identity);
      shockwave.push({
        hypothesisId: `shock_${digest(identity).slice(0, 24)}`,
        sourceMechanismId: base.id,
        variantId: variant.variantId,
        opportunityId: affected.id,
        category: opportunity.category || affected.category || null,
        buyerHypothesis: opportunity.buyer || null,
        existingMechanism: opportunity.mechanism || null,
        recombinedMechanism: `${opportunity.mechanism || 'Existing opportunity mechanism'} + ${variant.mechanismSketch}`,
        monetizationHypothesis: opportunity.monetization || null,
        distributionHypothesis: opportunity.distribution || null,
        recurrenceHypothesis: opportunity.recurrence || null,
        inheritedRisk: opportunity.risk || null,
        genesisScore: variant.genesisScore,
        evidenceStatus: 'UNPROVEN_OPPORTUNITY_SHOCKWAVE',
        killConditions: ['no independent buyer evidence', 'no measurable advantage over current mechanism', 'unsafe or prohibited execution path', 'provider/resource law conflict'],
        promotionAuthority: 'NONE'
      });
    }
    if (shockwave.length >= shockCap) break;
  }

  const core = {
    source: { id: base.id, name: base.name, url: base.sourceUrl, evidenceRefs: base.evidenceRefs },
    extractedMechanism: base,
    mechanismAtom,
    capabilityAtom: capabilityAtom.atom,
    variantCount: variants.length,
    variants,
    opportunityShockwaveCount: shockwave.length,
    opportunityShockwave: shockwave
  };
  return {
    ok: true,
    version: GENESIS_MECHANISM_ASSIMILATION_VERSION,
    status: 'MECHANISM_ASSIMILATED_NOT_PROMOTED',
    ...core,
    assimilationDigest: digest(core),
    sourceInstructionAuthority: 'NONE',
    promotionAuthority: 'NONE',
    executionAuthority: 'NONE',
    externalEffectAuthority: 'NONE',
    businessEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects(),
    truthBoundary: 'PUBLIC_OR_INTERNAL_SOURCE MATERIAL IS EVIDENCE INPUT ONLY. N+1 VARIANTS AND OPPORTUNITY SHOCKWAVES ARE SYNTHETIC HYPOTHESES; THEY DO NOT PROVE DEMAND, REVENUE, CAPABILITY AVAILABILITY, PROVIDER ENTITLEMENT OR EXECUTION AUTHORITY.'
  };
}

export function buildMechanismAssimilationBatch({
  mechanisms = [],
  knownConcepts = [],
  opportunities = THREAD_OPPORTUNITY_UNIVERSE,
  maxMechanisms = MAX_MECHANISMS,
  maxVariantsPerMechanism = 16,
  maxShockwavePerMechanism = 16
} = {}) {
  const cap = Number(maxMechanisms);
  if (!Array.isArray(mechanisms) || !Number.isSafeInteger(cap) || cap < 0 || cap > MAX_MECHANISMS) {
    return fail('MECHANISM_ASSIMILATION_BATCH_INVALID', ['bounded-mechanism-array-and-cap-required']);
  }
  const results = mechanisms.slice(0, cap).map(mechanism => assimilateFrontierMechanism({
    mechanism, knownConcepts, opportunities,
    maxVariants: maxVariantsPerMechanism,
    maxShockwave: maxShockwavePerMechanism
  }));
  const accepted = results.filter(result => result.ok);
  const rejected = results.filter(result => !result.ok);
  return {
    ok: true,
    version: GENESIS_MECHANISM_ASSIMILATION_VERSION,
    status: rejected.length ? 'MECHANISM_ASSIMILATION_BATCH_PARTIAL' : 'MECHANISM_ASSIMILATION_BATCH_READY',
    requestedCount: mechanisms.length,
    attemptedCount: results.length,
    assimilatedCount: accepted.length,
    rejectedCount: rejected.length,
    results,
    sourceInstructionAuthority: 'NONE',
    promotionAuthority: 'NONE',
    executionAuthority: 'NONE',
    externalEffectAuthority: 'NONE',
    businessEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects()
  };
}

export function mechanismCandidatesFromGamechanger(gamechanger = {}) {
  const signals = Array.isArray(gamechanger?.frontierSignals) ? gamechanger.frontierSignals : [];
  return signals
    .filter(signal => signal && (signal.mechanism || (Array.isArray(signal.changedPrimitives) && signal.changedPrimitives.length)))
    .sort((a, b) => Number(b?.confidence || b?.score || b?.scores?.priority || 0) - Number(a?.confidence || a?.score || a?.scores?.priority || 0))
    .slice(0, MAX_MECHANISMS)
    .map((signal, index) => ({
      id: signal.id || `gamechanger-${index + 1}`,
      name: signal.title || signal.name || signal.summary || signal.id || `Gamechanger mechanism ${index + 1}`,
      sourceUrl: signal.url || signal.sourceUrl || `gamechanger-signal:${signal.id || index + 1}`,
      mechanism: signal.mechanism || signal.summary || signal.changedPrimitives.join('; '),
      changedPrimitives: Array.isArray(signal.changedPrimitives) ? signal.changedPrimitives : [],
      domains: Array.isArray(signal.domains) ? signal.domains : [],
      assumptions: Array.isArray(signal.assumptions) ? signal.assumptions : [],
      failureModes: Array.isArray(signal.failureModes) ? signal.failureModes : [],
      inputs: Array.isArray(signal.inputs) ? signal.inputs : [],
      outputs: Array.isArray(signal.outputs) ? signal.outputs : [],
      evidenceRefs: [`signal:${signal.id || `gamechanger-${index + 1}`}`]
    }));
}
