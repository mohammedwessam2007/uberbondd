import crypto from 'node:crypto';
import { founderAuthorized } from './personal-civilization-core.mjs';

export const LIFE_SENSORIUM_VERSION = 'uberbond.life-sensorium-1.0.0';

export const SENSOR_KINDS = Object.freeze([
  'LOCATION', 'DEVICE_ACTIVITY', 'HEALTH', 'MOTION', 'CALENDAR', 'AUDIO_METADATA',
  'VISION_METADATA', 'PROXIMITY', 'WEARABLE', 'EMG', 'EEG', 'ENVIRONMENT',
  'FOUNDER_CORRECTION'
]);

const prototype = (id, label, weights) => Object.freeze({ id, label, weights: Object.freeze(weights) });

export const DEFAULT_LIFE_STATE_PROTOTYPES = Object.freeze([
  prototype('sleep', 'SLEEP', { 'sleep-window': 3, 'screen-off': 2, 'low-motion': 2, 'resting-physiology': 2, 'lying-down': 1, 'home': 1, 'high-motion': -3, 'active-device-use': -2 }),
  prototype('focused-study', 'FOCUSED_STUDY', { 'study-app': 3, 'document-reading': 2, 'active-recall': 3, 'stylus-use': 1, 'low-app-switching': 2, 'campus': 1, 'class-calendar': 1, 'streaming-media': -2 }),
  prototype('class-session', 'CLASS_OR_LAB', { 'campus': 3, 'class-calendar': 3, 'lecture-audio-context': 1, 'document-reading': 1, 'commute-motion': -2 }),
  prototype('workout', 'WORKOUT', { 'workout-session': 4, 'high-motion': 2, 'elevated-heart-rate': 2, 'gym': 2, 'exercise-motion-pattern': 3, 'resting-physiology': -2 }),
  prototype('commute', 'COMMUTE', { 'commute-motion': 4, 'location-change': 3, 'vehicle': 2, 'transit': 2, 'stationary': -2 }),
  prototype('social', 'SOCIAL_TIME', { 'conversation-present': 3, 'known-contact-proximity': 2, 'screen-inactive': 1, 'social-venue': 1, 'active-recall': -1 }),
  prototype('meal', 'MEAL', { 'meal-context': 4, 'food-vision': 3, 'restaurant': 2, 'eating-motion-pattern': 2 }),
  prototype('entertainment', 'ENTERTAINMENT', { 'streaming-media': 4, 'game-active': 4, 'entertainment-app': 3, 'headphones-media': 1, 'active-recall': -2 }),
  prototype('creative-work', 'CREATIVE_WORK', { 'creative-app': 3, 'writing-session': 3, 'recording-session': 2, 'design-tool': 2, 'low-app-switching': 1 }),
  prototype('rest', 'REST', { 'low-motion': 2, 'screen-inactive': 1, 'resting-physiology': 2, 'home': 1, 'sleep-window': -1 })
]);

const fail = (status, reasonCodes, extra = {}) => ({
  ok: false,
  status,
  reasonCodes: [...new Set(reasonCodes)],
  businessEffectAuthority: 'NONE',
  externalEffectAuthority: 'NONE',
  ...extra
});

const text = (value, max = 1000) => {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
};

const iso = value => {
  const date = value instanceof Date ? value : new Date(String(value ?? ''));
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
};

const confidence = value => {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : null;
};

const tags = value => {
  if (!Array.isArray(value) || value.length > 128) return null;
  const out = [];
  const seen = new Set();
  for (const raw of value) {
    const tag = text(raw, 120)?.toLowerCase();
    if (!tag) return null;
    if (!seen.has(tag)) { seen.add(tag); out.push(tag); }
  }
  return out;
};

function privateEnvelope(extra = {}) {
  return {
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE',
    privacyClass: 'PRIVATE_LIFE_DATA',
    repositoryPersistenceAllowed: false,
    ...extra
  };
}

export function normalizeSensorSignal(input = {}) {
  const reasonCodes = [];
  const kind = text(input.kind, 40);
  const observedAt = iso(input.observedAt);
  const signalTags = tags(input.tags || []);
  const sourceConfidence = confidence(input.sourceConfidence ?? 1);
  const sourceRef = text(input.sourceRef, 500);
  if (!SENSOR_KINDS.includes(kind)) reasonCodes.push('valid-sensor-kind-required');
  if (!observedAt) reasonCodes.push('valid-observed-at-required');
  if (!signalTags || signalTags.length === 0) reasonCodes.push('one-or-more-tags-required');
  if (sourceConfidence === null) reasonCodes.push('source-confidence-0-to-1-required');
  if (!sourceRef) reasonCodes.push('source-ref-required');
  if (reasonCodes.length) return fail('LIFE_SENSOR_SIGNAL_INVALID', reasonCodes);

  const stable = JSON.stringify([kind, observedAt, sourceRef, signalTags]);
  const id = text(input.id, 200) || `lss_${crypto.createHash('sha256').update(stable).digest('hex').slice(0, 24)}`;
  return privateEnvelope({
    ok: true,
    status: 'LIFE_SENSOR_SIGNAL_NORMALIZED',
    signal: Object.freeze({ id, kind, observedAt, tags: Object.freeze(signalTags), sourceConfidence, sourceRef })
  });
}

function normalizePrototypes(prototypes) {
  if (!Array.isArray(prototypes) || prototypes.length < 1 || prototypes.length > 128) return null;
  const out = [];
  const ids = new Set();
  for (const raw of prototypes) {
    const id = text(raw?.id, 120)?.toLowerCase();
    const label = text(raw?.label, 120);
    if (!id || !label || ids.has(id) || !raw?.weights || typeof raw.weights !== 'object' || Array.isArray(raw.weights)) return null;
    const weights = {};
    for (const [tagRaw, weightRaw] of Object.entries(raw.weights)) {
      const tag = text(tagRaw, 120)?.toLowerCase();
      const weight = Number(weightRaw);
      if (!tag || !Number.isFinite(weight) || weight < -10 || weight > 10) return null;
      weights[tag] = weight;
    }
    ids.add(id);
    out.push({ id, label, weights });
  }
  return out;
}

export function fuseLifeState({ signals = [], authorization = null, prototypes = DEFAULT_LIFE_STATE_PROTOTYPES, maxStates = 3 } = {}) {
  if (!founderAuthorized(authorization)) return fail('LIFE_SENSORIUM_FOUNDER_AUTHORITY_REQUIRED', ['founder-authorization-required']);
  if (!Array.isArray(signals) || signals.length < 1 || signals.length > 4096) return fail('LIFE_SENSORIUM_INVALID', ['bounded-signals-required']);
  const cap = Number(maxStates);
  if (!Number.isSafeInteger(cap) || cap < 1 || cap > 10) return fail('LIFE_SENSORIUM_INVALID', ['bounded-max-states-required']);
  const normalizedPrototypes = normalizePrototypes(prototypes);
  if (!normalizedPrototypes) return fail('LIFE_SENSORIUM_INVALID', ['valid-prototypes-required']);

  const normalized = [];
  for (const signal of signals) {
    const result = normalizeSensorSignal(signal);
    if (!result.ok) return fail('LIFE_SENSORIUM_INVALID', result.reasonCodes);
    normalized.push(result.signal);
  }

  const tagEvidence = new Map();
  for (const signal of normalized) {
    for (const tag of signal.tags) {
      const prior = tagEvidence.get(tag) || { weightedConfidence: 0, corroboratingKinds: new Set(), signalIds: [] };
      prior.weightedConfidence += signal.sourceConfidence;
      prior.corroboratingKinds.add(signal.kind);
      prior.signalIds.push(signal.id);
      tagEvidence.set(tag, prior);
    }
  }

  const candidates = normalizedPrototypes.map(p => {
    let positive = 0;
    let negative = 0;
    const matchedTags = [];
    const contradictingTags = [];
    const evidenceKinds = new Set();
    for (const [tag, weight] of Object.entries(p.weights)) {
      const evidence = tagEvidence.get(tag);
      if (!evidence) continue;
      const strength = Math.min(2, evidence.weightedConfidence) * (1 + Math.min(3, evidence.corroboratingKinds.size - 1) * 0.15);
      const contribution = weight * strength;
      if (contribution >= 0) { positive += contribution; matchedTags.push(tag); }
      else { negative += Math.abs(contribution); contradictingTags.push(tag); }
      for (const kind of evidence.corroboratingKinds) evidenceKinds.add(kind);
    }
    const net = positive - negative;
    const corroboration = evidenceKinds.size;
    const heuristicConfidence = net <= 0 ? 0 : Math.min(0.99, 0.35 + (1 - Math.exp(-net / 6)) * 0.5 + Math.min(0.12, corroboration * 0.02));
    return {
      id: p.id,
      label: p.label,
      heuristicConfidence: Number(heuristicConfidence.toFixed(4)),
      evidenceKindCount: corroboration,
      matchedTags,
      contradictingTags,
      netEvidenceScore: Number(net.toFixed(4))
    };
  }).filter(row => row.netEvidenceScore > 0)
    .sort((a, b) => b.heuristicConfidence - a.heuristicConfidence || b.netEvidenceScore - a.netEvidenceScore || a.id.localeCompare(b.id));

  const selected = candidates.slice(0, cap);
  return privateEnvelope({
    ok: true,
    status: selected.length ? 'LIFE_SENSORIUM_STATE_INFERRED' : 'LIFE_SENSORIUM_STATE_UNKNOWN',
    signalCount: normalized.length,
    observedKinds: [...new Set(normalized.map(signal => signal.kind))].sort(),
    candidateStates: selected,
    ambiguity: selected.length > 1 && Math.abs(selected[0].heuristicConfidence - selected[1].heuristicConfidence) < 0.08 ? 'HIGH' : selected.length > 1 ? 'PRESENT' : 'LOW',
    confidenceBoundary: 'HEURISTIC_CONFIDENCE_IS_NOT_A_CALIBRATED_PROBABILITY__LONGITUDINAL_CORRECTION_EVIDENCE_REQUIRED',
    inferenceBoundary: 'INFERRED_ACTIVITY_IS_A_REVERSIBLE_PRIVATE_MODEL_NOT_A_FACT_ABOUT_THE_FOUNDER',
    manualLoggingPrinciple: 'ASK_THE_FOUNDER_ONLY_WHEN_THE_UNCERTAINTY_MATTERS_ENOUGH_TO_JUSTIFY_THE_INTERRUPTION'
  });
}

export function reconstructLifeTimeline({ signals = [], authorization = null, prototypes = DEFAULT_LIFE_STATE_PROTOTYPES, bucketMinutes = 15, maxStatesPerBucket = 2 } = {}) {
  if (!founderAuthorized(authorization)) return fail('LIFE_SENSORIUM_FOUNDER_AUTHORITY_REQUIRED', ['founder-authorization-required']);
  const bucket = Number(bucketMinutes);
  if (!Number.isSafeInteger(bucket) || bucket < 1 || bucket > 180) return fail('LIFE_TIMELINE_INVALID', ['bucket-minutes-1-to-180-required']);
  if (!Array.isArray(signals) || signals.length > 100_000) return fail('LIFE_TIMELINE_INVALID', ['bounded-signals-required']);
  const normalized = [];
  for (const signal of signals) {
    const result = normalizeSensorSignal(signal);
    if (!result.ok) return fail('LIFE_TIMELINE_INVALID', result.reasonCodes);
    normalized.push(result.signal);
  }
  const width = bucket * 60_000;
  const groups = new Map();
  for (const signal of normalized) {
    const t = new Date(signal.observedAt).getTime();
    const start = Math.floor(t / width) * width;
    if (!groups.has(start)) groups.set(start, []);
    groups.get(start).push(signal);
  }
  const timeline = [];
  for (const [start, group] of [...groups.entries()].sort((a, b) => a[0] - b[0])) {
    const inference = fuseLifeState({ signals: group, authorization, prototypes, maxStates: maxStatesPerBucket });
    timeline.push({
      startAt: new Date(start).toISOString(),
      endAt: new Date(start + width).toISOString(),
      signalCount: group.length,
      status: inference.status,
      candidateStates: inference.candidateStates || [],
      ambiguity: inference.ambiguity || 'UNKNOWN'
    });
  }
  return privateEnvelope({
    ok: true,
    status: 'LIFE_TIMELINE_RECONSTRUCTED',
    bucketMinutes: bucket,
    bucketCount: timeline.length,
    timeline,
    truthBoundary: 'TIMELINE_IS_AN_INFERENCE_OVER_PRIVATE_SIGNALS__IT_MAY_BE_CORRECTED_AND_MUST_NOT_BE_TREATED_AS_AN_EXACT_DIARY'
  });
}

export function buildSensoriumCorrection({ inference = null, correctedLabel = null, authorization = null, correctedAt = new Date() } = {}) {
  if (!founderAuthorized(authorization)) return fail('LIFE_SENSORIUM_FOUNDER_AUTHORITY_REQUIRED', ['founder-authorization-required']);
  const label = text(correctedLabel, 120);
  const at = iso(correctedAt);
  if (!inference || inference.ok !== true || !Array.isArray(inference.candidateStates) || !label || !at) return fail('LIFE_SENSORIUM_CORRECTION_INVALID', ['valid-inference-label-and-time-required']);
  return privateEnvelope({
    ok: true,
    status: 'LIFE_SENSORIUM_CORRECTION_EXAMPLE_READY',
    correctedAt: at,
    predictedLabels: inference.candidateStates.map(row => row.label),
    correctedLabel: label,
    correctionUse: 'PRIVATE_CALIBRATION_AND_PERSONALIZATION_ONLY',
    principle: 'EVERY_MEANINGFUL_CORRECTION_SHOULD_REDUCE_FUTURE_MANUAL_LOGGING_WITHOUT_TURNING_ONE_CORRECTION_INTO_A_PERMANENT_TRAIT'
  });
}

export function measureSensoriumCoverage({ signals = [], desiredKinds = SENSOR_KINDS.filter(kind => kind !== 'FOUNDER_CORRECTION'), authorization = null } = {}) {
  if (!founderAuthorized(authorization)) return fail('LIFE_SENSORIUM_FOUNDER_AUTHORITY_REQUIRED', ['founder-authorization-required']);
  if (!Array.isArray(signals) || signals.length > 100_000 || !Array.isArray(desiredKinds) || desiredKinds.length < 1 || desiredKinds.length > SENSOR_KINDS.length) return fail('LIFE_SENSORIUM_COVERAGE_INVALID', ['bounded-signals-and-desired-kinds-required']);
  const desired = [...new Set(desiredKinds.map(kind => text(kind, 40)).filter(kind => SENSOR_KINDS.includes(kind)))];
  if (!desired.length) return fail('LIFE_SENSORIUM_COVERAGE_INVALID', ['valid-desired-kinds-required']);
  const observed = new Set();
  for (const signal of signals) {
    const result = normalizeSensorSignal(signal);
    if (!result.ok) return fail('LIFE_SENSORIUM_COVERAGE_INVALID', result.reasonCodes);
    observed.add(result.signal.kind);
  }
  const observedDesired = desired.filter(kind => observed.has(kind));
  const missingKinds = desired.filter(kind => !observed.has(kind));
  return privateEnvelope({
    ok: true,
    status: 'LIFE_SENSORIUM_COVERAGE_MEASURED',
    desiredKinds: desired,
    observedKinds: observedDesired,
    missingKinds,
    sourceCoverageRatio: Number((observedDesired.length / desired.length).toFixed(4)),
    coverageBoundary: 'SOURCE_KIND_COVERAGE_IS_NOT_PERCENT_OF_LIFE_OBSERVED_AND_NOT_INFERENCE_ACCURACY',
    nextQuestion: missingKinds.length ? 'WHICH_MISSING_SENSOR_OR_INDIRECT_INFERENCE_WOULD_REDUCE_THE_MOST_HIGH_VALUE_MANUAL_INPUT' : 'WHICH_UNOBSERVED_LIFE_DIMENSION_EXISTS_DESPITE_SOURCE_KIND_COVERAGE'
  });
}
