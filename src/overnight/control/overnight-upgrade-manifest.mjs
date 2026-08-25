// Pure manifest and receipt builders for the overnight control-plane lane.
//
// These artifacts describe what an owner may review. They are not engineering
// commands, authorization decisions, deployment receipts, payment receipts, or
// proof that any external effect occurred.

import crypto from 'node:crypto';

export const OVERNIGHT_UPGRADE_MANIFEST_POLICY_VERSION = 'overnight-upgrade-manifest-1.0.0';
export const OVERNIGHT_UPGRADE_RECEIPT_VERSION = 'overnight-upgrade-receipt-1.0.0';

export const ZERO_EXTERNAL_EFFECTS = Object.freeze({
  providerCalls: 0,
  messages: 0,
  purchases: 0,
  deployments: 0,
  credentialChanges: 0,
  dnsChanges: 0,
  productionMutations: 0,
  spendCents: 0
});

const DEFAULT_EXPIRY_MS = 24 * 60 * 60 * 1000;

function text(value, max = 240) {
  return String(value ?? '').trim().slice(0, max);
}

function iso(value) {
  const candidate = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(candidate.getTime())) return null;
  return candidate.toISOString();
}

function uniqueStrings(values, max = 30) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map(value => text(value, 180)).filter(Boolean))].slice(0, max);
}

function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function boundedRows(rows, max = 50) {
  if (!Array.isArray(rows)) return [];
  return rows.slice(0, max).map(row => ({
    id: text(row?.id, 120) || null,
    label: text(row?.label, 180) || null,
    score: Number.isFinite(row?.score) ? row.score : null,
    status: text(row?.status, 80) || null,
    reasonCodes: uniqueStrings(row?.reasonCodes, 12),
    estimatedCostCents: Number.isSafeInteger(row?.estimatedCostCents) ? row.estimatedCostCents : null,
    estimatedFounderMinutes: Number.isSafeInteger(row?.estimatedFounderMinutes) ? row.estimatedFounderMinutes : null
  }));
}

function failed(reasonCodes, extra = {}) {
  return {
    ok: false,
    policyVersion: OVERNIGHT_UPGRADE_MANIFEST_POLICY_VERSION,
    reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
    businessEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS },
    ...extra
  };
}

function artifactSource(tournament) {
  return {
    policyVersion: text(tournament?.policyVersion, 120) || null,
    tournamentId: text(tournament?.tournamentId, 120) || null,
    registryDigest: text(tournament?.registryDigest, 120) || null,
    sourceCommit: text(tournament?.sourceCommit, 120) || null
  };
}

export function buildOvernightUpgradeManifest({
  tournament,
  sourceCommit = null,
  generatedAt = new Date(),
  expiresAt = null,
  runId = null
} = {}) {
  if (!tournament || typeof tournament !== 'object') return failed(['tournament-result-required']);

  const generatedIso = iso(generatedAt);
  if (!generatedIso) return failed(['valid-generated-at-required']);
  const source = text(sourceCommit || tournament.sourceCommit, 120);
  if (!source) return failed(['source-commit-required']);
  const tournamentId = text(tournament.tournamentId, 120);
  const registryDigest = text(tournament.registryDigest, 120);
  if (!tournamentId) return failed(['tournament-id-required']);
  if (!registryDigest) return failed(['registry-digest-required']);

  const expiryCandidate = expiresAt || tournament.expiresAt || new Date(Date.parse(generatedIso) + DEFAULT_EXPIRY_MS).toISOString();
  const expiryIso = iso(expiryCandidate);
  if (!expiryIso) return failed(['valid-expiry-required']);
  if (Date.parse(expiryIso) <= Date.parse(generatedIso)) return failed(['manifest-expired-at-creation']);

  const stableRunId = text(runId, 120) || `overnight_${digest({ source, tournamentId, generatedIso }).slice(0, 24)}`;
  const selected = boundedRows(tournament.selected);
  const ranked = boundedRows(tournament.ranked);
  const blocked = boundedRows(tournament.blocked);
  const reasonCodes = uniqueStrings(tournament.reasonCodes, 30);

  const core = {
    manifestVersion: OVERNIGHT_UPGRADE_MANIFEST_POLICY_VERSION,
    runId: stableRunId,
    generatedAt: generatedIso,
    expiresAt: expiryIso,
    sourceCommit: source,
    source: artifactSource({ ...tournament, sourceCommit: source }),
    status: text(tournament.status, 80) || 'REVIEW_REQUIRED',
    reasonCodes,
    registryCount: Number.isSafeInteger(tournament.registryCount) ? tournament.registryCount : null,
    dedupe: tournament.dedupe && typeof tournament.dedupe === 'object'
      ? {
          duplicateCount: Number.isSafeInteger(tournament.dedupe.duplicateCount) ? tournament.dedupe.duplicateCount : 0,
          conflictCount: Number.isSafeInteger(tournament.dedupe.conflictCount) ? tournament.dedupe.conflictCount : 0
        }
      : { duplicateCount: 0, conflictCount: 0 },
    budget: tournament.budget || null,
    killSwitches: tournament.killSwitches || { engaged: [] },
    selected,
    ranked,
    blocked,
    authority: {
      externalEffects: 'NONE',
      repositoryMutation: 'OWNER_REQUIRED',
      deployment: 'DISABLED',
      spend: 'DISABLED',
      credentials: 'DISABLED',
      dns: 'DISABLED',
      sovereignty: 'UNCHANGED'
    },
    execution: {
      status: 'NOT_RUN',
      implementation: 'NOT_AUTHORIZED',
      providerCalls: 'DISABLED',
      nextStep: 'OWNER_REVIEW_REQUIRED'
    },
    limitations: [
      'This manifest ranks bounded local proposals; it does not implement or merge code.',
      'Economic values are hypotheses unless backed by external evidence supplied to the tournament.',
      'The registry does not grant authority to edit sovereignty, send, spend, deploy, or contact anyone.'
    ],
    businessEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS }
  };

  return {
    ok: true,
    ...core,
    manifestDigest: digest(core)
  };
}

export function buildOvernightUpgradeReceipt({ manifest } = {}) {
  if (!manifest || typeof manifest !== 'object' || manifest.ok !== true) {
    return failed(['valid-manifest-required']);
  }
  const manifestDigest = text(manifest.manifestDigest, 120);
  if (!manifestDigest) return failed(['manifest-digest-required']);

  const receiptCore = {
    receiptVersion: OVERNIGHT_UPGRADE_RECEIPT_VERSION,
    receiptId: `overnight_receipt_${digest({ manifestDigest, runId: manifest.runId }).slice(0, 24)}`,
    runId: text(manifest.runId, 120),
    sourceCommit: text(manifest.sourceCommit, 120),
    manifestDigest,
    tournamentId: text(manifest.source?.tournamentId, 120),
    status: text(manifest.status, 80),
    selectedCount: Array.isArray(manifest.selected) ? manifest.selected.length : 0,
    rankedCount: Array.isArray(manifest.ranked) ? manifest.ranked.length : 0,
    blockedCount: Array.isArray(manifest.blocked) ? manifest.blocked.length : 0,
    generatedAt: text(manifest.generatedAt, 80),
    expiresAt: text(manifest.expiresAt, 80),
    decision: 'OWNER_REVIEW_REQUIRED',
    businessEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS },
    limitations: uniqueStrings(manifest.limitations, 12)
  };

  return {
    ok: true,
    policyVersion: OVERNIGHT_UPGRADE_MANIFEST_POLICY_VERSION,
    ...receiptCore,
    receiptDigest: digest(receiptCore)
  };
}

export function emitOvernightUpgradeArtifacts(args = {}) {
  const manifest = buildOvernightUpgradeManifest(args);
  if (!manifest.ok) return { ok: false, manifest, receipt: null };
  const receipt = buildOvernightUpgradeReceipt({ manifest });
  if (!receipt.ok) return { ok: false, manifest, receipt };
  return { ok: true, manifest, receipt };
}

