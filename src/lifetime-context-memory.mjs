import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const LIFETIME_CONTEXT_VERSION = 'uberbond-lifetime-context-1.0.1';
const MEMORY_CLASSES = new Set(['EPISODIC', 'SEMANTIC', 'ECONOMIC', 'WESSAM', 'REPOSITORY', 'EVIDENCE', 'SYNTHETIC']);
const PRIVACY_CLASSES = new Set(['PUBLIC', 'INTERNAL', 'PRIVATE', 'WESSAM_INNERMOST']);
const TRUTH_CLASSES = new Set(['OBSERVED', 'OFFICIAL_SOURCE', 'VERIFIED_INTERNAL', 'SUPPORTED_INFERENCE', 'HYPOTHESIS', 'SYNTHETIC']);

function text(value, max = 2000) {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
}
function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
function fail(reasonCodes, extra = {}) {
  return {
    ok: false,
    version: LIFETIME_CONTEXT_VERSION,
    status: 'LIFETIME_CONTEXT_DENIED',
    reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
    businessEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS },
    ...extra
  };
}
function scoreRecency(observedAt, now) {
  const ageHours = Math.max(0, (now.getTime() - new Date(observedAt).getTime()) / 3_600_000);
  return 1 / (1 + ageHours / 168);
}
function lexicalOverlap(query, haystack) {
  const q = new Set(String(query).toLowerCase().split(/[^a-z0-9]+/).filter(v => v.length > 2));
  if (!q.size) return 0;
  const h = new Set(String(haystack).toLowerCase().split(/[^a-z0-9]+/).filter(v => v.length > 2));
  let hit = 0;
  for (const token of q) if (h.has(token)) hit += 1;
  return hit / q.size;
}
function normalizeMemoryItem(item, index) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return { error: `item-${index}-object-required` };
  const id = text(item.id, 200);
  const memoryClass = text(item.memoryClass, 80);
  const privacyClass = text(item.privacyClass, 80);
  const truthClass = text(item.truthClass, 80);
  const observedAt = text(item.observedAt, 80);
  const title = text(item.title, 500);
  const summary = text(item.summary, 4000);
  const provenanceRefs = Array.isArray(item.provenanceRefs) ? [...new Set(item.provenanceRefs.map(v => text(v, 1000)).filter(Boolean))] : null;
  const supersedes = Array.isArray(item.supersedes) ? [...new Set(item.supersedes.map(v => text(v, 200)).filter(Boolean))] : [];
  const confidence = Number(item.confidence);
  const economicWeight = Number(item.economicWeight ?? 0);
  const importance = Number(item.importance ?? 0.5);
  const timestamp = new Date(observedAt);
  const errors = [];
  if (!id) errors.push(`item-${index}-id-required`);
  if (!MEMORY_CLASSES.has(memoryClass)) errors.push(`item-${index}-memory-class-invalid`);
  if (!PRIVACY_CLASSES.has(privacyClass)) errors.push(`item-${index}-privacy-class-invalid`);
  if (!TRUTH_CLASSES.has(truthClass)) errors.push(`item-${index}-truth-class-invalid`);
  if (!Number.isFinite(timestamp.getTime())) errors.push(`item-${index}-observed-at-invalid`);
  if (!title || !summary) errors.push(`item-${index}-title-summary-required`);
  if (!provenanceRefs || provenanceRefs.length === 0) errors.push(`item-${index}-provenance-required`);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) errors.push(`item-${index}-confidence-invalid`);
  if (!Number.isFinite(economicWeight) || economicWeight < 0 || economicWeight > 1) errors.push(`item-${index}-economic-weight-invalid`);
  if (!Number.isFinite(importance) || importance < 0 || importance > 1) errors.push(`item-${index}-importance-invalid`);
  if (memoryClass === 'SYNTHETIC' && truthClass !== 'SYNTHETIC') errors.push(`item-${index}-synthetic-memory-must-remain-synthetic`);
  if (truthClass === 'SYNTHETIC' && memoryClass !== 'SYNTHETIC') errors.push(`item-${index}-synthetic-truth-must-use-synthetic-memory-class`);
  if (errors.length) return { error: errors.join(',') };
  return {
    value: {
      id,
      memoryClass,
      privacyClass,
      truthClass,
      observedAt: timestamp.toISOString(),
      title,
      summary,
      provenanceRefs,
      supersedes,
      confidence,
      economicWeight,
      importance,
      contradictionGroup: text(item.contradictionGroup, 200),
      tags: Array.isArray(item.tags) ? [...new Set(item.tags.map(v => text(v, 120)).filter(Boolean))].slice(0, 64) : []
    }
  };
}
function indexDigest(index) {
  const { integrityDigest, ...body } = index || {};
  return digest(body);
}
function validateIndex(index) {
  if (!index || index.schemaVersion !== 'uberbond-lifetime-memory-index-1.0.0') return ['compiled-memory-index-required'];
  if (!index.integrityDigest || index.integrityDigest !== indexDigest(index)) return ['memory-index-integrity-mismatch'];
  return [];
}
function findSupersessionCycle(items) {
  const graph = new Map(items.map(item => [item.id, item.supersedes]));
  const visiting = new Set();
  const visited = new Set();
  function visit(id) {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const next of graph.get(id) || []) if (visit(next)) return true;
    visiting.delete(id);
    visited.add(id);
    return false;
  }
  for (const id of graph.keys()) if (visit(id)) return true;
  return false;
}

export function compileLifetimeMemoryIndex({ items = [], now = new Date().toISOString() } = {}) {
  if (!Array.isArray(items) || items.length > 10_000) return fail(['bounded-memory-array-required']);
  const timestamp = new Date(now);
  if (!Number.isFinite(timestamp.getTime())) return fail(['valid-now-required']);
  const normalized = [];
  const errors = [];
  const ids = new Set();
  for (let index = 0; index < items.length; index += 1) {
    const result = normalizeMemoryItem(items[index], index);
    if (result.error) { errors.push(...result.error.split(',')); continue; }
    if (ids.has(result.value.id)) { errors.push(`duplicate-id:${result.value.id}`); continue; }
    ids.add(result.value.id);
    normalized.push(result.value);
  }
  if (errors.length) return fail(errors);

  const byId = new Map(normalized.map(item => [item.id, item]));
  const lineageErrors = [];
  for (const item of normalized) {
    for (const prior of item.supersedes) {
      const priorItem = byId.get(prior);
      if (!priorItem) lineageErrors.push(`unknown-superseded-memory:${item.id}:${prior}`);
      if (prior === item.id) lineageErrors.push(`self-supersede-prohibited:${item.id}`);
      if (priorItem && Date.parse(item.observedAt) < Date.parse(priorItem.observedAt)) lineageErrors.push(`stale-memory-cannot-supersede-newer:${item.id}:${prior}`);
    }
  }
  if (findSupersessionCycle(normalized)) lineageErrors.push('supersession-cycle-prohibited');
  if (lineageErrors.length) return fail(lineageErrors);

  const superseded = new Set(normalized.flatMap(item => item.supersedes));
  const contradictions = new Map();
  for (const item of normalized) {
    if (!item.contradictionGroup) continue;
    if (!contradictions.has(item.contradictionGroup)) contradictions.set(item.contradictionGroup, []);
    contradictions.get(item.contradictionGroup).push(item.id);
  }
  const unresolvedContradictions = [...contradictions.entries()]
    .filter(([, idsInGroup]) => idsInGroup.filter(id => !superseded.has(id)).length > 1)
    .map(([group, idsInGroup]) => ({ group, activeIds: idsInGroup.filter(id => !superseded.has(id)) }));

  const body = {
    schemaVersion: 'uberbond-lifetime-memory-index-1.0.0',
    generatedAt: timestamp.toISOString(),
    items: normalized,
    activeItemIds: normalized.filter(item => !superseded.has(item.id)).map(item => item.id),
    supersededItemIds: [...superseded],
    unresolvedContradictions,
    memoryClassCounts: Object.fromEntries([...MEMORY_CLASSES].map(kind => [kind, normalized.filter(item => item.memoryClass === kind).length])),
    businessEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS }
  };
  const index = { ...body, integrityDigest: digest(body) };
  return { ok: true, status: 'LIFETIME_MEMORY_INDEX_COMPILED', index, indexFingerprint: digest(index) };
}

export function compileTaskContextPacket({
  index,
  query,
  maxItems = 24,
  allowedPrivacyClasses = ['PUBLIC', 'INTERNAL'],
  includeSynthetic = false,
  now = new Date().toISOString()
} = {}) {
  const reasons = validateIndex(index);
  const normalizedQuery = text(query, 3000);
  if (!normalizedQuery) reasons.push('query-required');
  if (!Number.isInteger(maxItems) || maxItems < 1 || maxItems > 128) reasons.push('bounded-max-items-required');
  if (!Array.isArray(allowedPrivacyClasses) || allowedPrivacyClasses.some(v => !PRIVACY_CLASSES.has(v))) reasons.push('valid-privacy-classes-required');
  const timestamp = new Date(now);
  if (!Number.isFinite(timestamp.getTime())) reasons.push('valid-now-required');
  if (reasons.length) return fail(reasons);

  const allowed = new Set(allowedPrivacyClasses);
  const active = new Set(index.activeItemIds || []);
  const candidates = index.items
    .filter(item => active.has(item.id))
    .filter(item => allowed.has(item.privacyClass))
    .filter(item => includeSynthetic || item.truthClass !== 'SYNTHETIC')
    .map(item => {
      const lexical = lexicalOverlap(normalizedQuery, `${item.title} ${item.summary} ${item.tags.join(' ')}`);
      const recency = scoreRecency(item.observedAt, timestamp);
      const score = lexical * 0.45 + item.confidence * 0.2 + item.importance * 0.15 + item.economicWeight * 0.1 + recency * 0.1;
      return { item, score, lexical, recency };
    })
    .sort((a, b) => b.score - a.score || b.item.observedAt.localeCompare(a.item.observedAt))
    .slice(0, maxItems);

  const contradictionGroups = new Set(index.unresolvedContradictions?.map(row => row.group) || []);
  const selectedGroups = new Set(candidates.map(row => row.item.contradictionGroup).filter(Boolean));
  const contradictionWarnings = [...selectedGroups].filter(group => contradictionGroups.has(group));

  const packet = {
    schemaVersion: 'uberbond-task-context-packet-1.0.0',
    sourceIndexIntegrityDigest: index.integrityDigest,
    query: normalizedQuery,
    selected: candidates.map(({ item, score }) => ({
      id: item.id,
      memoryClass: item.memoryClass,
      privacyClass: item.privacyClass,
      truthClass: item.truthClass,
      observedAt: item.observedAt,
      title: item.title,
      summary: item.summary,
      provenanceRefs: item.provenanceRefs,
      confidence: item.confidence,
      retrievalScore: Number(score.toFixed(6)),
      contradictionGroup: item.contradictionGroup
    })),
    contradictionWarnings,
    syntheticIncluded: candidates.some(row => row.item.truthClass === 'SYNTHETIC'),
    minimization: {
      sourceItemCount: index.items.length,
      selectedItemCount: candidates.length,
      reductionRatio: index.items.length ? Number((1 - candidates.length / index.items.length).toFixed(6)) : 0
    },
    consequenceAuthority: 'NONE',
    businessEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS }
  };
  return { ok: true, status: 'TASK_CONTEXT_PACKET_COMPILED', packet, packetFingerprint: digest(packet) };
}

export function compileMemoryHealthReceipt({ index, maxContradictions = 0 } = {}) {
  const integrityReasons = validateIndex(index);
  if (integrityReasons.length) return fail(integrityReasons);
  const unresolved = index.unresolvedContradictions?.length || 0;
  const missingProvenance = index.items.filter(item => !Array.isArray(item.provenanceRefs) || item.provenanceRefs.length === 0).map(item => item.id);
  const syntheticObservedConfusion = index.items.filter(item => (item.memoryClass === 'SYNTHETIC') !== (item.truthClass === 'SYNTHETIC')).map(item => item.id);
  const ok = unresolved <= maxContradictions && missingProvenance.length === 0 && syntheticObservedConfusion.length === 0;
  return {
    ok,
    status: ok ? 'LIFETIME_MEMORY_HEALTHY' : 'LIFETIME_MEMORY_REVIEW_REQUIRED',
    sourceIndexIntegrityDigest: index.integrityDigest,
    unresolvedContradictions: unresolved,
    missingProvenance,
    syntheticObservedConfusion,
    activeItems: index.activeItemIds.length,
    supersededItems: index.supersededItemIds.length,
    businessEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS }
  };
}
