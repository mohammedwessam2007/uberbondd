import crypto from 'node:crypto';

export const EIGHT_HOUR_OVERDETERMINATION_VERSION = 'uberbond.eight-hour-overdetermination.v1';

export const MONEY_ROUTE_AXES = Object.freeze({
  monetizationSpecies: Object.freeze([
    'fixed-fee-service','productized-audit','paid-diagnostic','implementation-sprint','white-label-fulfillment',
    'lead-generation','referral-fee','affiliate-commission','digital-template','data-product','micro-saas',
    'subscription','usage-based','marketplace-sale','licensing','retainer','recurring-automation','outcome-fee'
  ]),
  buyerPools: Object.freeze([
    'local-smb','agency','creator','developer','ecommerce','professional-services','healthcare-business','home-services',
    'b2b-saas','enterprise-team','marketplace-seller','job-seeker','investor-operator','consumer-prosumer'
  ]),
  acquisitionChannels: Object.freeze([
    'warm-network','direct-email','direct-social','marketplace','partner-referral','affiliate','community','seo',
    'free-tool','programmatic-pages','content','directory','job-board','app-marketplace','local-search','inbound-form'
  ]),
  offerTypes: Object.freeze([
    'audit','diagnosis','done-for-you','done-with-you','setup','repair','migration','optimization','automation','research','asset','access'
  ]),
  paymentRailTypes: Object.freeze(['checkout','invoice','bank-transfer','wallet','marketplace-payout','platform-billing','escrow']),
  fulfillmentModes: Object.freeze([
    'automated-software','ai-assisted-service','manual-service','white-label','template-delivery','report-delivery',
    'data-delivery','integration','consultation','managed-ops','marketplace-fulfillment','partner-fulfillment'
  ]),
  geographies: Object.freeze(['local','national','gcc','mena','eu','uk','north-america','latam','apac','global']),
  urgencyTiers: Object.freeze(['immediate-loss','deadline','backlog','growth','nice-to-have']),
  pricingModels: Object.freeze(['one-time','subscription','retainer','usage','credits','success-fee','commission','hybrid'])
});

const hash = value => crypto.createHash('sha256').update(String(value ?? '')).digest('hex');
const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, Number.isFinite(Number(value)) ? Number(value) : min));
const text = (value, fallback = 'unknown') => String(value ?? '').trim() || fallback;
const uniq = values => [...new Set((Array.isArray(values) ? values : []).map(v => text(v, '')).filter(Boolean))];

function cartesianCount(axes = MONEY_ROUTE_AXES) {
  return Object.values(axes).reduce((product, values) => product * Math.max(1, values.length), 1);
}

function wilsonLower(successes, trials, z = 1.96) {
  const n = Math.max(0, Math.floor(Number(trials) || 0));
  const x = Math.max(0, Math.min(n, Math.floor(Number(successes) || 0)));
  if (!n) return 0;
  const phat = x / n;
  const z2 = z * z;
  const center = phat + z2 / (2 * n);
  const margin = z * Math.sqrt((phat * (1 - phat) + z2 / (4 * n)) / n);
  return clamp((center - margin) / (1 + z2 / n));
}

function normalizeStages(stages = {}) {
  const keys = ['OPPORTUNITY','OFFER','DISTRIBUTION','PAYMENT','FULFILLMENT','ACCEPTANCE','RENEWAL','RECONCILIATION'];
  return Object.fromEntries(keys.map(key => {
    const raw = stages?.[key] && typeof stages[key] === 'object' ? stages[key] : {};
    return [key, {
      status: text(raw.status, 'UNKNOWN').toUpperCase(),
      railId: text(raw.railId, '') || null,
      substituteRailIds: uniq(raw.substituteRailIds),
      evidenceRefs: uniq(raw.evidenceRefs)
    }];
  }));
}

function blockerClass(status) {
  return ({
    BLOCKED_INTERNAL: 'INTERNAL_SOLVABLE',
    BLOCKED_EXTERNAL: 'PROVIDER_OR_RAIL',
    BLOCKED_EVIDENCE: 'EVIDENCE_REQUIRED',
    BLOCKED_AUTHORITY: 'AUTHORITY_REQUIRED',
    PROHIBITED: 'PROHIBITED_OR_IMPOSSIBLE',
    UNKNOWN: 'UNKNOWN'
  })[status] || null;
}

function attemptProbability(input) {
  const trials = Math.max(0, Math.floor(Number(input.observedTrials) || 0));
  const successes = Math.max(0, Math.floor(Number(input.observedSuccesses) || 0));
  const observedLowerBound = wilsonLower(successes, trials);
  const model = clamp(input.successProbability) * clamp(input.evidenceQuality);
  if (trials >= 5) return Math.min(model || 1, observedLowerBound);
  return Math.min(model, 0.05);
}

export function compileMoneyAttempt(input = {}, index = 0) {
  const stages = normalizeStages(input.stages);
  const blockers = Object.entries(stages)
    .filter(([, stage]) => stage.status !== 'READY')
    .map(([stage, value]) => ({
      stage,
      class: blockerClass(value.status),
      status: value.status,
      substituteRailIds: value.substituteRailIds
    }));
  const prohibited = blockers.some(b => b.class === 'PROHIBITED_OR_IMPOSSIBLE');
  const authorityBlocked = blockers.some(b => b.class === 'AUTHORITY_REQUIRED');
  const capitalAtRisk = Math.max(0, Number(input.capitalAtRisk) || 0);
  const minutesToLaunch = Math.max(0, Number(input.minutesToLaunch) || 0);
  const horizonMinutes = Math.max(1, Number(input.horizonMinutes) || 480);
  const ready = blockers.length === 0 && !prohibited && !authorityBlocked && capitalAtRisk === 0 && minutesToLaunch <= horizonMinutes;
  const dimensions = {
    mechanismFamily: text(input.mechanismFamily),
    buyerPool: text(input.buyerPool),
    acquisitionChannel: text(input.acquisitionChannel, stages.DISTRIBUTION.railId || 'unknown'),
    offerType: text(input.offerType),
    paymentRail: text(input.paymentRail, stages.PAYMENT.railId || 'unknown'),
    fulfillmentMode: text(input.fulfillmentMode, stages.FULFILLMENT.railId || 'unknown'),
    geography: text(input.geography),
    urgencyTier: text(input.urgencyTier),
    pricingModel: text(input.pricingModel)
  };
  const failureDomainKey = hash(JSON.stringify([
    dimensions.buyerPool,
    dimensions.acquisitionChannel,
    dimensions.paymentRail,
    dimensions.fulfillmentMode,
    dimensions.geography
  ])).slice(0, 24);
  const realized = Math.max(0, Number(input.observedClearedPayments) || 0) > 0 && Math.max(0, Number(input.acceptedDeliveries) || 0) > 0;
  return {
    id: text(input.id, `attempt-${index + 1}`),
    stages,
    blockers,
    prohibited,
    authorityBlocked,
    ready,
    realized,
    dimensions,
    failureDomainKey,
    evidenceWeightedAttemptProbability: Number(attemptProbability(input).toFixed(6)),
    observedTrials: Math.max(0, Math.floor(Number(input.observedTrials) || 0)),
    observedSuccesses: Math.max(0, Math.floor(Number(input.observedSuccesses) || 0)),
    evidenceQuality: clamp(input.evidenceQuality),
    capitalAtRisk,
    minutesToLaunch,
    expectedNetContribution: Number.isFinite(Number(input.expectedNetContribution)) ? Number(input.expectedNetContribution) : 0,
    externalEffectAuthority: 'NONE'
  };
}

function diversityGain(candidate, selected) {
  if (!selected.length) return 9;
  const fields = ['mechanismFamily','buyerPool','acquisitionChannel','offerType','paymentRail','fulfillmentMode','geography','pricingModel'];
  return fields.reduce((score, field) => {
    const values = new Set(selected.map(x => x.dimensions[field]));
    return score + (values.has(candidate.dimensions[field]) ? 0 : 1);
  }, 0) + (selected.some(x => x.failureDomainKey === candidate.failureDomainKey) ? 0 : 2);
}

function selectPortfolio(eligible, maxParallelCanaries) {
  const remaining = [...eligible];
  const selected = [];
  while (remaining.length && selected.length < maxParallelCanaries) {
    remaining.sort((a, b) => {
      const sa = a.evidenceWeightedAttemptProbability * 100 + diversityGain(a, selected) * 8 + Math.log1p(Math.max(0, a.expectedNetContribution));
      const sb = b.evidenceWeightedAttemptProbability * 100 + diversityGain(b, selected) * 8 + Math.log1p(Math.max(0, b.expectedNetContribution));
      return sb - sa || a.id.localeCompare(b.id);
    });
    const winner = remaining.shift();
    selected.push(winner);
  }
  return selected;
}

function countDistinct(selected, field) {
  return new Set(selected.map(x => x.dimensions[field]).filter(v => v && v !== 'unknown')).size;
}

function onlyValue(selected, field) {
  const values = new Set(selected.map(x => x.dimensions[field]).filter(v => v && v !== 'unknown'));
  return selected.length > 1 && values.size === 1 ? [...values][0] : null;
}

function replacementIntent(attempt, blocker) {
  const stageAxis = {
    DISTRIBUTION: 'acquisitionChannel',
    PAYMENT: 'paymentRail',
    FULFILLMENT: 'fulfillmentMode',
    OFFER: 'offerType',
    OPPORTUNITY: 'buyerPool',
    ACCEPTANCE: 'offerType',
    RENEWAL: 'pricingModel',
    RECONCILIATION: 'paymentRail'
  }[blocker.stage] || 'mechanismFamily';
  return {
    attemptId: attempt.id,
    stage: blocker.stage,
    blockerClass: blocker.class,
    mutateAxis: stageAxis,
    substituteRailIds: blocker.substituteRailIds,
    action: blocker.class === 'PROVIDER_OR_RAIL'
      ? 'spawn-independent-rail-variants'
      : blocker.class === 'EVIDENCE_REQUIRED'
        ? 'run-smallest-reversible-evidence-canary'
        : blocker.class === 'INTERNAL_SOLVABLE'
          ? 'dispatch-wallbreaker-repair'
          : blocker.class === 'UNKNOWN'
            ? 'instrument-and-classify'
            : 'do-not-autorepair'
  };
}

export function compileEightHourOverdetermination({
  attempts = [],
  horizonHours = 8,
  maxParallelCanaries = 32,
  minimumOperationallyIndependentAttempts = 8,
  targetBoundedClearanceModel = 0.99,
  maxCapitalAtRisk = 0,
  externalAddressableCombinationCount = null
} = {}) {
  const horizonMinutes = Math.max(1, Number(horizonHours) || 8) * 60;
  const compiled = (Array.isArray(attempts) ? attempts : []).map((attempt, index) => compileMoneyAttempt({
    ...attempt,
    horizonMinutes
  }, index));
  const killed = compiled.filter(x => x.prohibited);
  const ownerOnly = compiled.filter(x => x.authorityBlocked);
  const eligible = compiled.filter(x => x.ready && x.capitalAtRisk <= maxCapitalAtRisk);
  const selected = selectPortfolio(eligible, Math.max(1, Math.floor(Number(maxParallelCanaries) || 32)));

  const byFailureDomain = new Map();
  for (const item of selected) {
    const previous = byFailureDomain.get(item.failureDomainKey);
    if (!previous || item.evidenceWeightedAttemptProbability > previous.evidenceWeightedAttemptProbability) byFailureDomain.set(item.failureDomainKey, item);
  }
  const boundedNightClearanceModel = byFailureDomain.size
    ? 1 - [...byFailureDomain.values()].reduce((product, item) => product * (1 - item.evidenceWeightedAttemptProbability), 1)
    : 0;

  const dimensions = {
    mechanismFamilies: countDistinct(selected, 'mechanismFamily'),
    buyerPools: countDistinct(selected, 'buyerPool'),
    acquisitionChannels: countDistinct(selected, 'acquisitionChannel'),
    offerTypes: countDistinct(selected, 'offerType'),
    paymentRails: countDistinct(selected, 'paymentRail'),
    fulfillmentModes: countDistinct(selected, 'fulfillmentMode'),
    geographies: countDistinct(selected, 'geography'),
    pricingModels: countDistinct(selected, 'pricingModel'),
    operationalFailureDomains: byFailureDomain.size
  };

  const singlePointFailures = {
    acquisitionChannel: onlyValue(selected, 'acquisitionChannel'),
    paymentRail: onlyValue(selected, 'paymentRail'),
    fulfillmentMode: onlyValue(selected, 'fulfillmentMode'),
    buyerPool: onlyValue(selected, 'buyerPool')
  };
  const spofCount = Object.values(singlePointFailures).filter(Boolean).length;
  const realizedCount = selected.filter(x => x.realized).length;
  const modelQualified = boundedNightClearanceModel >= clamp(targetBoundedClearanceModel);
  const diversityQualified = byFailureDomain.size >= minimumOperationallyIndependentAttempts
    && dimensions.mechanismFamilies >= Math.min(5, minimumOperationallyIndependentAttempts)
    && dimensions.buyerPools >= 3
    && dimensions.acquisitionChannels >= 3
    && dimensions.paymentRails >= 2
    && dimensions.fulfillmentModes >= 3
    && spofCount === 0;

  let status = 'SATURATION_SEARCH_REQUIRED';
  if (selected.length > 0) status = 'PORTFOLIO_EXECUTION_READY';
  if (diversityQualified) status = 'OVERDETERMINED_EXECUTION_READY';
  if (diversityQualified && modelQualified) status = 'ECONOMIC_INEVITABILITY_TARGET_READY';
  if (diversityQualified && modelQualified && realizedCount > 0) status = 'ECONOMIC_INEVITABILITY_WITH_OBSERVED_MONEY_LOOP';

  const repairQueue = [];
  const ownerOnlyBlockers = [];
  for (const attempt of compiled) {
    for (const blocker of attempt.blockers) {
      const intent = replacementIntent(attempt, blocker);
      if (blocker.class === 'AUTHORITY_REQUIRED') ownerOnlyBlockers.push(intent);
      else if (blocker.class !== 'PROHIBITED_OR_IMPOSSIBLE') repairQueue.push(intent);
    }
  }

  const internalAddressableRouteCount = cartesianCount();
  const addressableRouteCount = Number.isFinite(Number(externalAddressableCombinationCount))
    ? Math.max(internalAddressableRouteCount, Number(externalAddressableCombinationCount))
    : internalAddressableRouteCount;

  return {
    version: EIGHT_HOUR_OVERDETERMINATION_VERSION,
    status,
    horizonHours: Number(horizonHours) || 8,
    addressableRouteCount,
    internalRouteArchetypeCount: internalAddressableRouteCount,
    materializedAttemptCount: compiled.length,
    eligibleAttemptCount: eligible.length,
    selectedAttemptCount: selected.length,
    realizedSelectedAttemptCount: realizedCount,
    killedAttemptCount: killed.length,
    ownerBlockedAttemptCount: ownerOnly.length,
    operationallyIndependentSelectedCount: byFailureDomain.size,
    dimensions,
    singlePointFailures,
    boundedNightClearanceModel: Number(boundedNightClearanceModel.toFixed(6)),
    targetBoundedClearanceModel: clamp(targetBoundedClearanceModel),
    selectedAttemptIds: selected.map(x => x.id),
    repairQueue,
    ownerOnlyBlockers,
    saturationDeficit: Math.max(0, minimumOperationallyIndependentAttempts - byFailureDomain.size),
    replacementCapacityRemaining: Math.max(0, addressableRouteCount - compiled.length),
    externalEffectAuthority: 'NONE',
    capitalDeploymentAuthority: 'NONE',
    truthBoundary: 'ADDRESSABLE_ROUTES_ARE_COMBINATORIAL_ARCHETYPES_NOT_PROVEN_OPPORTUNITIES; BOUNDED_CLEARANCE_IS_A_MODEL_NOT_A_GUARANTEE; REAL_MONEY_REQUIRES_OBSERVED_CLEARED_PAYMENT_PLUS_ACCEPTED_DELIVERY; AUTHORITY_AND_PROHIBITED_BLOCKERS_ARE_NEVER_AUTO_BYPASSED'
  };
}
