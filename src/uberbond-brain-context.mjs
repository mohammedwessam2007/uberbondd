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

export function validateUberBondMemoryIndex(memoryIndex = {}) {
  if (!memoryIndex || typeof memoryIndex !== 'object' || Array.isArray(memoryIndex)) {
    return fail(['memory-index-object-required']);
  }
  const schemaVersion = text(memoryIndex.schemaVersion, 80);
  const project = text(memoryIndex.project, 80);
  const generatedAt = iso(memoryIndex.generatedAt);
  const purpose = text(memoryIndex.purpose, 1200);
  const truthRule = text(memoryIndex.truthRule, 1600);
  const finalGoal = normalizeFinalGoal(memoryIndex.finalGoal);
  const namedInitiatives = normalizeInitiatives(memoryIndex.namedInitiatives);
  const productFamilies = uniqueStrings(memoryIndex.productFamilies, 64, 240);
  const recurringProducts = uniqueStrings(memoryIndex.recurringProducts, 128, 240);
  const longTermPlatforms = uniqueStrings(memoryIndex.longTermPlatforms, 64, 300);
  const partnerGatedOfferLineage = uniqueStrings(memoryIndex.partnerGatedOfferLineage || [], 128, 300);
  const strategicStages = uniqueStrings(memoryIndex.strategicStages, 128, 500);
  const sharedOperatingSystemDomains = uniqueStrings(memoryIndex.sharedOperatingSystemDomains, MAX_MEMORY_LIST, 700);
  const antiForgettingRules = uniqueStrings(memoryIndex.antiForgettingRules, 128, 1000);
  const sourceBasis = normalizeSourceBasis(memoryIndex.sourceBasis);
  const historicalCorpusSnapshots = normalizeHistoricalSnapshots(memoryIndex.historicalCorpusSnapshots || []);
  const unresolvedNames = normalizeUnresolvedNames(memoryIndex.unresolvedNames || []);
  const reasonCodes = [];
  if (schemaVersion !== 'uberbond-memory-index-1.0.0') reasonCodes.push('unsupported-memory-index-schema');
  if (project !== 'UberBond') reasonCodes.push('memory-index-project-must-be-uberbond');
  if (!generatedAt) reasonCodes.push('memory-index-generated-at-required');
  if (!purpose) reasonCodes.push('memory-index-purpose-required');
  if (!truthRule) reasonCodes.push('memory-index-truth-rule-required');
  if (!finalGoal) reasonCodes.push('complete-final-goal-required');
  if (!namedInitiatives) reasonCodes.push('bounded-unique-named-initiative-array-required');
  if (!productFamilies || productFamilies.length === 0) reasonCodes.push('memory-product-families-required');
  if (!recurringProducts) reasonCodes.push('bounded-recurring-products-required');
  if (!longTermPlatforms) reasonCodes.push('bounded-long-term-platforms-required');
  if (!partnerGatedOfferLineage) reasonCodes.push('bounded-partner-gated-offers-required');
  if (!strategicStages || strategicStages.length === 0) reasonCodes.push('strategic-stages-required');
  if (!sharedOperatingSystemDomains || sharedOperatingSystemDomains.length === 0) reasonCodes.push('shared-operating-system-domains-required');
  if (!antiForgettingRules || antiForgettingRules.length === 0) reasonCodes.push('anti-forgetting-rules-required');
  if (!sourceBasis) reasonCodes.push('source-basis-required');
  if (!historicalCorpusSnapshots) reasonCodes.push('bounded-historical-corpus-snapshots-required');
  if (!unresolvedNames) reasonCodes.push('bounded-unresolved-name-array-required');
  const secrets = inspectSecrets(memoryIndex);
  if (secrets.length) reasonCodes.push('secret-like-memory-content-prohibited');

  const normalized = {
    schemaVersion,
    project,
    generatedAt,
    purpose,
    truthRule,
    finalGoal,
    historicalCorpusSnapshots: historicalCorpusSnapshots || [],
    namedInitiatives: namedInitiatives || [],
    productFamilies: productFamilies || [],
    recurringProducts: recurringProducts || [],
    longTermPlatforms: longTermPlatforms || [],
    partnerGatedOfferLineage: partnerGatedOfferLineage || [],
    strategicStages: strategicStages || [],
    sharedOperatingSystemDomains: sharedOperatingSystemDomains || [],
    antiForgettingRules: antiForgettingRules || [],
    sourceBasis: sourceBasis || [],
    unresolvedNames: unresolvedNames || []
  };

  if (namedInitiatives && unresolvedNames) {
    const unresolvedInitiatives = new Set(namedInitiatives.filter(item => item.status === 'OWNER_RECALLED_UNRESOLVED').map(item => item.name.toLowerCase()));
    const unresolvedIndex = new Set(unresolvedNames.map(item => item.name.toLowerCase()));
    const missing = [...unresolvedInitiatives].filter(name => !unresolvedIndex.has(name));
    const orphaned = [...unresolvedIndex].filter(name => !unresolvedInitiatives.has(name));
    if (missing.length) reasonCodes.push('owner-recalled-unresolved-initiative-missing-from-unresolved-names');
    if (orphaned.length) reasonCodes.push('unresolved-name-missing-owner-recalled-initiative');
  }

  if (reasonCodes.length) {
    return fail(reasonCodes, { prohibitedSecretPaths: secrets, memoryIndex: normalized });
  }
  const identity = clone(normalized);
  const memoryDigest = digest(identity);
  return {
    ok: true,
    policyVersion: UBERBOND_BRAIN_CONTEXT_POLICY_VERSION,
    status: 'PROJECT_MEMORY_READY',
    memoryIndex: normalized,
    memoryDigest,
    businessEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS }
  };
}

export function validateUberBondBootstrap(bootstrap = {}) {
  if (!bootstrap || typeof bootstrap !== 'object' || Array.isArray(bootstrap)) {
    return fail(['bootstrap-object-required']);
  }
  const schemaVersion = text(bootstrap.schemaVersion, 80);
  const project = text(bootstrap.project, 80);
  const objective = text(bootstrap.objective, 1000);
  const generatedAt = iso(bootstrap.generatedAt);
  const canonPointers = uniqueStrings(bootstrap.canonPointers, MAX_POINTERS, 240);
  const goals = uniqueStrings(bootstrap.goals, MAX_GOALS, 500);
  const externalProofGates = uniqueStrings(bootstrap.externalProofGates, MAX_GATES, 500);
  const startupProtocol = uniqueStrings(bootstrap.startupProtocol, 40, 500);
  const truthHierarchy = uniqueStrings(bootstrap.truthHierarchy, 32, 300);
  const productFamilies = uniqueStrings(bootstrap.productFamilies || [], 64, 240);
  const memoryIndexPath = bootstrap.memoryIndexPath == null ? null : text(bootstrap.memoryIndexPath, 240);
  const masterMemoryPath = bootstrap.masterMemoryPath == null ? null : text(bootstrap.masterMemoryPath, 240);
  const reasonCodes = [];
  if (!['uberbond-bootstrap-1.0.0', 'uberbond-bootstrap-1.1.0'].includes(schemaVersion)) reasonCodes.push('unsupported-bootstrap-schema');
  if (project !== 'UberBond') reasonCodes.push('project-must-be-uberbond');
  if (!objective) reasonCodes.push('objective-required');
  if (!generatedAt) reasonCodes.push('generated-at-required');
  if (!canonPointers) reasonCodes.push('bounded-canon-pointer-array-required');
  if (!goals) reasonCodes.push('bounded-goal-array-required');
  if (!externalProofGates) reasonCodes.push('bounded-external-proof-gate-array-required');
  if (!startupProtocol || startupProtocol.length === 0) reasonCodes.push('startup-protocol-required');
  if (!truthHierarchy || truthHierarchy.length === 0) reasonCodes.push('truth-hierarchy-required');
  if (!productFamilies) reasonCodes.push('bounded-product-family-array-required');
  if (schemaVersion === 'uberbond-bootstrap-1.1.0') {
    if (memoryIndexPath !== 'artifacts/uberbond-memory-index.json') reasonCodes.push('canonical-memory-index-path-required');
    if (masterMemoryPath !== 'docs/UBERBOND_MASTER_MEMORY.md') reasonCodes.push('canonical-master-memory-path-required');
    if (!canonPointers?.includes(memoryIndexPath)) reasonCodes.push('memory-index-must-be-canon-pointer');
    if (!canonPointers?.includes(masterMemoryPath)) reasonCodes.push('master-memory-must-be-canon-pointer');
  }
  const secrets = inspectSecrets(bootstrap);
  if (secrets.length) reasonCodes.push('secret-like-bootstrap-content-prohibited');
  const normalized = {
    schemaVersion,
    project,
    objective,
    generatedAt,
    canonPointers: canonPointers || [],
    goals: goals || [],
    externalProofGates: externalProofGates || [],
    startupProtocol: startupProtocol || [],
    truthHierarchy: truthHierarchy || [],
    architectureSpine: uniqueStrings(bootstrap.architectureSpine || [], 64, 300) || [],
    capabilityFamilies: uniqueStrings(bootstrap.capabilityFamilies || [], 128, 240) || [],
    productFamilies: productFamilies || [],
    protectedPaths: uniqueStrings(bootstrap.protectedPaths || [], 64, 240) || [],
    memoryIndexPath,
    masterMemoryPath,
    continuity: bootstrap.continuity && typeof bootstrap.continuity === 'object'
      ? {
          handoffPath: text(bootstrap.continuity.handoffPath, 240),
          startupInstruction: text(bootstrap.continuity.startupInstruction, 500),
          updateInstruction: text(bootstrap.continuity.updateInstruction, 500),
          chatImportInstruction: bootstrap.continuity.chatImportInstruction == null ? null : text(bootstrap.continuity.chatImportInstruction, 800)
        }
      : null
  };
  if (!normalized.continuity?.handoffPath || !normalized.continuity?.startupInstruction || !normalized.continuity?.updateInstruction) {
    reasonCodes.push('continuity-contract-required');
  }
  if (schemaVersion === 'uberbond-bootstrap-1.1.0' && !normalized.continuity?.chatImportInstruction) {
    reasonCodes.push('chat-import-instruction-required');
  }
  return reasonCodes.length
    ? fail(reasonCodes, { prohibitedSecretPaths: secrets, bootstrap: normalized })
    : { ok: true, policyVersion: UBERBOND_BRAIN_CONTEXT_POLICY_VERSION, bootstrap: normalized };
}

export function compileUberBondProjectContext({ bootstrap, memoryIndex = null, sourceCommit, availablePaths = [], now = new Date() } = {}) {
  const validated = validateUberBondBootstrap(bootstrap);
  if (!validated.ok) return validated;
  const commit = text(sourceCommit, 64);
  const timestamp = iso(now);
  if (!commit || !/^[a-f0-9]{7,64}$/i.test(commit)) return fail(['valid-source-commit-required']);
  if (!timestamp) return fail(['valid-now-required']);
  if (!Array.isArray(availablePaths) || availablePaths.length > 5000) return fail(['bounded-available-paths-array-required']);
  const pathSet = new Set(availablePaths.map(path => String(path || '').trim()).filter(Boolean));
  const required = [...new Set([
    ...REQUIRED_CANON_PATHS,
    ...(validated.bootstrap.schemaVersion === 'uberbond-bootstrap-1.1.0' ? MEMORY_V2_REQUIRED_PATHS : []),
    ...validated.bootstrap.canonPointers
  ])];
  const missing = required.filter(path => !pathSet.has(path));
  if (missing.length) return fail(['required-canon-path-missing'], { missingPaths: missing });

  let memory = null;
  if (validated.bootstrap.schemaVersion === 'uberbond-bootstrap-1.1.0') {
    const checkedMemory = validateUberBondMemoryIndex(memoryIndex);
    if (!checkedMemory.ok) return fail(['valid-memory-index-required', ...checkedMemory.reasonCodes], { memoryValidation: checkedMemory });
    if (JSON.stringify(checkedMemory.memoryIndex.productFamilies) !== JSON.stringify(validated.bootstrap.productFamilies)) {
      return fail(['bootstrap-memory-product-family-mismatch']);
    }
    memory = checkedMemory;
  } else if (memoryIndex != null) {
    const checkedMemory = validateUberBondMemoryIndex(memoryIndex);
    if (!checkedMemory.ok) return checkedMemory;
    memory = checkedMemory;
  }

  const context = {
    schemaVersion: memory ? 'uberbond-project-context-1.1.0' : 'uberbond-project-context-1.0.0',
    project: 'UberBond',
    sourceCommit: commit.toLowerCase(),
    compiledAt: timestamp,
    objective: validated.bootstrap.objective,
    truthHierarchy: clone(validated.bootstrap.truthHierarchy),
    goals: clone(validated.bootstrap.goals),
    architectureSpine: clone(validated.bootstrap.architectureSpine),
    capabilityFamilies: clone(validated.bootstrap.capabilityFamilies),
    productFamilies: clone(validated.bootstrap.productFamilies),
    canonPointers: clone(validated.bootstrap.canonPointers),
    protectedPaths: clone(validated.bootstrap.protectedPaths),
    externalProofGates: clone(validated.bootstrap.externalProofGates),
    continuity: clone(validated.bootstrap.continuity),
    memoryDigest: memory?.memoryDigest || null,
    finalGoal: memory ? clone(memory.memoryIndex.finalGoal) : null,
    namedInitiatives: memory ? clone(memory.memoryIndex.namedInitiatives) : [],
    historicalCorpusSnapshots: memory ? clone(memory.memoryIndex.historicalCorpusSnapshots) : [],
    recurringProducts: memory ? clone(memory.memoryIndex.recurringProducts) : [],
    longTermPlatforms: memory ? clone(memory.memoryIndex.longTermPlatforms) : [],
    partnerGatedOfferLineage: memory ? clone(memory.memoryIndex.partnerGatedOfferLineage) : [],
    strategicStages: memory ? clone(memory.memoryIndex.strategicStages) : [],
    sharedOperatingSystemDomains: memory ? clone(memory.memoryIndex.sharedOperatingSystemDomains) : [],
    antiForgettingRules: memory ? clone(memory.memoryIndex.antiForgettingRules) : [],
    unresolvedNames: memory ? clone(memory.memoryIndex.unresolvedNames) : [],
    continuityLaw: 'REPOSITORY_CANON_OUTRANKS_CHAT_MEMORY_AND_EVERY_MATERIAL_SESSION_MUST_LEAVE_A_DURABLE_HANDOFF',
    memoryLaw: 'HISTORICAL_MEMORY_PREVENTS_FORGETTING_BUT_NEVER_PROMOTES_ITSELF_ABOVE_CURRENT_CODE_RECEIPTS_OR_EXTERNAL_TRUTH',
    externalTruthLaw: 'INTERNAL_CODE_MODEL_OR_DOCUMENT_OUTPUT_CANNOT_SYNTHESIZE_CUSTOMER_PAYMENT_ACCEPTANCE_LEGAL_PROVIDER_OR_MARKET_TRUTH',
    businessEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS }
  };
  const identity = { ...context };
  delete identity.compiledAt;
  context.contextDigest = digest(identity);
  return {
    ok: true,
    policyVersion: UBERBOND_BRAIN_CONTEXT_POLICY_VERSION,
    status: 'PROJECT_CONTEXT_READY',
    context,
    startupProtocol: clone(validated.bootstrap.startupProtocol),
    businessEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS }
  };
}

export function compileUberBondHandoff({ projectContext, activeMission, completed = [], blockers = [], nextActions = [] } = {}) {
  if (!projectContext?.contextDigest || projectContext.project !== 'UberBond') return fail(['valid-project-context-required']);
  const mission = text(activeMission, 1000);
  const done = uniqueStrings(completed, 100, 500);
  const blocked = uniqueStrings(blockers, 100, 500);
  const next = uniqueStrings(nextActions, 100, 500);
  if (!mission) return fail(['active-mission-required']);
  if (!done || !blocked || !next) return fail(['bounded-handoff-arrays-required']);
  const handoff = {
    schemaVersion: projectContext.memoryDigest ? 'uberbond-handoff-1.1.0' : 'uberbond-handoff-1.0.0',
    sourceCommit: projectContext.sourceCommit,
    contextDigest: projectContext.contextDigest,
    memoryDigest: projectContext.memoryDigest || null,
    activeMission: mission,
    completed: done,
    blockers: blocked,
    nextActions: next,
    unresolvedNames: clone(projectContext.unresolvedNames || []),
    externalProofGates: clone(projectContext.externalProofGates),
    truthLaw: projectContext.externalTruthLaw,
    businessEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS }
  };
  handoff.handoffDigest = digest(handoff);
  return { ok: true, policyVersion: UBERBOND_BRAIN_CONTEXT_POLICY_VERSION, status: 'DURABLE_HANDOFF_READY', handoff };
}
