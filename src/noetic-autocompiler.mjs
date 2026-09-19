// UberBond Noetic Autocompiler v1.
//
// Frontier cognition may propose semantic programs; System-One providers may
// execute their typed judgements; repeated reality-verified behaviour may earn a
// candidate reflex or deterministic compilation. No stage grants consequence
// authority, and drift decompiles instead of being explained away.

import crypto from 'node:crypto';
import { choice, noul, score } from './system-one-decision-adapter.mjs';

export const NOETIC_AUTOCOMPILER_VERSION = 'uberbond.noetic-autocompiler.v1';
export const SEMANTIC_OPS = Object.freeze(['NOUL', 'CHOICE', 'SCORE']);
export const SEMANTIC_MODES = Object.freeze(['PLAN_ONLY', 'SHADOW']);
export const MAX_SEMANTIC_INSTRUCTIONS = 256;

const ZERO_EFFECTS = Object.freeze({
  customerMessages: 0, providerCalls: 0, spendCents: 0, deployments: 0,
  dnsChanges: 0, credentialChanges: 0, paymentMutations: 0, productionMutations: 0
});
const text = (value, max = 500) => String(value ?? '').trim().slice(0, max);
const finite = value => Number.isFinite(Number(value)) ? Number(value) : null;
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const unique = values => [...new Set(values.filter(Boolean))];

function fail(status, reasonCodes, extra = {}) {
  return {
    ok: false,
    policyVersion: NOETIC_AUTOCOMPILER_VERSION,
    status,
    reasonCodes: unique(reasonCodes),
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO_EFFECTS },
    ...extra
  };
}

function questionFor(instruction) {
  if (instruction.op === 'NOUL') return noul(instruction.question, instruction.criteria);
  if (instruction.op === 'CHOICE') return choice(instruction.question, instruction.criteria);
  return score(instruction.question, instruction.criteria);
}

function validateInstruction(raw, index) {
  const reasons = [];
  const id = text(raw?.id, 120);
  const op = text(raw?.op, 20).toUpperCase();
  const question = raw?.question ?? null;
  const threshold = raw?.escalateBelow == null ? 0.75 : finite(raw.escalateBelow);
  if (!id) reasons.push(`instruction-${index}:id-required`);
  if (!SEMANTIC_OPS.includes(op)) reasons.push(`instruction-${index}:valid-op-required`);
  if (question == null || (typeof question !== 'string' && typeof question !== 'object')) reasons.push(`instruction-${index}:question-required`);
  if (threshold == null || threshold < 0 || threshold > 1) reasons.push(`instruction-${index}:valid-escalation-threshold-required`);
  if (op === 'CHOICE' && (!raw?.criteria || Array.isArray(raw.criteria) || typeof raw.criteria !== 'object' || Object.keys(raw.criteria).length < 2)) reasons.push(`instruction-${index}:choice-criteria-required`);
  if (op === 'SCORE' && (!Array.isArray(raw?.criteria) || raw.criteria.length < 2)) reasons.push(`instruction-${index}:score-criteria-required`);
  return { reasons, normalized: { id, op, question, criteria: raw?.criteria, escalateBelow: threshold, tags: Array.isArray(raw?.tags) ? unique(raw.tags.map(v => text(v, 80))).sort() : [] } };
}

export function compileSemanticProgram({ programId, version = '1', purpose, instructions = [] } = {}) {
  const reasons = [];
  const id = text(programId, 160);
  const why = text(purpose, 1000);
  if (!id) reasons.push('program-id-required');
  if (!why) reasons.push('purpose-required');
  if (!Array.isArray(instructions) || !instructions.length) reasons.push('at-least-one-instruction-required');
  if (Array.isArray(instructions) && instructions.length > MAX_SEMANTIC_INSTRUCTIONS) reasons.push('instruction-count-exceeds-bound');
  const normalized = [];
  for (let i = 0; i < (Array.isArray(instructions) ? instructions.length : 0); i++) {
    const checked = validateInstruction(instructions[i], i);
    reasons.push(...checked.reasons);
    normalized.push(checked.normalized);
  }
  const ids = normalized.map(row => row.id).filter(Boolean);
  if (new Set(ids).size !== ids.length) reasons.push('instruction-ids-must-be-unique');
  if (reasons.length) return fail('SEMANTIC_PROGRAM_REFUSED', reasons);
  const body = {
    schemaVersion: NOETIC_AUTOCOMPILER_VERSION,
    programId: id,
    version: text(version, 80) || '1',
    purpose: why,
    instructions: normalized,
    authority: 'NONE',
    consequenceClass: 'JUDGEMENT_ONLY'
  };
  return {
    ok: true,
    status: 'SEMANTIC_PROGRAM_COMPILED',
    program: Object.freeze({ ...body, programDigest: `sha256:${digest(body)}` }),
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO_EFFECTS }
  };
}

function normalizedRegisters(program, observed) {
  const registers = {};
  for (const instruction of program.instructions) {
    const answer = observed.answers[instruction.id];
    if (!answer) return null;
    if (instruction.op === 'NOUL') registers[instruction.id] = { op: instruction.op, value: answer.probability, confidence: answer.confidence };
    if (instruction.op === 'CHOICE') registers[instruction.id] = { op: instruction.op, value: answer.choice, confidence: answer.confidence, probabilities: answer.probabilities };
    if (instruction.op === 'SCORE') registers[instruction.id] = { op: instruction.op, value: answer.score, confidence: answer.confidence, probabilities: answer.probabilities };
  }
  return registers;
}

export function planSemanticExecution({ program, state, mode = 'PLAN_ONLY' } = {}) {
  const reasons = [];
  if (!program?.programDigest || !Array.isArray(program.instructions)) reasons.push('compiled-program-required');
  const selectedMode = text(mode, 20).toUpperCase();
  if (!SEMANTIC_MODES.includes(selectedMode)) reasons.push('valid-mode-required');
  if (state === undefined) reasons.push('state-required');
  if (reasons.length) return fail('SEMANTIC_EXECUTION_REFUSED', reasons);
  const questions = Object.fromEntries(program.instructions.map(instruction => [instruction.id, questionFor(instruction)]));
  return {
    ok: true,
    status: 'SEMANTIC_EXECUTION_PLANNED',
    mode: selectedMode,
    programId: program.programId,
    programDigest: program.programDigest,
    stateDigest: `sha256:${digest(state)}`,
    state,
    questions,
    questionCount: Object.keys(questions).length,
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO_EFFECTS }
  };
}

export async function executeSemanticProgram({
  program, state, decisionAdapter, mode = 'PLAN_ONLY', providerCallAuthorized = false
} = {}) {
  const plan = planSemanticExecution({ program, state, mode });
  if (!plan.ok) return plan;
  if (plan.mode === 'PLAN_ONLY') return { ...plan, status: 'SEMANTIC_EXECUTION_PLAN_ONLY' };
  if (!decisionAdapter || typeof decisionAdapter.evaluate !== 'function') return fail('SEMANTIC_EXECUTION_REFUSED', ['decision-adapter-required'], { programId: program.programId });
  const observed = await decisionAdapter.evaluate({ state: plan.state, questions: plan.questions, providerCallAuthorized });
  if (!observed?.ok) return { ...observed, programId: program.programId, programDigest: program.programDigest, mode: plan.mode };
  const registers = normalizedRegisters(program, observed);
  if (!registers) return fail('SEMANTIC_EXECUTION_RESPONSE_REFUSED', ['complete-register-file-required'], { programId: program.programId });
  const escalations = program.instructions
    .filter(instruction => registers[instruction.id].confidence < instruction.escalateBelow)
    .map(instruction => ({ instructionId: instruction.id, confidence: registers[instruction.id].confidence, threshold: instruction.escalateBelow }));
  return {
    ok: true,
    policyVersion: NOETIC_AUTOCOMPILER_VERSION,
    status: escalations.length ? 'SEMANTIC_SHADOW_OBSERVED__FRONTIER_REVIEW_REQUIRED' : 'SEMANTIC_SHADOW_OBSERVED',
    mode: plan.mode,
    programId: program.programId,
    programDigest: program.programDigest,
    stateDigest: plan.stateDigest,
    registers,
    escalations,
    providerEvidence: {
      provider: observed.provider,
      requestedModel: observed.requestedModel,
      observedModel: observed.observedModel,
      requestDigest: observed.requestDigest,
      usage: observed.usage,
      pricingEvidence: observed.pricingEvidence,
      latencyMs: observed.latencyMs
    },
    actionAuthority: 'NONE',
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE',
    externalEffectLedger: observed.externalEffectLedger || { ...ZERO_EFFECTS }
  };
}

export function assessRealityDrift({ baseline = {}, recent = {} } = {}) {
  const baseAccuracy = finite(baseline.accuracy);
  const recentAccuracy = finite(recent.accuracy);
  const baseCalibrationError = finite(baseline.calibrationError);
  const recentCalibrationError = finite(recent.calibrationError);
  const recentCount = Number.isInteger(recent.count) ? recent.count : 0;
  const reasons = [];
  if ([baseAccuracy, recentAccuracy, baseCalibrationError, recentCalibrationError].some(v => v == null)) reasons.push('complete-baseline-and-recent-metrics-required');
  if (recentCount < 20) reasons.push('at-least-20-recent-outcomes-required');
  if (reasons.length) return fail('DRIFT_ASSESSMENT_REFUSED', reasons);
  const accuracyDrop = baseAccuracy - recentAccuracy;
  const calibrationWorsening = recentCalibrationError - baseCalibrationError;
  const drift = accuracyDrop >= 0.05 || calibrationWorsening >= 0.05;
  return {
    ok: true,
    status: drift ? 'REALITY_DRIFT_DETECTED__DECOMPILE' : 'NO_MATERIAL_DRIFT_OBSERVED',
    drift,
    accuracyDrop,
    calibrationWorsening,
    action: drift ? 'PROMOTE_TO_DEEPER_COGNITION_AND_REVALIDATE' : 'KEEP_CURRENT_EXECUTION_TIER',
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO_EFFECTS }
  };
}

export function proposeCognitiveCompilation({
  programDigest, outcomeCount = 0, accuracy, calibrationError, stableWindows = 0,
  drift = false, minimumOutcomes = 100, minimumAccuracy = 0.98, maximumCalibrationError = 0.02
} = {}) {
  const reasons = [];
  const acc = finite(accuracy);
  const cal = finite(calibrationError);
  if (!text(programDigest, 120)) reasons.push('program-digest-required');
  if (!Number.isInteger(outcomeCount) || outcomeCount < minimumOutcomes) reasons.push('insufficient-reality-outcomes');
  if (acc == null || acc < minimumAccuracy) reasons.push('accuracy-below-compilation-threshold');
  if (cal == null || cal > maximumCalibrationError) reasons.push('calibration-error-above-threshold');
  if (!Number.isInteger(stableWindows) || stableWindows < 3) reasons.push('insufficient-stable-windows');
  if (drift === true) reasons.push('drift-present');
  const eligible = reasons.length === 0;
  const evidence = { programDigest: text(programDigest, 120), outcomeCount, accuracy: acc, calibrationError: cal, stableWindows, drift: drift === true };
  return {
    ok: true,
    policyVersion: NOETIC_AUTOCOMPILER_VERSION,
    status: eligible ? 'DETERMINISTIC_COMPILATION_CANDIDATE' : 'KEEP_SEMANTIC_OR_FRONTIER_TIER',
    eligible,
    reasonCodes: reasons,
    evidence,
    candidateId: eligible ? `jit_${digest(evidence).slice(0, 24)}` : null,
    automaticCodeMutationAuthorized: false,
    actionAuthority: 'NONE',
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO_EFFECTS }
  };
}
