// Provider/source adapter contracts without live access.
//
// This is the socket, not fake electricity: it records purpose, terms,
// capability, rate/credit limits, retention, kill switch, and dry-run status,
// but never authenticates, calls, scrapes, or persists credentials.

import crypto from 'node:crypto';

export const ADAPTER_CONTRACT_POLICY_VERSION = 'adapter-contract-1.0.0';
export const ADAPTER_CONTRACT_EXTERNAL_EFFECTS = Object.freeze({
  providerCalls: 0,
  messages: 0,
  purchases: 0,
  deployments: 0,
  credentialChanges: 0,
  dnsChanges: 0,
  productionMutations: 0,
  spendCents: 0
});

const MAX_FIELDS = 100;
const MAX_CAPABILITIES = 50;

function atDate(value) {
  const date = value instanceof Date ? value : new Date(value || Date.now());
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function text(value, max = 400) {
  return String(value ?? '').trim().slice(0, max);
}

function strings(values, max = 50) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map(value => text(value, 160)).filter(Boolean))].slice(0, max);
}

function failed(reasonCodes, timestamp) {
  return {
    ok: false,
    policyVersion: ADAPTER_CONTRACT_POLICY_VERSION,
    status: 'REVIEW_REQUIRED',
    timestamp,
    reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
    externalEffectLedger: { ...ADAPTER_CONTRACT_EXTERNAL_EFFECTS }
  };
}

function validHttpUrl(value) {
  try {
    const url = new URL(String(value));
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

export function compileAdapterManifest({
  adapterId,
  sourceKind,
  termsUrl,
  purpose,
  allowedFields = [],
  capabilities = [],
  rateLimit,
  creditModel,
  retentionDays,
  authStatus = 'NOT_CONFIGURED',
  killSwitch = true,
  date = new Date()
} = {}) {
  const reference = atDate(date);
  const timestamp = reference.toISOString();
  const terms = validHttpUrl(termsUrl);
  const fields = strings(allowedFields, MAX_FIELDS);
  const caps = strings(capabilities, MAX_CAPABILITIES);
  const reasons = [];
  if (!text(adapterId, 120)) reasons.push('adapter-id-required');
  if (!text(sourceKind, 80)) reasons.push('source-kind-required');
  if (!terms) reasons.push('terms-url-required');
  if (!text(purpose, 500)) reasons.push('purpose-required');
  if (!fields.length) reasons.push('allowed-fields-required');
  if (killSwitch !== true) reasons.push('kill-switch-must-default-on');
  if (reasons.length) return failed(reasons, timestamp);
  const identity = { adapterId: text(adapterId, 120), sourceKind: text(sourceKind, 80), termsUrl: terms, purpose: text(purpose, 500), allowedFields: fields, capabilities: caps, rateLimit: rateLimit && typeof rateLimit === 'object' ? { requestsPerMinute: Number.isInteger(rateLimit.requestsPerMinute) ? Math.max(0, rateLimit.requestsPerMinute) : null, concurrency: Number.isInteger(rateLimit.concurrency) ? Math.max(0, rateLimit.concurrency) : null } : { requestsPerMinute: null, concurrency: null }, creditModel: text(creditModel, 300) || 'UNKNOWN', retentionDays: Number.isInteger(retentionDays) ? Math.max(0, retentionDays) : null, authStatus: text(authStatus, 80).toUpperCase() || 'NOT_CONFIGURED', killSwitch: true };
  return {
    ok: true,
    policyVersion: ADAPTER_CONTRACT_POLICY_VERSION,
    manifestId: `adapter_${digest(identity).slice(0, 24)}`,
    status: 'MANIFEST_ONLY',
    createdAt: timestamp,
    ...identity,
    credentialsStored: false,
    liveAccessProven: false,
    externalEffectLedger: { ...ADAPTER_CONTRACT_EXTERNAL_EFFECTS }
  };
}

export function evaluateAdapterAccess({ manifest, authorizationReceipt, date = new Date() } = {}) {
  const reference = atDate(date);
  const timestamp = reference.toISOString();
  if (!manifest || manifest.ok !== true || !manifest.manifestId) return failed(['valid-adapter-manifest-required'], timestamp);
  const reasons = [];
  if (manifest.killSwitch !== true) reasons.push('adapter-kill-switch-required');
  if (manifest.authStatus !== 'OWNER_AUTHORIZED') reasons.push('owner-authorized-access-required');
  if (!authorizationReceipt?.receiptId) reasons.push('authorization-receipt-required');
  return {
    ok: true,
    policyVersion: ADAPTER_CONTRACT_POLICY_VERSION,
    manifestId: manifest.manifestId,
    timestamp,
    status: reasons.length ? 'DRY_RUN_ONLY' : 'OWNER_AUTHORIZED_REVIEW_REQUIRED',
    reasonCodes: reasons,
    liveAccess: 'EXTERNAL_PROOF_REQUIRED',
    networkCalls: 0,
    providerCalls: 0,
    credentialsStored: false,
    externalEffectLedger: { ...ADAPTER_CONTRACT_EXTERNAL_EFFECTS }
  };
}

export function prepareAdapterDryRun({ manifest, candidates = [], maxCandidates = 100, date = new Date() } = {}) {
  const reference = atDate(date);
  const timestamp = reference.toISOString();
  if (!manifest || manifest.ok !== true || !manifest.manifestId) return failed(['valid-adapter-manifest-required'], timestamp);
  if (!Array.isArray(candidates)) return failed(['candidates-array-required'], timestamp);
  const limit = Number.isInteger(maxCandidates) ? Math.max(0, Math.min(100, maxCandidates)) : 100;
  const bounded = candidates.slice(0, limit).map(candidate => ({
    candidateRef: text(candidate?.candidateRef || candidate?.id, 160) || null,
    payloadDigest: digest(candidate),
    status: 'NOT_FETCHED'
  }));
  return {
    ok: true,
    policyVersion: ADAPTER_CONTRACT_POLICY_VERSION,
    dryRunId: `dryrun_${digest({ manifestId: manifest.manifestId, timestamp, bounded }).slice(0, 24)}`,
    manifestId: manifest.manifestId,
    status: 'DRY_RUN_PREPARED',
    timestamp,
    requestedCount: candidates.length,
    boundedCount: bounded.length,
    candidates: bounded,
    networkCalls: 0,
    providerCalls: 0,
    externalEffectLedger: { ...ADAPTER_CONTRACT_EXTERNAL_EFFECTS }
  };
}

export async function logAdapterContractReceipt(store, type, detail) {
  if (!store || typeof store.log !== 'function' || !detail?.ok) return null;
  return store.log(type, {
    policyVersion: detail.policyVersion,
    manifestId: detail.manifestId || null,
    dryRunId: detail.dryRunId || null,
    status: detail.status,
    reasonCodes: detail.reasonCodes || [],
    boundedCount: detail.boundedCount ?? null,
    networkCalls: detail.networkCalls ?? 0,
    providerCalls: detail.providerCalls ?? 0,
    credentialsStored: detail.credentialsStored ?? false,
    timestamp: detail.timestamp || detail.createdAt || null,
    externalEffectLedger: detail.externalEffectLedger
  });
}
