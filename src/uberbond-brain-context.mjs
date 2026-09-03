import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const UBERBOND_BRAIN_CONTEXT_POLICY_VERSION = 'uberbond-brain-context-1.1.0';
export const REQUIRED_CANON_PATHS = Object.freeze([
  'UBERBOND_CANON.md',
  'UBERBOND_BOOTSTRAP.json',
  'docs/DISTRIBUTION_OS_CANON.md'
]);
export const MEMORY_V2_REQUIRED_PATHS = Object.freeze([
  'docs/UBERBOND_MASTER_MEMORY.md',
  'artifacts/uberbond-memory-index.json'
]);

const MAX_POINTERS = 160;
const MAX_GOALS = 160;
const MAX_GATES = 160;
// No-amputation memory now carries a much larger named-program lineage than the
// original 160-item prototype allowed. Keep the index bounded and fail-closed,
// but size the bound for the durable project brain rather than truncating history.
const MAX_INITIATIVES = 512;
const MAX_MEMORY_LIST = 256;
const MEMORY_STATUSES = new Set([
  'CURRENT_PROGRAM',
  'CANONICAL_LINEAGE',
  'HISTORICAL_DONOR',
  'HISTORICAL_CAPABILITY_SOURCE',
  'HISTORICAL_GENERATED',
  'SUPERSEDED_BY_CANON',
  'OWNER_RECALLED_UNRESOLVED',
  'REJECTED',
  'ARCHIVED'
]);
const SECRET_KEY = /(?:password|passwd|secret|token|authorization|cookie|credential|api[_-]?key|private[_-]?key|session[_-]?id)/i;
const SECRET_VALUE = /(?:^|\b)(?:sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9]{20,}|bearer\s+[A-Za-z0-9._-]{12,})/i;

function clone(value) { return structuredClone(value); }
function text(value, max = 500) {
  const s = String(value ?? '').trim();
  return s && s.length <= max ? s : null;
}
function iso(value) {
  const s = text(value, 80);
  if (!s) return null;
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}
function digest(value) { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function uniqueStrings(value, limit, max = 300) {
  if (!Array.isArray(value) || value.length > limit) return null;
  const out = [];
  const seen = new Set();
  for (const item of value) {
    const s = text(item, max);
    if (!s) return null;
    if (!seen.has(s)) { seen.add(s); out.push(s); }
  }
  return out;
}
function inspectSecrets(value, path = '$', depth = 0, seen = new WeakSet()) {
  if (depth > 10) return [];
  if (value && typeof value === 'object') {
    if (seen.has(value)) return [];
    seen.add(value);
  }
  const findings = [];
  if (typeof value === 'string' && SECRET_VALUE.test(value)) findings.push(path);
  if (!value || typeof value !== 'object') return findings;
  for (const [key, child] of Object.entries(value)) {
    const next = `${path}.${key}`;
    if (SECRET_KEY.test(key)) findings.push(next);
    findings.push(...inspectSecrets(child, next, depth + 1, seen));
  }
  return [...new Set(findings)].slice(0, 80);
}
function fail(reasonCodes, extra = {}) {
  return {
    ok: false,
    policyVersion: UBERBOND_BRAIN_CONTEXT_POLICY_VERSION,
    status: 'PROJECT_CONTEXT_DENIED',
    reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
    businessEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS },
    ...extra
  };
}
function normalizeFinalGoal(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const result = {
    economicNorthStar: text(value.economicNorthStar, 500),
    endState: text(value.endState, 1600),
    portfolioLaw: text(value.portfolioLaw, 800),
    distributionGoal: text(value.distributionGoal, 1200),
    cloudGoal: text(value.cloudGoal, 1000),
    wealthGoalBoundary: text(value.wealthGoalBoundary, 1000)
  };
  return Object.values(result).every(Boolean) ? result : null;
}
function normalizeInitiatives(value) {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_INITIATIVES) return null;
  const out = [];
  const ids = new Set();
  const names = new Set();
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
    const id = text(item.id, 120);
    const name = text(item.name, 240);
    const status = text(item.status, 80);
    const role = text(item.role, 1600);
    const currentReconciliation = text(item.currentReconciliation, 1600);
    if (!id || !/^[a-z0-9][a-z0-9._-]*$/.test(id) || !name || !status || !MEMORY_STATUSES.has(status) || !role || !currentReconciliation) return null;
    const nameKey = name.toLowerCase();
    if (ids.has(id) || names.has(nameKey)) return null;
    ids.add(id); names.add(nameKey);
    out.push({ id, name, status, role, currentReconciliation });
  }
  return out;
}
function normalizeSourceBasis(value) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 128) return null;
  const ids = new Set();
  const out = [];
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
    const id = text(item.id, 120);
    const title = text(item.title, 500);
    const evidenceClass = text(item.evidenceClass, 120);
    if (!id || !title || !evidenceClass || ids.has(id)) return null;
    ids.add(id);
    out.push({ id, title, evidenceClass });
  }
  return out;
}
function normalizeHistoricalSnapshots(value) {
  if (!Array.isArray(value) || value.length > 32) return null;
  const out = [];
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
    const asOf = text(item.asOf, 40);
    const evidenceClass = text(item.evidenceClass, 120);
    const summary = text(item.summary, 500);
    const warning = text(item.warning, 800);
    if (!asOf || !evidenceClass || !summary || !warning || !item.metrics || typeof item.metrics !== 'object' || Array.isArray(item.metrics)) return null;
    const metrics = {};
    for (const [key, raw] of Object.entries(item.metrics)) {
      if (!/^[A-Za-z][A-Za-z0-9]*$/.test(key) || !Number.isFinite(Number(raw)) || Number(raw) < 0) return null;
      metrics[key] = Number(raw);
    }
    out.push({ asOf, evidenceClass, summary, metrics, warning });
  }
  return out;
}
function normalizeUnresolvedNames(value) {
  if (!Array.isArray(value) || value.length > 128) return null;
  const names = new Set();
  const out = [];
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
    const name = text(item.name, 240);
    const status = text(item.status, 80);
    const requiredAction = text(item.requiredAction, 1000);
    if (!name || status !== 'OWNER_RECALLED_UNRESOLVED' || !requiredAction || names.has(name.toLowerCase())) return null;
    names.add(name.toLowerCase());
    out.push({ name, status, requiredAction });
  }
  return out;
}

export function validateUberBondBootstrap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail(['bootstrap-object-required']);
  const reasonCodes = [];
  const schemaVersion = text(value.schemaVersion, 80);
  if (!['uberbond-bootstrap-1.0.0', 'uberbond-bootstrap-1.1.0'].includes(schemaVersion)) reasonCodes.push('supported-bootstrap-schema-required');
  const project = text(value.project, 120);
  const generatedAt = iso(value.generatedAt);
  const objective = text(value.objective, 1200);
  const truthHierarchy = uniqueStrings(value.truthHierarchy, 32, 200);
  const canonPointers = uniqueStrings(value.canonPointers, MAX_POINTERS, 500);
  const goals = uniqueStrings(value.goals, MAX_GOALS, 1200);
  const architectureSpine = uniqueStrings(value.architectureSpine, 80, 300);
  const capabilityFamilies = uniqueStrings(value.capabilityFamilies, 160, 500);
  const productFamilies = uniqueStrings(value.productFamilies, 160, 500);
  const protectedPaths = uniqueStrings(value.protectedPaths, 80, 500);
  const externalProofGates = uniqueStrings(value.externalProofGates, MAX_GATES, 1200);
  const startupProtocol = uniqueStrings(value.startupProtocol, 80, 1200);
  if (project !== 'UberBond') reasonCodes.push('uberbond-project-required');
  if (!generatedAt) reasonCodes.push('bootstrap-generated-at-required');
  if (!objective) reasonCodes.push('bootstrap-objective-required');
  if (!truthHierarchy?.length) reasonCodes.push('truth-hierarchy-required');
  if (!canonPointers?.length) reasonCodes.push('canon-pointers-required');
  if (!goals?.length) reasonCodes.push('goals-required');
  if (!architectureSpine?.length) reasonCodes.push('architecture-spine-required');
  if (!capabilityFamilies?.length) reasonCodes.push('capability-families-required');
  if (!productFamilies?.length) reasonCodes.push('product-families-required');
  if (!protectedPaths) reasonCodes.push('protected-paths-required');
  if (!externalProofGates?.length) reasonCodes.push('external-proof-gates-required');
  if (!startupProtocol?.length) reasonCodes.push('startup-protocol-required');
  const secrets = inspectSecrets(value);
  if (secrets.length) reasonCodes.push('secret-like-bootstrap-content-prohibited');
  let memoryIndexPath = null;
  let masterMemoryPath = null;
  let continuity = null;
  if (schemaVersion === 'uberbond-bootstrap-1.1.0') {
    memoryIndexPath = text(value.memoryIndexPath, 500);
    masterMemoryPath = text(value.masterMemoryPath, 500);
    const raw = value.continuity;
    if (!memoryIndexPath) reasonCodes.push('memory-index-path-required');
    if (!masterMemoryPath) reasonCodes.push('master-memory-path-required');
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) reasonCodes.push('continuity-object-required');
    else {
      continuity = {
        handoffPath: text(raw.handoffPath, 500),
        startupInstruction: text(raw.startupInstruction, 500),
        updateInstruction: text(raw.updateInstruction, 500),
        chatImportInstruction: text(raw.chatImportInstruction, 1000)
      };
      if (!continuity.handoffPath || !continuity.startupInstruction || !continuity.updateInstruction || !continuity.chatImportInstruction) reasonCodes.push('complete-continuity-instructions-required');
    }
  }
  if (reasonCodes.length) return fail(reasonCodes, { secretPaths: secrets });
  return {
    ok: true,
    policyVersion: UBERBOND_BRAIN_CONTEXT_POLICY_VERSION,
    status: 'BOOTSTRAP_VALID',
    bootstrap: { schemaVersion, project, generatedAt, objective, truthHierarchy, canonPointers, goals, architectureSpine, capabilityFamilies, productFamilies, protectedPaths, externalProofGates, startupProtocol, memoryIndexPath, masterMemoryPath, continuity },
    businessEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS }
  };
}

export function validateUberBondMemoryIndex(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail(['memory-index-object-required']);
  const reasonCodes = [];
  const schemaVersion = text(value.schemaVersion, 80);
  const project = text(value.project, 120);
  const generatedAt = iso(value.generatedAt);
  const purpose = text(value.purpose, 1600);
  const truthRule = text(value.truthRule, 1600);
  const finalGoal = normalizeFinalGoal(value.finalGoal);
  const historicalCorpusSnapshots = normalizeHistoricalSnapshots(value.historicalCorpusSnapshots);
  const namedInitiatives = normalizeInitiatives(value.namedInitiatives);
  const productFamilies = uniqueStrings(value.productFamilies, MAX_MEMORY_LIST, 500);
  const recurringProducts = uniqueStrings(value.recurringProducts, MAX_MEMORY_LIST, 500);
  const longTermPlatforms = uniqueStrings(value.longTermPlatforms, MAX_MEMORY_LIST, 500);
  const singularities = uniqueStrings(value.singularities, MAX_MEMORY_LIST, 500);
  const productProgression = uniqueStrings(value.productProgression, MAX_MEMORY_LIST, 800);
  const distributionMoats = uniqueStrings(value.distributionMoats, MAX_MEMORY_LIST, 800);
  const ownerConstraints = uniqueStrings(value.ownerConstraints, MAX_MEMORY_LIST, 1000);
  const sourceBasis = normalizeSourceBasis(value.sourceBasis);
  const unresolvedNames = normalizeUnresolvedNames(value.unresolvedNames);
  if (schemaVersion !== 'uberbond-memory-index-1.0.0') reasonCodes.push('memory-index-schema-required');
  if (project !== 'UberBond') reasonCodes.push('memory-index-project-required');
  if (!generatedAt) reasonCodes.push('memory-index-generated-at-required');
  if (!purpose) reasonCodes.push('memory-index-purpose-required');
  if (!truthRule) reasonCodes.push('memory-index-truth-rule-required');
  if (!finalGoal) reasonCodes.push('complete-final-goal-required');
  if (!namedInitiatives) reasonCodes.push('bounded-unique-named-initiative-array-required');
  if (!productFamilies || productFamilies.length === 0) reasonCodes.push('memory-product-families-required');
  if (!recurringProducts) reasonCodes.push('bounded-recurring-products-required');
  if (!longTermPlatforms) reasonCodes.push('bounded-long-term-platforms-required');
  if (!singularities) reasonCodes.push('bounded-singularities-required');
  if (!productProgression) reasonCodes.push('bounded-product-progression-required');
  if (!distributionMoats) reasonCodes.push('bounded-distribution-moats-required');
  if (!ownerConstraints) reasonCodes.push('bounded-owner-constraints-required');
  if (!sourceBasis) reasonCodes.push('source-basis-required');
  if (!historicalCorpusSnapshots) reasonCodes.push('historical-corpus-snapshots-required');
  if (!unresolvedNames) reasonCodes.push('unresolved-names-required');
  if (namedInitiatives && unresolvedNames) {
    const unresolved = new Set(unresolvedNames.map(item => item.name.toLowerCase()));
    for (const initiative of namedInitiatives.filter(item => item.status === 'OWNER_RECALLED_UNRESOLVED')) {
      if (!unresolved.has(initiative.name.toLowerCase())) reasonCodes.push('owner-recalled-unresolved-initiative-missing-from-unresolved-names');
    }
  }
  const secrets = inspectSecrets(value);
  if (secrets.length) reasonCodes.push('secret-like-memory-content-prohibited');
  if (reasonCodes.length) return fail(reasonCodes, { secretPaths: secrets });
  const normalized = { schemaVersion, project, generatedAt, purpose, truthRule, finalGoal, historicalCorpusSnapshots, namedInitiatives, productFamilies, recurringProducts, longTermPlatforms, singularities, productProgression, distributionMoats, ownerConstraints, sourceBasis, unresolvedNames };
  return {
    ok: true,
    policyVersion: UBERBOND_BRAIN_CONTEXT_POLICY_VERSION,
    status: 'MEMORY_INDEX_VALID',
    memoryIndex: normalized,
    memoryDigest: digest(normalized),
    businessEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS }
  };
}

export function compileUberBondProjectContext({ bootstrap, memoryIndex, sourceCommit, availablePaths = [], now = new Date() } = {}) {
  const bootstrapResult = validateUberBondBootstrap(bootstrap);
  if (!bootstrapResult.ok) return bootstrapResult;
  const version = bootstrapResult.bootstrap.schemaVersion;
  const memoryResult = version === 'uberbond-bootstrap-1.1.0' ? validateUberBondMemoryIndex(memoryIndex) : null;
  const normalizedMemory = memoryResult?.ok ? memoryResult.memoryIndex : null;
  const reasonCodes = [];
  if (version === 'uberbond-bootstrap-1.1.0' && !normalizedMemory) reasonCodes.push('valid-memory-index-required');
  const required = [...REQUIRED_CANON_PATHS, ...(version === 'uberbond-bootstrap-1.1.0' ? MEMORY_V2_REQUIRED_PATHS : [])];
  const declared = uniqueStrings(availablePaths, MAX_POINTERS, 500) || [];
  const missingPaths = required.filter(item => !declared.includes(item));
  if (missingPaths.length) reasonCodes.push('required-canon-path-missing');
  if (normalizedMemory && JSON.stringify(bootstrapResult.bootstrap.productFamilies) !== JSON.stringify(normalizedMemory.productFamilies)) reasonCodes.push('bootstrap-memory-product-family-mismatch');
  if (reasonCodes.length) return fail(reasonCodes, { missingPaths, memoryReasonCodes: memoryResult?.reasonCodes || [] });
  const compiledAt = iso(now) || new Date().toISOString();
  const baseContext = {
    schemaVersion: version === 'uberbond-bootstrap-1.1.0' ? 'uberbond-project-context-1.1.0' : 'uberbond-project-context-1.0.0',
    policyVersion: UBERBOND_BRAIN_CONTEXT_POLICY_VERSION,
    project: 'UberBond',
    sourceCommit: text(sourceCommit, 120),
    objective: bootstrapResult.bootstrap.objective,
    truthHierarchy: clone(bootstrapResult.bootstrap.truthHierarchy),
    canonPointers: clone(bootstrapResult.bootstrap.canonPointers),
    goals: clone(bootstrapResult.bootstrap.goals),
    architectureSpine: clone(bootstrapResult.bootstrap.architectureSpine),
    capabilityFamilies: clone(bootstrapResult.bootstrap.capabilityFamilies),
    productFamilies: clone(bootstrapResult.bootstrap.productFamilies),
    protectedPaths: clone(bootstrapResult.bootstrap.protectedPaths),
    externalProofGates: clone(bootstrapResult.bootstrap.externalProofGates),
    startupProtocol: clone(bootstrapResult.bootstrap.startupProtocol),
    finalGoal: normalizedMemory ? clone(normalizedMemory.finalGoal) : null,
    namedInitiatives: normalizedMemory ? clone(normalizedMemory.namedInitiatives) : [],
    recurringProducts: normalizedMemory ? clone(normalizedMemory.recurringProducts) : [],
    longTermPlatforms: normalizedMemory ? clone(normalizedMemory.longTermPlatforms) : [],
    singularities: normalizedMemory ? clone(normalizedMemory.singularities) : [],
    productProgression: normalizedMemory ? clone(normalizedMemory.productProgression) : [],
    distributionMoats: normalizedMemory ? clone(normalizedMemory.distributionMoats) : [],
    ownerConstraints: normalizedMemory ? clone(normalizedMemory.ownerConstraints) : [],
    sourceBasis: normalizedMemory ? clone(normalizedMemory.sourceBasis) : [],
    historicalCorpusSnapshots: normalizedMemory ? clone(normalizedMemory.historicalCorpusSnapshots) : [],
    unresolvedNames: normalizedMemory ? clone(normalizedMemory.unresolvedNames) : [],
    memoryDigest: memoryResult?.memoryDigest || null,
    externalTruthLaw: 'PREPARED_PROSPECT_SENT_DELIVERED_PAYMENT_LINK_SANDBOX_OR_SILENCE_CANNOT_SYNTHESIZE_CUSTOMER_CLEARED_PAYMENT_ACCEPTED_DELIVERY_RETENTION_OR_PROVIDER_READINESS',
    businessEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS }
  };
  const contextDigest = digest(baseContext);
  return { ok: true, policyVersion: UBERBOND_BRAIN_CONTEXT_POLICY_VERSION, status: 'PROJECT_CONTEXT_READY', compiledAt, context: { ...baseContext, contextDigest }, externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS } };
}

export function compileUberBondHandoff({ projectContext, activeMission, completed = [], blockers = [], nextActions = [] } = {}) {
  if (!projectContext || !projectContext.contextDigest || !projectContext.sourceCommit) return fail(['valid-project-context-required']);
  const active = text(activeMission, 1600);
  const done = uniqueStrings(completed, 80, 1200);
  const blocked = uniqueStrings(blockers, 80, 1200);
  const next = uniqueStrings(nextActions, 80, 1200);
  if (!active) return fail(['active-mission-required']);
  if (!done || !blocked || !next) return fail(['bounded-handoff-arrays-required']);
  const handoff = {
    schemaVersion: 'uberbond-durable-handoff-1.1.0',
    project: 'UberBond',
    sourceCommit: projectContext.sourceCommit,
    contextDigest: projectContext.contextDigest,
    memoryDigest: projectContext.memoryDigest || null,
    activeMission: active,
    completed: done,
    blockers: blocked,
    nextActions: next,
    unresolvedNames: clone(projectContext.unresolvedNames || []),
    finalGoal: clone(projectContext.finalGoal || null),
    externalProofGates: clone(projectContext.externalProofGates || []),
    businessEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS }
  };
  return { ok: true, policyVersion: UBERBOND_BRAIN_CONTEXT_POLICY_VERSION, status: 'DURABLE_HANDOFF_READY', handoff: { ...handoff, handoffDigest: digest(handoff) }, externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS } };
}
