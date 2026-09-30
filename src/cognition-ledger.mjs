import { semanticHash, canonicalSemanticJson } from './semantic-closure-kernel.mjs';

export const COGNITION_LEDGER_VERSION = 'uberbond.cognition-ledger.v1';
const units = value => Number.isSafeInteger(value) && value >= 0;
const id = value => typeof value === 'string' && /^[a-zA-Z0-9_.:/-]{1,240}$/.test(value);
const money = usd => Math.ceil(usd * 1_000_000);
export function createCognitionLedger({ month, monthlyCapMicrousd = 30_000_000,
  dailySoftMicrousd = 1_000_000, crownEscrowMicrousd = 15_000_000 } = {}) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || ![monthlyCapMicrousd, dailySoftMicrousd, crownEscrowMicrousd].every(units) || monthlyCapMicrousd > 30_000_000 || crownEscrowMicrousd < 15_000_000 || crownEscrowMicrousd > monthlyCapMicrousd) throw new Error('bounded-monthly-policy-required');
  return { version: COGNITION_LEDGER_VERSION, month, monthlyCapMicrousd, dailySoftMicrousd,
    crownEscrowMicrousd, calls: [], incidents: [], spendAuthorization: 'NONE' };
}

export function cognitionBudgetSummary(ledger, today) {
  if (ledger?.version !== COGNITION_LEDGER_VERSION || !Array.isArray(ledger.calls) || !Array.isArray(ledger.incidents) || ![ledger.monthlyCapMicrousd, ledger.dailySoftMicrousd, ledger.crownEscrowMicrousd].every(units) || ledger.monthlyCapMicrousd > 30_000_000 || ledger.crownEscrowMicrousd < 15_000_000 || ledger.crownEscrowMicrousd > ledger.monthlyCapMicrousd || ledger.spendAuthorization !== 'NONE') throw new Error('valid-conserved-ledger-required');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today) || today.slice(0, 7) !== ledger.month) throw new Error('explicit-month-rollover-required');
  let spent = 0, reserved = 0, crownSpent = 0, crownReserved = 0, todaySpent = 0;
  const ids = new Set();
  for (const call of ledger.calls) {
    if (!id(call.callId) || ids.has(call.callId) || !id(call.taskId) || !id(call.model) || !id(call.provider) || !id(call.qualityClass) || !['CROWN','WORKER'].includes(call.role) || !['RESERVED','DISPATCHED','SETTLED','RELEASED'].includes(call.status) || !units(call.ceilingMicrousd) || !units(call.actualMicrousd) || call.reservedDate.slice(0, 7) !== ledger.month) throw new Error('invalid-call-ledger');
    ids.add(call.callId);
    if (call.status === 'SETTLED') {
      spent += call.actualMicrousd;
      if (call.role === 'CROWN') crownSpent += call.actualMicrousd;
      if (call.settledDate === today) todaySpent += call.actualMicrousd;
    } else if (['RESERVED','DISPATCHED'].includes(call.status)) {
      reserved += call.ceilingMicrousd;
      if (call.role === 'CROWN') crownReserved += call.ceilingMicrousd;
    }
  }
  if (![spent, reserved, crownSpent, crownReserved, todaySpent].every(units)) throw new Error('ledger-integer-overflow');
  const escrowRemaining = Math.max(0, ledger.crownEscrowMicrousd - crownSpent - crownReserved);
  const available = Math.max(0, ledger.monthlyCapMicrousd - spent - reserved);
  const workerAvailable = Math.max(0, available - escrowRemaining);
  const state = ledger.incidents.length || spent + reserved >= ledger.monthlyCapMicrousd ? 'BLACK'
    : workerAvailable === 0 ? 'RED' : todaySpent >= ledger.dailySoftMicrousd ? 'YELLOW' : 'GREEN';
  return { state, todaySpentMicrousd: todaySpent, monthSpentMicrousd: spent,
    reservedMicrousd: reserved, availableMicrousd: available, workerAvailableMicrousd: workerAvailable,
    crownEscrowRemainingMicrousd: escrowRemaining, qualityAction: 'QUEUE_NEVER_DOWNGRADE' };
}

export function reserveCognitionCall(ledger, request, today) {
  const summary = cognitionBudgetSummary(ledger, today);
  if (!id(request?.callId) || !id(request.taskId) || !id(request.model) || !id(request.provider) || !id(request.qualityClass) || !['CROWN','WORKER'].includes(request.role) || !units(request.ceilingMicrousd) || !id(request.cacheState)) throw new Error('complete-call-reservation-required');
  if (ledger.calls.some(c => c.taskId === request.taskId && c.status !== 'RELEASED')) throw new Error('retry-duplicate-task-id');
  if (ledger.calls.some(c => c.callId === request.callId)) throw new Error('retry-duplicate-call-id');
  const available = request.role === 'CROWN' ? summary.availableMicrousd : summary.workerAvailableMicrousd;
  if (summary.state === 'BLACK' || request.ceilingMicrousd > available) return { ok: false, status: 'QUEUED_FOR_BUDGET', ledger, qualityAction: 'UNCHANGED' };
  const next = structuredClone(ledger);
  next.calls.push({ callId: request.callId, taskId: request.taskId, model: request.model,
    provider: request.provider, qualityClass: request.qualityClass, role: request.role,
    cacheState: request.cacheState, ceilingMicrousd: request.ceilingMicrousd,
    actualMicrousd: 0, status: 'RESERVED', reservedDate: today });
  return { ok: true, status: 'RESERVED_NOT_SPEND_AUTHORITY', ledger: next };
}

export function markCognitionDispatched(ledger, callId, today) {
  cognitionBudgetSummary(ledger, today);
  const next = structuredClone(ledger), call = next.calls.find(c => c.callId === callId);
  if (call?.status !== 'RESERVED') throw new Error('active-undispatched-reservation-required');
  call.status = 'DISPATCHED';
  return next;
}

export function releaseUndispatchedCognition(ledger, callId, today) {
  cognitionBudgetSummary(ledger, today);
  const next = structuredClone(ledger), call = next.calls.find(c => c.callId === callId);
  if (call?.status !== 'RESERVED') throw new Error('uncertain-dispatched-call-cannot-be-released');
  call.status = 'RELEASED';
  return next;
}

export function settleCognitionCall(ledger, receipt, today) {
  cognitionBudgetSummary(ledger, today);
  const next = structuredClone(ledger), call = next.calls.find(c => c.callId === receipt?.callId);
  if (!call || !['RESERVED','DISPATCHED','SETTLED'].includes(call.status) || !units(receipt.actualMicrousd) || !id(receipt.receiptRef)) throw new Error('exact-call-cost-receipt-required');
  const receiptHash = semanticHash(receipt);
  if (call.status === 'SETTLED') {
    if (call.receiptHash !== receiptHash) throw new Error('contradictory-cost-reconciliation');
    return { ok: true, status: 'IDEMPOTENT_SETTLEMENT', ledger: next };
  }
  // Record actual cost even on a provider violation; hiding overspend corrupts truth.
  call.status = 'SETTLED'; call.actualMicrousd = receipt.actualMicrousd;
  call.settledDate = today; call.receiptHash = receiptHash; call.receiptRef = receipt.receiptRef;
  if (receipt.actualMicrousd > call.ceilingMicrousd) next.incidents.push({ callId: call.callId, reason: 'PROVIDER_COST_EXCEEDED_RESERVATION' });
  if (receipt.observedModel !== call.model || receipt.observedProvider !== call.provider) next.incidents.push({ callId: call.callId, reason: 'PROVIDER_IDENTITY_CHANGED' });
  if (cognitionBudgetSummary(next, today).monthSpentMicrousd > next.monthlyCapMicrousd) next.incidents.push({ callId: call.callId, reason: 'MONTHLY_CAP_BREACHED' });
  return { ok: next.incidents.length === 0, status: next.incidents.length ? 'COST_RECORDED_RUNTIME_FROZEN' : 'SETTLED', ledger: next };
}

export function estimateCognitionCeiling({ route, inputTokens, maxOutputTokens, now = Date.now(), overheadRate = 0 }) {
  if (!route || !id(route.model) || !id(route.provider) || !route.sourceRef || !Number.isFinite(Date.parse(route.verifiedAt)) || Date.parse(route.verifiedAt) > now || Date.parse(route.expiresAt) <= now || !Number.isFinite(Date.parse(route.expiresAt)) || ![inputTokens, maxOutputTokens].every(units) || !Number.isFinite(overheadRate) || overheadRate < 0 || overheadRate > 1) throw new Error('fresh-bounded-route-price-required');
  if (inputTokens + maxOutputTokens > route.contextTokens || maxOutputTokens > route.maxOutputTokens) throw new Error('route-context-or-output-cap');
  const rates = [route.inputUsdPerMillion, route.outputUsdPerMillion, route.cacheWriteUsdPerMillion ?? route.inputUsdPerMillion];
  if (rates.some(n => typeof n !== 'number' || !Number.isFinite(n) || n < 0)) throw new Error('nonnegative-exact-route-prices-required');
  // Reserve cache MISS/write economics, including long-context tiers; never assume HIT.
  for (const tier of route.priceOverrides ?? []) {
    if (inputTokens >= tier.minPromptTokens) {
      rates[0] = Math.max(rates[0], tier.inputUsdPerMillion);
      rates[1] = Math.max(rates[1], tier.outputUsdPerMillion);
      rates[2] = Math.max(rates[2], tier.cacheWriteUsdPerMillion ?? tier.inputUsdPerMillion);
    }
  }
  if (rates.some(n => !Number.isFinite(n) || n < 0)) throw new Error('invalid-price-tier');
  const usd = ((inputTokens * Math.max(rates[0], rates[2])) + maxOutputTokens * rates[1]) / 1_000_000 * (1 + overheadRate);
  const ceiling = money(usd);
  if (!units(ceiling)) throw new Error('cost-overflow');
  return ceiling;
}

export const REQUEST_FINGERPRINT_FIELDS = Object.freeze(['requestBody','model','modelRevision','providerRoute','toolSchema','systemInstructions','semanticStateHash','sourceHashes','qualityContractHash','freshnessClass','credentialScopeId']);
export function exactRequestFingerprint(request) {
  if (!request || REQUEST_FINGERPRINT_FIELDS.some(key => !Object.hasOwn(request, key)) || !['IMMUTABLE','DEPENDENCY_BOUND','LIVE'].includes(request.freshnessClass)) throw new Error('complete-request-fingerprint-required');
  if (!id(request.model) || !id(request.modelRevision) || !id(request.providerRoute) || !id(request.credentialScopeId) || !/^[a-f0-9]{64}$/.test(request.semanticStateHash) || !/^[a-f0-9]{64}$/.test(request.qualityContractHash) || !request.sourceHashes || !request.requestBody) throw new Error('typed-request-fingerprint-required');
  // requestBody includes all generation parameters: seed/temp/reasoning/schema/tools.
  return semanticHash(request);
}
export function createExactResponseCache() { return { version: COGNITION_LEDGER_VERSION, entries: {}, receipts: [] }; }
export function putExactResponse(cache, { request, artifact, closure, createdAt, ttlMs }) {
  if (request.freshnessClass === 'LIVE') throw new Error('live-response-caching-forbidden');
  if (!Number.isFinite(createdAt) || !Number.isSafeInteger(ttlMs) || ttlMs < 1 || ttlMs > 86400000) throw new Error('bounded-response-cache-ttl-required');
  if (!closure?.ok || closure.artifactHash !== semanticHash(artifact)) throw new Error('verified-cache-artifact-required');
  const key = exactRequestFingerprint(request), next = structuredClone(cache);
  next.entries[key] = { request: structuredClone(request), artifact: structuredClone(artifact), artifactHash: semanticHash(artifact), createdAt, expiresAt: createdAt + ttlMs };
  return next;
}
export function readExactResponse(cache, { request, context, checkClosure, now }) {
  const key = exactRequestFingerprint(request), entry = cache.entries[key];
  const next = structuredClone(cache);
  let reason = request.freshnessClass === 'LIVE' ? 'LIVE_REVALIDATION_REQUIRED' : !entry ? 'ABSENT' : null;
  if (!reason && (!Number.isFinite(now) || !Number.isFinite(entry.createdAt) || entry.createdAt > now || !Number.isFinite(entry.expiresAt) || entry.expiresAt <= now)) reason = 'EXPIRED_OR_FUTURE';
  if (!reason && (semanticHash(entry.request) !== key || entry.artifactHash !== semanticHash(entry.artifact))) reason = 'CACHE_POISONING';
  const closure = !reason ? checkClosure({ artifact: entry.artifact, context, now }) : null;
  if (!reason && !closure.ok) reason = 'AUTHORITY_DECOMPILED';
  next.receipts.push({ key, status: reason ? 'MISS' : 'HIT', reason, observedAt: now });
  return { ok: !reason, status: reason ? 'MISS' : 'HIT', reason, cache: next,
    artifact: !reason ? structuredClone(entry.artifact) : null, closure,
    providerCallsPerformed: 0, actualCostMicrousd: 0 };
}

export function cognitionMetrics(receipts) {
  if (!Array.isArray(receipts)) throw new Error('receipt-list-required');
  const valid = receipts.filter(r => r.kind === 'TASK_COMPLETION' && r.closureVerified === true && r.executionClass);
  const compiled = valid.filter(r => ['E0','E1','E2','E3','E4'].includes(r.executionClass)).length;
  const frontier = valid.filter(r => r.executionClass === 'E6').length;
  const costs = receipts.filter(r => r.kind === 'COST' && r.basis === 'OBSERVED_ALL_IN');
  const exactCosts = costs.length && costs.every(r => units(r.actualMicrousd));
  const actual = exactCosts ? costs.reduce((s, r) => s + r.actualMicrousd, 0) : null;
  const matched = valid.length && valid.every(r => units(r.cheapestMatchedReferenceMicrousd) && r.pairedRequiredRegressions === 0);
  const reference = matched ? valid.reduce((s, r) => s + r.cheapestMatchedReferenceMicrousd, 0) : null;
  const dispatched = receipts.filter(r => r.kind === 'CROWN_DISPATCH');
  const pageFaults = receipts.filter(r => r.kind === 'PAGE_FAULT').length;
  const franchiseGroups = new Map();
  for (const r of receipts.filter(r => r.kind === 'DECISION_FRANCHISE_USE' && r.assetId && r.consumerSemanticHash && ['E1','E2','E3','E4'].includes(r.executionClass))) {
    const set = franchiseGroups.get(r.assetId) ?? new Set();
    set.add(r.consumerSemanticHash); franchiseGroups.set(r.assetId,set);
  }
  const franchiseConsumers = [...franchiseGroups.values()].reduce((n,set)=>n+set.size,0);
  const decisionFranchiseFanout = franchiseGroups.size ? franchiseConsumers / franchiseGroups.size : null;
  const provableFranchiseGroups = new Map();
  for (const r of receipts.filter(r => r.kind === 'PROVABLE_FRANCHISE_USE' && r.assetId && r.consumerSemanticHash && r.referenceContractHash && ['E1','E2','E3','E4'].includes(r.executionClass))) {
    const set = provableFranchiseGroups.get(r.assetId) ?? new Set();
    set.add(r.consumerSemanticHash); provableFranchiseGroups.set(r.assetId,set);
  }
  const franchiseCrownCallsAvoided = provableFranchiseGroups.size
    ? [...provableFranchiseGroups.values()].reduce((n,set)=>n+Math.max(0,set.size-1),0)
    : null;
  const unknown = null;
  return { opusQualityFanout: unknown, frontierPageFaultRate: valid.length + pageFaults ? pageFaults / (valid.length + pageFaults) : unknown,
    compiledCognitionShare: valid.length ? compiled / valid.length : unknown, semanticMulticastFactor: unknown, verifiedSemanticDedupFactor: unknown,
    exactResponseCacheHits: receipts.filter(r => r.kind === 'CACHE_HIT').length, promptCacheReadShare: unknown, decisionFranchiseFanout,
    crownCalls: dispatched.length, crownCallsAvoided: franchiseCrownCallsAvoided, noveltyTax: unknown, researchRecomputeFraction: unknown, crownCapitalROI: unknown, cognitiveHalfLife: unknown,
    usefulTasks: valid.length, byConstructionShare: valid.length ? compiled / valid.length : null,
    frontierSemanticShare: valid.length ? frontier / valid.length : null,
    actualAllInMicrousd: actual, conservativeMatchedReferenceMicrousd: reference,
    referenceCompressionFactor: actual > 0 && reference !== null ? reference / actual : null,
    truthBoundary: 'RECEIPTS_ARE_INPUTS_REQUIRING_TRUSTED_PRODUCERS; NO_SAVINGS_CLAIM_FROM_EMPTY_OR_SYNTHETIC_LEDGER' };
}

export function compileStickyCrownPacket({ immutablePrefix, delta, modelRevision, providerRoute }) {
  canonicalSemanticJson(delta);
  if (!id(modelRevision) || !id(providerRoute) || !immutablePrefix) throw new Error('stable-prefix-model-route-required');
  const prefixHash = semanticHash(immutablePrefix);
  return { prefixHash, sessionId: semanticHash({ prefixHash, modelRevision, providerRoute }),
    messages: [{ role: 'system', content: canonicalSemanticJson(immutablePrefix) }, { role: 'user', content: canonicalSemanticJson(delta) }],
    promptCacheReadShare: null, cacheState: 'NOT_OBSERVED', sameModelFailoverOnly: true };
}
