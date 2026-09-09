import { appendPrivateRecord, founderAuthorized } from './personal-civilization-core.mjs';
import {
  composeDecisionPacket,
  derivePacketAsPrivateRecord,
  recordPacketOutcomeForecast,
  closePacketLoop
} from './personal-civilization-decision-loop.mjs';
import { compilePersonalScientificExperiment } from './personal-civilization-scientific-experiment.mjs';

export const PERSONAL_CIVILIZATION_PRIVATE_REALITY_CYCLE_VERSION = 'uberbond.personal-civilization-private-reality-cycle.v1';

const ZERO = Object.freeze({
  customerMessages: 0,
  providerCalls: 0,
  spendCents: 0,
  deployments: 0,
  dnsChanges: 0,
  credentialChanges: 0,
  paymentMutations: 0,
  productionMutations: 0
});

const text = (value, max = 4000) => {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
};

const iso = value => {
  const date = value instanceof Date ? value : new Date(String(value ?? ''));
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
};

const fail = (status, reasonCodes, extra = {}) => ({
  ok: false,
  status,
  reasonCodes: [...new Set((reasonCodes || []).filter(Boolean))],
  version: PERSONAL_CIVILIZATION_PRIVATE_REALITY_CYCLE_VERSION,
  businessEffectAuthority: 'NONE',
  externalEffectLedger: { ...ZERO },
  ...extra
});

function compactPacket(packet) {
  return {
    decision: packet.decision,
    composedAt: packet.composedAt,
    materiallyDistinctOptions: packet.materiallyDistinctOptions,
    recommendation: packet.recommendation,
    recommendationIsValueBoundary: packet.recommendationIsValueBoundary,
    sovereigntyStatement: packet.sovereigntyStatement
  };
}

function appendJsonRecord({ store, kind = 'DERIVED_MODEL', type, payload, derivedFrom, authorization, destination, occurredAt }) {
  const body = JSON.stringify({ type, payload });
  if (body.length > 19000) return fail('PCE_PRIVATE_REALITY_RECORD_REFUSED', ['private-cycle-record-too-large']);
  return appendPrivateRecord({
    store,
    authorization,
    destination,
    input: {
      kind,
      body,
      occurredAt,
      privacyClass: 'PRIVATE_LIFE_DATA',
      subjectId: 'FOUNDER',
      derivedFrom
    }
  });
}

function requireSources(store, sourceRecordIds) {
  const ids = [...new Set((Array.isArray(sourceRecordIds) ? sourceRecordIds : []).map(id => text(id, 80)).filter(Boolean))];
  if (!ids.length) return { ok: false, reasonCodes: ['source-private-records-required'] };
  const present = new Set((Array.isArray(store) ? store : []).map(row => row?.id).filter(Boolean));
  const missing = ids.filter(id => !present.has(id));
  if (missing.length) return { ok: false, reasonCodes: ['source-private-records-missing'], missing };
  return { ok: true, ids };
}

export function compilePrivateRealityCycle({
  store = [],
  authorization = null,
  privateDestination = null,
  sourceRecordIds = [],
  scientificExperiment = {},
  decision = {},
  founderChoice = null,
  choiceForecast = null,
  observedOutcome = null,
  now = new Date()
} = {}) {
  if (!founderAuthorized(authorization)) return fail('PCE_PRIVATE_REALITY_FOUNDER_AUTHORITY_REQUIRED', ['founder-authorization-required']);
  const at = iso(now);
  if (!at) return fail('PCE_PRIVATE_REALITY_INVALID', ['valid-clock-required']);

  const sourceCheck = requireSources(store, sourceRecordIds);
  if (!sourceCheck.ok) return fail('PCE_PRIVATE_REALITY_INVALID', sourceCheck.reasonCodes, { missingSourceRecordIds: sourceCheck.missing || [] });

  const experiment = compilePersonalScientificExperiment(scientificExperiment);
  if (!experiment.ok) return fail('PCE_PRIVATE_REALITY_EXPERIMENT_REFUSED', experiment.reasonCodes || ['scientific-experiment-refused'], { scientificExperiment: experiment });

  const dossier = appendJsonRecord({
    store,
    type: 'PCE_SCIENTIFIC_EXPERIMENT_DOSSIER_V1',
    payload: {
      founderSelection: experiment.founderSelection,
      capabilityAnalysis: experiment.capabilityAnalysis,
      status: experiment.status,
      experimentDossier: experiment.experimentDossier,
      valueOfInformation: { status: experiment.valueOfInformation?.status || null, decision: experiment.valueOfInformation?.decision || null },
      sovereigntyBoundary: experiment.sovereigntyBoundary,
      authorityBoundary: experiment.authorityBoundary
    },
    derivedFrom: sourceCheck.ids,
    authorization,
    destination: privateDestination,
    occurredAt: at
  });
  if (!dossier.ok) return fail('PCE_PRIVATE_REALITY_DOSSIER_REFUSED', dossier.reasonCodes || ['dossier-private-record-refused']);

  const packetResult = composeDecisionPacket({
    decision: decision.statement,
    options: decision.options,
    forecasts: decision.forecasts,
    keyAssumptions: decision.keyAssumptions,
    whatCouldMakeThisWrong: decision.whatCouldMakeThisWrong,
    irreversibleConsequences: decision.irreversibleConsequences,
    unknownUnknowns: decision.unknownUnknowns,
    missingEvidence: decision.missingEvidence,
    highestValueExperiment: decision.highestValueExperiment || experiment.experiencePlan?.experience?.smallestReversibleExperience || experiment.experimentDossier?.wouldReveal || null,
    updateConditions: decision.updateConditions,
    now: at
  });
  if (!packetResult.ok) return fail('PCE_PRIVATE_REALITY_DECISION_REFUSED', packetResult.reasonCodes || ['decision-packet-refused']);

  const derivedDecision = derivePacketAsPrivateRecord({ store: dossier.store, packet: packetResult.packet, sourceRecordIds: [dossier.record.id], authorization, now: at });
  if (!derivedDecision.ok) return fail('PCE_PRIVATE_REALITY_DECISION_PERSISTENCE_REFUSED', derivedDecision.reasonCodes || ['decision-private-record-refused']);

  const packetSnapshot = appendJsonRecord({
    store: derivedDecision.store,
    type: 'PCE_DECISION_PACKET_SNAPSHOT_V1',
    payload: compactPacket(packetResult.packet),
    derivedFrom: [derivedDecision.record.id],
    authorization,
    destination: privateDestination,
    occurredAt: at
  });
  if (!packetSnapshot.ok) return fail('PCE_PRIVATE_REALITY_PACKET_SNAPSHOT_REFUSED', packetSnapshot.reasonCodes || ['packet-snapshot-refused']);

  if (!founderChoice) {
    return {
      ok: true,
      status: 'PCE_PRIVATE_REALITY_READY_FOR_FOUNDER_CHOICE',
      version: PERSONAL_CIVILIZATION_PRIVATE_REALITY_CYCLE_VERSION,
      store: packetSnapshot.store,
      experiment,
      packet: packetResult.packet,
      recordIds: { dossier: dossier.record.id, decision: derivedDecision.record.id, packetSnapshot: packetSnapshot.record.id, forecast: null, outcome: null },
      truthBoundary: 'NO FOUNDER CHOICE WAS SUPPLIED. THE SYSTEM STOPS BEFORE CHOICE, FORECAST, OUTCOME OR CALIBRATION.',
      businessEffectAuthority: 'NONE',
      externalEffectLedger: { ...ZERO }
    };
  }

  const choiceAt = iso(founderChoice.chosenAt);
  const choiceEvidenceRef = text(founderChoice.evidenceRef, 500);
  if (founderChoice.chosenByFounder !== true || !choiceAt || !choiceEvidenceRef) return fail('PCE_PRIVATE_REALITY_FOUNDER_CHOICE_REQUIRED', ['explicit-founder-choice-with-provenance-required']);
  if (!choiceForecast || typeof choiceForecast !== 'object') return fail('PCE_PRIVATE_REALITY_FORECAST_REQUIRED', ['choice-forecast-required-after-founder-choice']);

  const forecasted = recordPacketOutcomeForecast({
    packet: packetResult.packet,
    chosenOption: founderChoice.option,
    probabilities: choiceForecast.probabilities,
    evidenceCutoff: choiceForecast.evidenceCutoff,
    method: choiceForecast.method,
    assumptions: choiceForecast.assumptions,
    at: choiceAt
  });
  if (!forecasted.ok) return fail('PCE_PRIVATE_REALITY_FORECAST_REFUSED', forecasted.reasonCodes || ['choice-forecast-refused']);

  const forecastRecord = appendJsonRecord({
    store: packetSnapshot.store,
    type: 'PCE_CHOSEN_FORECAST_V1',
    payload: { packet: compactPacket(packetResult.packet), chosenOption: forecasted.chosenOption, founderChoiceEvidenceRef: choiceEvidenceRef, forecast: forecasted.forecast },
    derivedFrom: [packetSnapshot.record.id],
    authorization,
    destination: privateDestination,
    occurredAt: choiceAt
  });
  if (!forecastRecord.ok) return fail('PCE_PRIVATE_REALITY_FORECAST_PERSISTENCE_REFUSED', forecastRecord.reasonCodes || ['forecast-private-record-refused']);

  if (!observedOutcome) {
    return {
      ok: true,
      status: 'PCE_PRIVATE_REALITY_WAITING_FOR_OBSERVED_OUTCOME',
      version: PERSONAL_CIVILIZATION_PRIVATE_REALITY_CYCLE_VERSION,
      store: forecastRecord.store,
      experiment,
      packet: packetResult.packet,
      forecast: forecasted.forecast,
      recordIds: { dossier: dossier.record.id, decision: derivedDecision.record.id, packetSnapshot: packetSnapshot.record.id, forecast: forecastRecord.record.id, outcome: null },
      truthBoundary: 'A FOUNDER CHOICE AND SEALED FORECAST EXIST, BUT NO OUTCOME OR CALIBRATION IS CLAIMED UNTIL REALITY IS OBSERVED.',
      businessEffectAuthority: 'NONE',
      externalEffectLedger: { ...ZERO }
    };
  }

  return closePrivateRealityCycle({ store: forecastRecord.store, authorization, privateDestination, forecastRecordId: forecastRecord.record.id, observedOutcome });
}

function parseTypedRecord(record, expectedType) {
  if (!record || typeof record !== 'object') return fail('PCE_PRIVATE_REALITY_REHYDRATION_REFUSED', ['private-cycle-record-required']);
  let parsed;
  try { parsed = JSON.parse(String(record.body || '')); }
  catch { return fail('PCE_PRIVATE_REALITY_REHYDRATION_REFUSED', ['private-cycle-record-json-invalid']); }
  if (!parsed || parsed.type !== expectedType || !parsed.payload || typeof parsed.payload !== 'object') return fail('PCE_PRIVATE_REALITY_REHYDRATION_REFUSED', ['private-cycle-record-type-mismatch']);
  return { ok: true, payload: parsed.payload };
}

export function closePrivateRealityCycle({
  store = [],
  authorization = null,
  privateDestination = null,
  forecastRecordId = null,
  observedOutcome = null
} = {}) {
  if (!founderAuthorized(authorization)) return fail('PCE_PRIVATE_REALITY_FOUNDER_AUTHORITY_REQUIRED', ['founder-authorization-required']);
  const id = text(forecastRecordId, 80);
  if (!id) return fail('PCE_PRIVATE_REALITY_REHYDRATION_REFUSED', ['forecast-record-id-required']);
  const record = (Array.isArray(store) ? store : []).find(row => row?.id === id);
  if (!record) return fail('PCE_PRIVATE_REALITY_REHYDRATION_REFUSED', ['forecast-record-not-found']);
  if (!Array.isArray(record.derivedFrom) || record.derivedFrom.length === 0) return fail('PCE_PRIVATE_REALITY_REHYDRATION_REFUSED', ['forecast-record-provenance-required']);
  const parsed = parseTypedRecord(record, 'PCE_CHOSEN_FORECAST_V1');
  if (!parsed.ok) return parsed;
  const packet = parsed.payload.packet;
  const sealedForecast = parsed.payload.forecast;
  if (!packet || !sealedForecast) return fail('PCE_PRIVATE_REALITY_REHYDRATION_REFUSED', ['persisted-packet-and-forecast-required']);

  const observedAt = iso(observedOutcome?.observedAt);
  const outcome = text(observedOutcome?.value, 240);
  const observationEvidenceRef = text(observedOutcome?.evidenceRef, 500);
  if (!observedAt || !outcome || !observationEvidenceRef) return fail('PCE_PRIVATE_REALITY_OUTCOME_INVALID', ['observed-outcome-with-time-and-provenance-required']);

  const closed = closePacketLoop({ packet, chosenForecast: sealedForecast, outcome, observedAt, availableAtTime: observedOutcome?.availableAtTime });
  if (!closed.ok) return fail('PCE_PRIVATE_REALITY_OUTCOME_NOT_SCORABLE', [closed.status || 'packet-loop-not-scorable'], { closeFailure: closed });

  const outcomeRecord = appendJsonRecord({
    store,
    kind: 'OBSERVATION',
    type: 'PCE_OUTCOME_CALIBRATION_V1',
    payload: { observationEvidenceRef, observedAt, score: closed.score, decisionQuality: closed.decisionQuality, separation: closed.separation },
    derivedFrom: [record.id],
    authorization,
    destination: privateDestination,
    occurredAt: observedAt
  });
  if (!outcomeRecord.ok) return fail('PCE_PRIVATE_REALITY_OUTCOME_PERSISTENCE_REFUSED', outcomeRecord.reasonCodes || ['outcome-private-record-refused']);

  return {
    ok: true,
    status: 'PCE_PRIVATE_REALITY_CYCLE_REHYDRATED_AND_CLOSED',
    version: PERSONAL_CIVILIZATION_PRIVATE_REALITY_CYCLE_VERSION,
    store: outcomeRecord.store,
    calibration: { score: closed.score, decisionQuality: closed.decisionQuality, separation: closed.separation },
    recordIds: { forecast: record.id, outcome: outcomeRecord.record.id },
    truthBoundary: 'RESTART REHYDRATION PROVES ONLY THAT THE SEALED FORECAST CAN BE SCORED AGAINST THIS OBSERVATION. IT DOES NOT CREATE A GENERAL LIFE LAW.',
    sovereigntyBoundary: 'THE FOUNDER SELECTED THE POSSIBILITY AND THE CHOICE. UBERBOND COMPOSED EVIDENCE AND LEARNING WITHOUT ACQUIRING CHOICE OR ACTION AUTHORITY.',
    businessEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO }
  };
}
