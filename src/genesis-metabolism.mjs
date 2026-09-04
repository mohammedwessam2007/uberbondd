import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import { fuseWeakSignals, buildEpistemicTopography } from './genesis-sensing-cognition.mjs';
import { scanTrustFriction, detectEconomicPhaseChange } from './genesis-economic-physics.mjs';
import { detectProblemDarkMatter, compileCompanyMorphogenesis } from './genesis-venture-organism.mjs';
import { simulateInfrastructureShocks, drillProviderExtinction } from './genesis-world-resilience.mjs';
import { runTheoryTournament, buildBlindnessLedger } from './genesis-final-frontier.mjs';

export const GENESIS_METABOLISM_VERSION = 'uberbond.genesis-metabolism-1.0.0';

const envelope = extra => ({
  businessEffectAuthority: 'NONE',
  externalEffectAuthority: 'NONE',
  externalEffectLedger: structuredClone(ZERO_EXTERNAL_EFFECTS),
  ...extra
});
const list = value => Array.isArray(value) ? value : [];
const text = value => String(value ?? '').trim();
const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const bounded = value => Math.max(0, Math.min(100, number(value)));

function signalScore(signal) {
  const candidates = [signal?.confidence, signal?.score, signal?.scores?.confidence, signal?.scores?.priority, signal?.scores?.novelty];
  const observed = candidates.find(value => Number.isFinite(Number(value)));
  return observed == null ? 0 : bounded(observed);
}

function signalOrigins(signal, index) {
  return text(signal?.source || signal?.origin || signal?.id || `signal-${index + 1}`);
}

function hypothesisFromEvolution(evolution) {
  for (const cycle of list(evolution?.cycles)) {
    for (const option of list(cycle?.portfolio?.options)) {
      const hypothesis = option?.hypothesis;
      if (hypothesis && typeof hypothesis === 'object') return hypothesis;
    }
    for (const hypothesis of list(cycle?.serendipity?.hypotheses)) {
      if (hypothesis && typeof hypothesis === 'object') return hypothesis;
    }
  }
  return null;
}

export function buildGenesisMetabolism({ gamechanger = {}, evolution = {}, scientist = {}, ontology = {} } = {}) {
  const signals = list(gamechanger?.frontierSignals).slice(0, 200);
  const cognitionSignals = signals.map((signal, index) => ({
    origin: signalOrigins(signal, index),
    weight: 1,
    confidence: signalScore(signal)
  }));
  const sensing = fuseWeakSignals({ signals: cognitionSignals });

  const beliefs = signals.flatMap((signal, index) => {
    const domains = list(signal?.domains);
    const confidence = signalScore(signal);
    if (!domains.length) return [{ id: text(signal?.id || `signal-${index + 1}`), confidence, contradictions: 0, blind: confidence === 0 }];
    return domains.map(domain => ({ id: text(domain), confidence, contradictions: 0, blind: confidence === 0 }));
  });
  const epistemic = buildEpistemicTopography({ beliefs: beliefs.slice(0, 500) });

  const trust = scanTrustFriction({
    signals: signals.slice(0, 200).map((signal, index) => ({
      id: text(signal?.id || `signal-${index + 1}`),
      evidenceStrength: signalScore(signal),
      reversibility: 100,
      reputation: 0,
      stakes: bounded(signal?.scores?.consequence || 0),
      ambiguity: 100 - signalScore(signal)
    }))
  });
  const phase = detectEconomicPhaseChange({
    series: signals.map((signal, index) => ({ id: text(signal?.id || index), value: signalScore(signal) })),
    threshold: 0.35,
    minWindow: 2
  });

  const hypothesis = hypothesisFromEvolution(evolution);
  const mechanism = text(hypothesis?.mechanismSketch || hypothesis?.mechanism || hypothesis?.summary);
  const buyer = text(hypothesis?.buyer || hypothesis?.buyerType || hypothesis?.targetBuyer);
  const darkMatter = detectProblemDarkMatter({
    laborCost: number(hypothesis?.laborCost),
    errorCost: number(hypothesis?.errorCost),
    delayCost: number(hypothesis?.delayCost),
    complaintVolume: number(hypothesis?.complaintVolume)
  });
  const venture = compileCompanyMorphogenesis({
    opportunity: { buyer, mechanism, offer: text(hypothesis?.offer), pricing: hypothesis?.pricing || null },
    capabilities: list(hypothesis?.capabilities),
    constraints: list(hypothesis?.constraints)
  });

  const dependencies = list(gamechanger?.providerDependencies).slice(0, 200);
  const shocks = simulateInfrastructureShocks({ dependencies, shocks: list(gamechanger?.providerShocks).slice(0, 50) });
  const extinction = drillProviderExtinction({ providers: list(gamechanger?.providers).slice(0, 100), removed: text(gamechanger?.removedProvider) || null });

  const theories = list(scientist?.laboratories).slice(0, 100).map((lab, index) => ({
    id: text(lab?.signalId || lab?.protocol?.theoryId || `theory-${index + 1}`),
    protocolStatus: text(lab?.status)
  }));
  const theoryTournament = runTheoryTournament({ theories, observations: list(scientist?.observations).slice(0, 500) });
  const ontologyCandidates = list(ontology?.cycle?.candidates).slice(0, 200);
  const blindness = buildBlindnessLedger({
    domains: ontologyCandidates.map((candidate, index) => ({
      id: text(candidate?.name || candidate?.id || `candidate-${index + 1}`),
      observability: bounded(100 - number(candidate?.uncertainty ?? 100)),
      consequence: bounded(candidate?.consequence || 0)
    }))
  });

  return envelope({
    ok: true,
    status: 'GENESIS_METABOLISM_READY',
    version: GENESIS_METABOLISM_VERSION,
    inputCounts: {
      frontierSignals: signals.length,
      evolutionCycles: list(evolution?.cycles).length,
      scientistLabs: list(scientist?.laboratories).length,
      ontologyCandidates: ontologyCandidates.length
    },
    organs: {
      sensing,
      epistemic,
      trust,
      phase,
      darkMatter,
      venture,
      shocks,
      extinction,
      theoryTournament,
      blindness
    },
    activationAuthority: 'NONE',
    promotionAuthority: 'NONE',
    truthBoundary: 'METABOLISM_COMPOSES_INTERNAL_EVIDENCE_AND_HYPOTHESES_ONLY; IT_CANNOT_CREATE_MARKET_DEMAND_CUSTOMERS_PAYMENT_ACCEPTANCE_CAUSAL_TRUTH_OR_PRODUCTION_AUTHORITY'
  });
}
