// Bounded tournament for market capability primitives.
//
// The tournament is deliberately a planning function. It scores caller-
// supplied economics, penalizes unknowns, applies expiry/kill/budget gates, and
// emits owner-review artifacts. It never calls a provider or authorizes a
// repository, payment, DNS, mailbox, deployment, or customer-system effect.

import crypto from 'node:crypto';
import {
  buildMarketCapabilityRegistry,
  normalizeCapabilityPrimitive,
  MARKET_CAPABILITY_REGISTRY_POLICY_VERSION
} from './market-capability-registry.mjs';
import {
  emitOvernightUpgradeArtifacts,
  ZERO_EXTERNAL_EFFECTS
} from './overnight-upgrade-manifest.mjs';

export const CAPABILITY_TOURNAMENT_POLICY_VERSION = 'overnight-capability-tournament-1.0.0';
export const MAX_CAPABILITY_TOURNAMENT_SIZE = 100;
export const MAX_SELECTED_CAPABILITIES = 20;

const REQUIRED_ECONOMIC_FIELDS = Object.freeze([
  'expectedRevenueCents',
  'deliveryCostCents',
  'conversionProbability',
  'founderMinutes'
]);

const OPTIONAL_UNKNOWN_PENALTIES = Object.freeze({
  recurringProbability: 0.80,
  buildMinutes: 0.65,
  runCostCents: 0.65,
  riskPenaltyCents: 0.55,
  evidenceConfidence: 0.35
});

function text(value, max = 240) {
  return String(value ?? '').trim().slice(0, max);
}

function iso(value) {
  const candidate = value instanceof Date ? value : new Date(value);
  return Number.isNaN(candidate.getTime()) ? null : candidate.toISOString();
}

function unique(values, max = 30) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map(value => text(value, 160)).filter(Boolean))].slice(0, max);
}

function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function fail(reasonCodes, extra = {}) {
  return {
    ok: false,
    policyVersion: CAPABILITY_TOURNAMENT_POLICY_VERSION,
    status: 'REVIEW_REQUIRED',
    reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
    selected: [],
    ranked: [],
    blocked: [],
    businessEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS },
    ...extra
  };
}

function boundedInteger(value, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= min && number <= max ? number : null;
}

function boundedProbability(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 1 ? number : null;
}

function readNumber(source, key, { probability = false, positive = false } = {}) {
  if (!Object.hasOwn(source, key) || source[key] == null || source[key] === '') {
    return { value: null, unknown: true, invalid: false };
  }
  const value = probability ? boundedProbability(source[key]) : boundedInteger(source[key], { min: 0 });
  if (value == null || (positive && value <= 0)) return { value: null, unknown: false, invalid: true };
  return { value, unknown: false, invalid: false };
}

function normalizeEconomics(capability) {
  const source = capability?.economics && typeof capability.economics === 'object' && !Array.isArray(capability.economics)
    ? capability.economics
    : {};
  const fields = {
    expectedRevenueCents: readNumber(source, 'expectedRevenueCents'),
    deliveryCostCents: readNumber(source, 'deliveryCostCents'),
    conversionProbability: readNumber(source, 'conversionProbability', { probability: true }),
    recurringProbability: readNumber(source, 'recurringProbability', { probability: true }),
    founderMinutes: readNumber(source, 'founderMinutes', { positive: true }),
    buildMinutes: readNumber(source, 'buildMinutes'),
    runCostCents: readNumber(source, 'runCostCents'),
    riskPenaltyCents: readNumber(source, 'riskPenaltyCents'),
    evidenceConfidence: readNumber(source, 'evidenceConfidence', { probability: true })
  };
  return fields;
}

function normalizeKillSwitches(value) {
  const configured = [];
  const engaged = [];
  if (Array.isArray(value)) {
    for (const name of value) {
      const normalized = text(name, 120).toLowerCase();
      if (normalized) {
        configured.push(normalized);
        engaged.push(normalized);
      }
    }
  } else if (value && typeof value === 'object') {
    for (const [key, raw] of Object.entries(value)) {
      const name = text(key, 120).toLowerCase();
      if (!name) continue;
      configured.push(name);
      if (raw === true || /^(on|engaged|tripped|active)$/i.test(String(raw))) engaged.push(name);
    }
  }
  return {
    configured: [...new Set(configured)].sort(),
    engaged: [...new Set(engaged)].sort(),
    anyEngaged: engaged.length > 0
  };
}

function optionalPenalty(fields) {
  return Object.entries(OPTIONAL_UNKNOWN_PENALTIES)
    .filter(([key]) => fields[key]?.unknown)
    .reduce((product, [, penalty]) => product * penalty, 1);
}

export function scoreCapabilityPrimitive(input, { date = new Date() } = {}) {
  const at = iso(date);
  if (!at) return { ok: false, reasonCodes: ['valid-date-required'] };
  const normalized = normalizeCapabilityPrimitive(input);
  if (!normalized.ok) return { ok: false, reasonCodes: normalized.reasonCodes, id: normalized.candidate?.id || null };

  const capability = normalized.capability;
  const fields = normalizeEconomics(capability);
  const invalidFields = Object.entries(fields).filter(([, field]) => field.invalid).map(([key]) => key);
  const unknownFields = Object.entries(fields).filter(([, field]) => field.unknown).map(([key]) => key);
  const missingRequired = REQUIRED_ECONOMIC_FIELDS.filter(key => fields[key].unknown);
  const reasonCodes = [
    ...invalidFields.map(key => `invalid-economic-${key}`),
    ...unknownFields.map(key => `unknown-economic-${key}`)
  ];

  if (invalidFields.length > 0) {
    return {
      ok: true,
      ...capability,
      status: 'INVALID_ECONOMICS',
      eligibleForSelection: false,
      score: 0,
      economicConfidence: 0,
      unknownFields,
      reasonCodes,
      estimatedCostCents: null,
      estimatedFounderMinutes: null,
      timestamp: at
    };
  }

  if (missingRequired.length > 0) {
    return {
      ok: true,
      ...capability,
      status: 'UNKNOWN_ECONOMICS',
      eligibleForSelection: false,
      score: 0,
      economicConfidence: 0,
      unknownFields,
      reasonCodes,
      missingRequired,
      estimatedCostCents: fields.runCostCents.value,
      estimatedFounderMinutes: fields.founderMinutes.value,
      timestamp: at
    };
  }

  const unknownPenaltyFactor = optionalPenalty(fields);
  const recurringProbability = fields.recurringProbability.value ?? 0;
  const evidenceConfidence = fields.evidenceConfidence.value ?? 0.35;
  const buildMinutes = fields.buildMinutes.value ?? 0;
  const runCostCents = fields.runCostCents.value ?? 0;
  const riskPenaltyCents = fields.riskPenaltyCents.value ?? 0;
  const founderMinutes = fields.founderMinutes.value;
  const estimatedFounderMinutes = founderMinutes + buildMinutes;
  const successfulContributionCents = fields.expectedRevenueCents.value - fields.deliveryCostCents.value;
  const expectedNetContributionCents = (
    successfulContributionCents
    * fields.conversionProbability.value
    * (1 + recurringProbability)
    * evidenceConfidence
    * unknownPenaltyFactor
  ) - runCostCents - riskPenaltyCents;
  const score = estimatedFounderMinutes > 0
    ? Math.round((expectedNetContributionCents / estimatedFounderMinutes) * 100) / 100
    : 0;
  const status = expectedNetContributionCents > 0 ? 'SCORE_READY' : 'NEGATIVE_OR_ZERO_ECONOMICS';
  const budgetKnown = !fields.buildMinutes.unknown && !fields.runCostCents.unknown;

  return {
    ok: true,
    ...capability,
    status,
    eligibleForSelection: status === 'SCORE_READY' && budgetKnown,
    score,
    expectedNetContributionCents: Math.round(expectedNetContributionCents * 100) / 100,
    successfulContributionCents,
    economicConfidence: Math.round(evidenceConfidence * unknownPenaltyFactor * 10000) / 10000,
    unknownPenaltyFactor,
    unknownFields,
    reasonCodes: [
      ...reasonCodes,
      ...(budgetKnown ? [] : ['budget-estimate-unknown'])
    ],
    estimatedCostCents: fields.runCostCents.value,
    estimatedFounderMinutes: estimatedFounderMinutes,
    timestamp: at
  };
}

export function compareCapabilityScores(a, b) {
  return (b.score - a.score)
    || (b.economicConfidence - a.economicConfidence)
    || ((a.estimatedFounderMinutes ?? Number.MAX_SAFE_INTEGER) - (b.estimatedFounderMinutes ?? Number.MAX_SAFE_INTEGER))
    || String(a.id).localeCompare(String(b.id));
}

function compact(row, rank = null) {
  return {
    rank,
    id: row.id,
    label: row.label,
    family: row.family,
    priority: row.priority,
    reuseState: row.reuseState,
    existingModulePaths: row.existingModulePaths,
    score: row.score,
    expectedNetContributionCents: row.expectedNetContributionCents ?? null,
    economicConfidence: row.economicConfidence,
    unknownPenaltyFactor: row.unknownPenaltyFactor ?? 0,
    unknownFields: row.unknownFields || [],
    status: row.status,
    eligibleForSelection: row.eligibleForSelection === true,
    reasonCodes: unique(row.reasonCodes, 20),
    estimatedCostCents: row.estimatedCostCents,
    estimatedFounderMinutes: row.estimatedFounderMinutes,
    candidateExpiresAt: row.expiresAt || null
  };
}

function candidateExpired(row, timestamp) {
  if (!row.expiresAt) return false;
  const expiry = iso(row.expiresAt);
  return !expiry || Date.parse(expiry) <= Date.parse(timestamp);
}

export function runCapabilityTournament({
  capabilities,
  sourceCommit = null,
  date = new Date(),
  expiresAt = null,
  budgetCents,
  founderMinuteBudget,
  maxSelections = 5,
  killSwitches = {},
  runId = null
} = {}) {
  const timestamp = iso(date);
  if (!timestamp) return fail(['valid-date-required']);
  const commit = text(sourceCommit, 120);
  if (!commit) return fail(['source-commit-required'], { timestamp });
  const maxCost = boundedInteger(budgetCents, { min: 0 });
  const maxFounderMinutes = boundedInteger(founderMinuteBudget, { min: 0 });
  if (maxCost == null) return fail(['valid-budget-cents-required'], { timestamp, sourceCommit: commit });
  if (maxFounderMinutes == null) return fail(['valid-founder-minute-budget-required'], { timestamp, sourceCommit: commit });
  const selectionLimit = boundedInteger(maxSelections, { min: 1, max: MAX_SELECTED_CAPABILITIES });
  if (selectionLimit == null) return fail(['valid-selection-limit-required'], { timestamp, sourceCommit: commit });

  const expiry = iso(expiresAt || new Date(Date.parse(timestamp) + 24 * 60 * 60 * 1000));
  if (!expiry) return fail(['valid-expiry-required'], { timestamp, sourceCommit: commit });
  if (Date.parse(expiry) <= Date.parse(timestamp)) {
    return fail(['tournament-expired'], { timestamp, sourceCommit: commit, expiresAt: expiry });
  }

  const registry = buildMarketCapabilityRegistry({ capabilities: undefined, entries: capabilities });
  if (!registry.ok) {
    return fail(['market-capability-registry-invalid'], {
      timestamp,
      sourceCommit: commit,
      registryErrors: registry.errors,
      registryConflicts: registry.conflicts
    });
  }

  const globalKillSwitches = normalizeKillSwitches(killSwitches);
  const scored = registry.entries
    .slice(0, MAX_CAPABILITY_TOURNAMENT_SIZE)
    .map(capability => scoreCapabilityPrimitive(capability, { date: timestamp }))
    .filter(result => result.ok)
    .sort(compareCapabilityScores);

  const ranked = [];
  const selected = [];
  const blocked = [];
  let consumedCostCents = 0;
  let consumedFounderMinutes = 0;
  let budgetBlocked = false;

  for (const row of scored) {
    const item = compact(row, ranked.length + 1);
    const localKillSwitches = normalizeKillSwitches(row.killSwitches);
    const candidateIsKilled = globalKillSwitches.anyEngaged || localKillSwitches.anyEngaged;
    const candidateIsExpired = candidateExpired(row, timestamp);
    let status = row.status;
    let reasonCodes = [...item.reasonCodes];

    if (candidateIsKilled) {
      status = 'BLOCKED_KILL_SWITCH';
      reasonCodes.push('kill-switch-engaged');
    } else if (candidateIsExpired) {
      status = 'EXPIRED';
      reasonCodes.push('capability-expired');
    } else if (!row.eligibleForSelection) {
      status = row.status;
      if (row.status === 'SCORE_READY' && row.estimatedCostCents == null) reasonCodes.push('budget-estimate-unknown');
    } else if (selected.length >= selectionLimit) {
      status = 'BLOCKED_SELECTION_LIMIT';
      reasonCodes.push('selection-limit-reached');
    } else if ((consumedCostCents + row.estimatedCostCents) > maxCost
      || (consumedFounderMinutes + row.estimatedFounderMinutes) > maxFounderMinutes) {
      status = 'BLOCKED_BUDGET';
      reasonCodes.push('budget-exhausted');
      budgetBlocked = true;
    } else {
      status = 'SELECTED';
      consumedCostCents += row.estimatedCostCents;
      consumedFounderMinutes += row.estimatedFounderMinutes;
      selected.push({ ...item, status, reasonCodes: unique(reasonCodes, 20) });
    }

    const finalItem = { ...item, status, reasonCodes: unique(reasonCodes, 20) };
    ranked.push(finalItem);
    if (status !== 'SELECTED') blocked.push(finalItem);
  }

  const status = globalKillSwitches.anyEngaged
    ? 'KILL_SWITCH_BLOCKED'
    : budgetBlocked
      ? 'BUDGET_EXHAUSTED'
      : selected.length > 0
        ? 'TOURNAMENT_COMPLETE'
        : 'NO_ELIGIBLE_CAPABILITIES';
  const reasonCodes = unique([
    ...(globalKillSwitches.anyEngaged ? ['kill-switch-engaged'] : []),
    ...(budgetBlocked ? ['budget-exhausted'] : []),
    ...(selected.length === 0 ? ['no-capability-selected'] : [])
  ], 30);
  const budget = {
    maxCostCents: maxCost,
    consumedCostCents,
    remainingCostCents: maxCost - consumedCostCents,
    maxFounderMinutes,
    consumedFounderMinutes,
    remainingFounderMinutes: maxFounderMinutes - consumedFounderMinutes,
    status: budgetBlocked ? 'EXHAUSTED_OR_INSUFFICIENT_FOR_NEXT' : 'AVAILABLE'
  };
  const normalizedKillSwitches = {
    configured: globalKillSwitches.configured,
    engaged: globalKillSwitches.engaged
  };
  const tournamentId = `overnight_tournament_${digest({
    policyVersion: CAPABILITY_TOURNAMENT_POLICY_VERSION,
    sourceCommit: commit,
    timestamp,
    expiresAt: expiry,
    registryDigest: registry.registryDigest,
    budget,
    selectionLimit,
    killSwitches: normalizedKillSwitches
  }).slice(0, 24)}`;

  const result = {
    ok: true,
    policyVersion: CAPABILITY_TOURNAMENT_POLICY_VERSION,
    registryPolicyVersion: MARKET_CAPABILITY_REGISTRY_POLICY_VERSION,
    status,
    reasonCodes,
    tournamentId,
    sourceCommit: commit,
    timestamp,
    expiresAt: expiry,
    registryDigest: registry.registryDigest,
    registryCount: registry.registryCount,
    dedupe: {
      duplicateCount: registry.duplicates.length,
      conflictCount: registry.conflicts.length
    },
    budget,
    selectionLimit,
    killSwitches: normalizedKillSwitches,
    selected,
    ranked,
    blocked,
    businessEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS }
  };

  const artifacts = emitOvernightUpgradeArtifacts({
    tournament: result,
    sourceCommit: commit,
    generatedAt: timestamp,
    expiresAt: expiry,
    runId
  });
  return { ...result, artifacts };
}
