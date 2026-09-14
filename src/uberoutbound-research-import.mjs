import crypto from 'node:crypto';
import { UBEROUTBOUND_EVIDENCE_STATES } from './uberoutbound-genome.mjs';

export const UBEROUTBOUND_RESEARCH_IMPORT_VERSION = 'uberbond.uberoutbound-research-import.v1';

const clean = (value, max = 1000) => String(value ?? '').trim().slice(0, max);
const sha256 = value => crypto.createHash('sha256').update(String(value ?? '')).digest('hex');
const VALID_EVIDENCE_STATES = new Set(Object.values(UBEROUTBOUND_EVIDENCE_STATES));
const VALID_ASSET_TYPES = new Set(['SOURCE_LEDGER', 'EXPERT_UNIVERSE', 'CLAIM_MATRIX', 'HYPOTHESES', 'UNKNOWN_UNKNOWNS', 'SAMPLE_SIZE', 'CONSOLIDATED_DATASET', 'GENOME_SCHEMA', 'RESEARCH_PACK_MANIFEST']);

function normalizedEvidenceState(value) {
  const normalized = clean(value, 80).toUpperCase();
  return VALID_EVIDENCE_STATES.has(normalized) ? normalized : UBEROUTBOUND_EVIDENCE_STATES.UNKNOWN;
}

function normalizeRow(row, assetType, index) {
  const sourceUrl = clean(row?.sourceUrl || row?.url, 1200) || null;
  const sourceId = clean(row?.sourceId || row?.id, 240) || null;
  const title = clean(row?.title || row?.claim || row?.name || row?.hypothesis || row?.question, 500) || null;
  const stableSeed = JSON.stringify({ assetType, sourceId, sourceUrl, title, index });
  return {
    rowId: sourceId || `ubor_${sha256(stableSeed)}`,
    assetType,
    title,
    sourceUrl,
    sourceDate: clean(row?.sourceDate || row?.date, 80) || null,
    author: clean(row?.author, 240) || null,
    organization: clean(row?.organization, 240) || null,
    sampleSize: Number.isFinite(Number(row?.sampleSize)) ? Number(row.sampleSize) : null,
    population: clean(row?.population, 500) || null,
    metric: clean(row?.metric, 240) || null,
    finding: clean(row?.finding || row?.claim || row?.hypothesis || row?.description, 1200) || null,
    methodology: clean(row?.methodology || row?.method, 800) || null,
    limitations: clean(row?.limitations, 800) || null,
    commercialConflict: clean(row?.commercialConflict || row?.conflictOfInterest, 500) || null,
    evidenceState: normalizedEvidenceState(row?.evidenceState || row?.confidenceClass),
    originalIndex: index
  };
}

function validateRow(row, assetType) {
  const reasons = [];
  if (!row.title && !row.finding) reasons.push('row-needs-title-or-finding');
  if (assetType === 'SOURCE_LEDGER' || assetType === 'CLAIM_MATRIX') {
    if (!row.sourceUrl) reasons.push('source-url-required');
    if (!row.sourceDate) reasons.push('source-date-required');
  }
  if (assetType === 'CLAIM_MATRIX' && !row.finding) reasons.push('claim-finding-required');
  return reasons;
}

export function compileUberOutboundResearchImport({
  assetType = null,
  assetId = null,
  sourceArtifactName = null,
  researchCutoff = null,
  rows = [],
  expectedRowCount = null,
  provenance = {},
  now = new Date()
} = {}) {
  const normalizedType = clean(assetType, 80).toUpperCase();
  const reasons = [];
  if (!VALID_ASSET_TYPES.has(normalizedType)) reasons.push('unsupported-asset-type');
  if (!clean(assetId, 240)) reasons.push('asset-id-required');
  if (!clean(sourceArtifactName, 500)) reasons.push('source-artifact-name-required');
  if (!clean(provenance.origin, 240)) reasons.push('provenance-origin-required');
  if (!clean(provenance.receiptId, 240)) reasons.push('provenance-receipt-id-required');
  if (!Array.isArray(rows)) reasons.push('rows-array-required');

  const normalizedRows = Array.isArray(rows)
    ? rows.map((row, index) => normalizeRow(row, normalizedType, index))
    : [];
  const rowValidation = normalizedRows.map(row => ({ rowId: row.rowId, reasonCodes: validateRow(row, normalizedType) }));
  const invalidRows = rowValidation.filter(row => row.reasonCodes.length);
  const byRowId = new Map();
  const duplicateRowIds = [];
  for (const row of normalizedRows) {
    if (byRowId.has(row.rowId)) duplicateRowIds.push(row.rowId);
    else byRowId.set(row.rowId, row);
  }
  if (duplicateRowIds.length) reasons.push('duplicate-row-id');
  if (invalidRows.length) reasons.push('invalid-research-row');
  if (Number.isFinite(Number(expectedRowCount)) && normalizedRows.length !== Number(expectedRowCount)) reasons.push('expected-row-count-mismatch');

  const manifest = {
    version: UBEROUTBOUND_RESEARCH_IMPORT_VERSION,
    assetId: clean(assetId, 240) || null,
    assetType: VALID_ASSET_TYPES.has(normalizedType) ? normalizedType : null,
    sourceArtifactName: clean(sourceArtifactName, 500) || null,
    researchCutoff: clean(researchCutoff, 80) || null,
    importedAt: new Date(now).toISOString(),
    provenance: {
      origin: clean(provenance.origin, 240) || null,
      receiptId: clean(provenance.receiptId, 240) || null,
      sourceDigest: clean(provenance.sourceDigest, 240) || null,
      uploaderOrProducer: clean(provenance.uploaderOrProducer, 240) || null
    },
    inputRowCount: normalizedRows.length,
    uniqueRowCount: byRowId.size,
    expectedRowCount: Number.isFinite(Number(expectedRowCount)) ? Number(expectedRowCount) : null,
    duplicateRowIds: [...new Set(duplicateRowIds)],
    invalidRows,
    rows: [...byRowId.values()],
    state: reasons.length ? 'RESEARCH_IMPORT_REJECTED' : 'RESEARCH_ASSET_ACCEPTED_FOR_REVIEW',
    reasonCodes: [...new Set(reasons)],
    promotionState: 'RESEARCH_ASSET_ONLY',
    policyPromotionAuthorized: false,
    experimentPromotionAuthorized: false,
    externalEffectAuthority: 'NONE',
    businessEffectAuthority: 'NONE',
    truthBoundary: 'Accepted research rows remain untrusted research assets until independently reconciled with provenance, methodology, contradictions and causal evidence. Import never promotes a claim into runtime policy, never creates legal eligibility and never authorizes outreach.'
  };
  manifest.manifestDigest = `sha256:${sha256(JSON.stringify({
    assetId: manifest.assetId,
    assetType: manifest.assetType,
    sourceArtifactName: manifest.sourceArtifactName,
    researchCutoff: manifest.researchCutoff,
    provenance: manifest.provenance,
    rows: manifest.rows
  }))}`;
  return manifest;
}

export function reconcileUberOutboundResearchAssets(assets = []) {
  const accepted = (Array.isArray(assets) ? assets : []).filter(asset => asset?.state === 'RESEARCH_ASSET_ACCEPTED_FOR_REVIEW');
  const rowsByIdentity = new Map();
  const conflicts = [];
  for (const asset of accepted) {
    for (const row of asset.rows || []) {
      const identity = `${asset.assetType}:${row.rowId}`;
      const previous = rowsByIdentity.get(identity);
      if (!previous) {
        rowsByIdentity.set(identity, { ...row, sourceAssetIds: [asset.assetId] });
        continue;
      }
      const comparableA = JSON.stringify({ finding: previous.finding, evidenceState: previous.evidenceState, sourceUrl: previous.sourceUrl, sampleSize: previous.sampleSize });
      const comparableB = JSON.stringify({ finding: row.finding, evidenceState: row.evidenceState, sourceUrl: row.sourceUrl, sampleSize: row.sampleSize });
      if (comparableA !== comparableB) conflicts.push({ identity, assetIds: [...previous.sourceAssetIds, asset.assetId], state: 'CONTRADICTION_REQUIRES_REVIEW' });
      previous.sourceAssetIds = [...new Set([...previous.sourceAssetIds, asset.assetId])];
    }
  }
  return {
    version: UBEROUTBOUND_RESEARCH_IMPORT_VERSION,
    acceptedAssetCount: accepted.length,
    uniqueResearchRowCount: rowsByIdentity.size,
    conflictCount: conflicts.length,
    conflicts,
    rows: [...rowsByIdentity.values()],
    state: conflicts.length ? 'RECONCILED_WITH_CONTRADICTIONS' : 'RECONCILED_RESEARCH_ASSETS',
    promotionState: 'RESEARCH_ASSET_ONLY',
    externalEffectAuthority: 'NONE',
    businessEffectAuthority: 'NONE',
    truthBoundary: 'Reconciliation deduplicates research identity while preserving contradictions. It never resolves disagreements by averaging or popularity and never auto-promotes rows into policy.'
  };
}
