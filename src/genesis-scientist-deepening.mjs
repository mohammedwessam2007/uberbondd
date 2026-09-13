import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const GENESIS_SCIENTIST_DEEPENING_VERSION = 'uberbond.genesis-scientist-deepening.v1';
const envelope = (extra = {}) => ({ businessEffectAuthority: 'NONE', externalEffectAuthority: 'NONE', externalEffectLedger: structuredClone(ZERO_EXTERNAL_EFFECTS), ...extra });
const hash = (value) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const finite = (value, min = -Infinity, max = Infinity) => { const n = Number(value); return Number.isFinite(n) && n >= min && n <= max ? n : null; };
const text = (value, max = 2000) => { const s = String(value ?? '').trim(); return s && s.length <= max ? s : null; };
const refs = (value) => Array.isArray(value) ? [...new Set(value.map(v => text(v, 1000)).filter(Boolean))].slice(0, 512) : [];

export function simulateCounterfactualCivilization({ initialState = {}, rules = [], steps = 1, interventions = {} } = {}) {
  const count = Number(steps);
  if (!initialState || typeof initialState !== 'object' || Array.isArray(initialState) || !Array.isArray(rules) || rules.length > 128 || !Number.isSafeInteger(count) || count < 1 || count > 64) return envelope({ ok: false, status: 'COUNTERFACTUAL_CIVILIZATION_INVALID' });
  let state = Object.fromEntries(Object.entries(initialState).map(([k, v]) => [String(k), finite(v, -1e9, 1e9)]).filter(([, v]) => v != null));
  const timeline = [{ step: 0, state: { ...state } }];
  for (let step = 1; step <= count; step += 1) {
    const next = { ...state };
    for (const rule of rules) {
      const target = text(rule?.target, 120); const source = text(rule?.source, 120); const coefficient = finite(rule?.coefficient, -100, 100);
      if (!target || coefficient == null || !(target in next)) continue;
      const sourceValue = source ? finite(state[source], -1e9, 1e9) : 1;
      if (source && sourceValue == null) continue;
      const delta = coefficient * sourceValue;
      next[target] = Math.max(-1e12, Math.min(1e12, next[target] + delta));
    }
    for (const [target, raw] of Object.entries(interventions?.[step] ?? {})) {
      const value = finite(raw, -1e12, 1e12); if (target in next && value != null) next[target] = value;
    }
    state = next; timeline.push({ step, state: { ...state } });
  }
  return envelope({ ok: true, status: 'COUNTERFACTUAL_CIVILIZATION_SIMULATED', simulationId: `civilization_${hash({ initialState, rules, steps, interventions }).slice(0, 20)}`, timeline, evidenceClass: 'SYNTHETIC_COUNTERFACTUAL', claimBoundary: 'SIMULATED_DYNAMICS_ARE_NOT_FORECASTS_OR_OBSERVED_REALITY' });
}

export function formRealityTheories({ observations = [], candidateMechanisms = [], maxTheories = 32 } = {}) {
  const cap = Number(maxTheories);
  if (!Array.isArray(observations) || !observations.length || observations.length > 512 || !Array.isArray(candidateMechanisms) || !candidateMechanisms.length || candidateMechanisms.length > 128 || !Number.isSafeInteger(cap) || cap < 1 || cap > 128) return envelope({ ok: false, status: 'REALITY_THEORY_FORMATION_INVALID' });
  const obs = observations.map(row => ({ id: text(row?.id, 120), summary: text(row?.summary, 1500), evidenceRefs: refs(row?.evidenceRefs) })).filter(row => row.id && row.summary && row.evidenceRefs.length);
  if (!obs.length) return envelope({ ok: false, status: 'REALITY_THEORY_FORMATION_INVALID', reasonCodes: ['evidence-backed-observations-required'] });
  const theories = [];
  for (const mechanism of candidateMechanisms) {
    const id = text(mechanism?.id, 120); const statement = text(mechanism?.statement, 2000); const predicts = Array.isArray(mechanism?.predicts) ? mechanism.predicts.map(v => text(v, 120)).filter(Boolean) : [];
    if (!id || !statement) continue;
    const covered = obs.filter(row => predicts.includes(row.id));
    theories.push({ theoryId: `reality_${hash({ id, statement, predicts }).slice(0, 20)}`, mechanismId: id, statement, predictionTargets: predicts, coveredObservationIds: covered.map(row => row.id), evidenceRefs: [...new Set(covered.flatMap(row => row.evidenceRefs))], status: covered.length ? 'CANDIDATE_EVIDENCE_BOUND_THEORY' : 'UNSUPPORTED_CANDIDATE' });
  }
  theories.sort((a, b) => b.coveredObservationIds.length - a.coveredObservationIds.length || a.theoryId.localeCompare(b.theoryId));
  return envelope({ ok: true, status: 'REALITY_THEORIES_FORMED', theories: theories.slice(0, cap), claimBoundary: 'THEORY_FORMATION_DOES_NOT_ESTABLISH_CAUSAL_TRUTH' });
}

export function assessCausalWitness({ cause, effect, temporalOrder = false, alternativeExplanations = [], intervention = null, evidenceRefs = [] } = {}) {
  const c = text(cause, 500), e = text(effect, 500), evidence = refs(evidenceRefs);
  if (!c || !e || !evidence.length || !Array.isArray(alternativeExplanations) || alternativeExplanations.length > 128) return envelope({ ok: false, status: 'CAUSAL_WITNESS_INVALID' });
  const alternatives = alternativeExplanations.map(v => text(v, 1000)).filter(Boolean);
  const design = text(intervention?.design, 80)?.toUpperCase() ?? null;
  const allowedDesigns = new Set(['RANDOMIZED', 'NATURAL_EXPERIMENT', 'DIFFERENCE_IN_DIFFERENCES', 'REGRESSION_DISCONTINUITY', 'INSTRUMENTAL_VARIABLE', 'CONTROLLED_BEFORE_AFTER']);
  let strength = temporalOrder ? 1 : 0;
  if (design && allowedDesigns.has(design)) strength += 2;
  if (intervention?.controlGroup === true) strength += 1;
  if (intervention?.preRegistered === true) strength += 1;
  if (alternatives.length === 0) strength += 1;
  const witnessClass = strength >= 5 ? 'STRONG_DESIGN_WITNESS' : strength >= 3 ? 'MODERATE_DESIGN_WITNESS' : 'WEAK_ASSOCIATIONAL_WITNESS';
  return envelope({ ok: true, status: 'CAUSAL_WITNESS_ASSESSED', cause: c, effect: e, witnessClass, score: strength, temporalOrder: Boolean(temporalOrder), design, alternativeExplanations: alternatives, evidenceRefs: evidence, claimBoundary: 'WITNESS_STRENGTH_IS_METHOD_EVIDENCE_NOT_AUTOMATIC_CAUSAL_PROOF' });
}
