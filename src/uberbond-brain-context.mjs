import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const UBERBOND_BRAIN_CONTEXT_POLICY_VERSION = 'uberbond-brain-context-1.0.0';
export const REQUIRED_CANON_PATHS = Object.freeze([
  'UBERBOND_CANON.md',
  'UBERBOND_BOOTSTRAP.json',
  'docs/DISTRIBUTION_OS_CANON.md'
]);

const MAX_POINTERS = 128;
const MAX_GOALS = 128;
const MAX_GATES = 128;
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
  if (depth > 8) return [];
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
  return [...new Set(findings)].slice(0, 40);
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
  const startupProtocol = uniqueStrings(bootstrap.startupProtocol, 32, 500);
  const truthHierarchy = uniqueStrings(bootstrap.truthHierarchy, 32, 300);
  const productFamilies = uniqueStrings(bootstrap.productFamilies || [], 64, 240);
  const reasonCodes = [];
  if (schemaVersion !== 'uberbond-bootstrap-1.0.0') reasonCodes.push('unsupported-bootstrap-schema');
  if (project !== 'UberBond') reasonCodes.push('project-must-be-uberbond');
  if (!objective) reasonCodes.push('objective-required');
  if (!generatedAt) reasonCodes.push('generated-at-required');
  if (!canonPointers) reasonCodes.push('bounded-canon-pointer-array-required');
  if (!goals) reasonCodes.push('bounded-goal-array-required');
  if (!externalProofGates) reasonCodes.push('bounded-external-proof-gate-array-required');
  if (!startupProtocol || startupProtocol.length === 0) reasonCodes.push('startup-protocol-required');
  if (!truthHierarchy || truthHierarchy.length === 0) reasonCodes.push('truth-hierarchy-required');
  if (!productFamilies) reasonCodes.push('bounded-product-family-array-required');
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
    continuity: bootstrap.continuity && typeof bootstrap.continuity === 'object'
      ? {
          handoffPath: text(bootstrap.continuity.handoffPath, 240),
          startupInstruction: text(bootstrap.continuity.startupInstruction, 500),
          updateInstruction: text(bootstrap.continuity.updateInstruction, 500)
        }
      : null
  };
  if (!normalized.continuity?.handoffPath || !normalized.continuity?.startupInstruction || !normalized.continuity?.updateInstruction) {
    reasonCodes.push('continuity-contract-required');
  }
  return reasonCodes.length
    ? fail(reasonCodes, { prohibitedSecretPaths: secrets, bootstrap: normalized })
    : { ok: true, policyVersion: UBERBOND_BRAIN_CONTEXT_POLICY_VERSION, bootstrap: normalized };
}

export function compileUberBondProjectContext({ bootstrap, sourceCommit, availablePaths = [], now = new Date() } = {}) {
  const validated = validateUberBondBootstrap(bootstrap);
  if (!validated.ok) return validated;
  const commit = text(sourceCommit, 64);
  const timestamp = iso(now);
  if (!commit || !/^[a-f0-9]{7,64}$/i.test(commit)) return fail(['valid-source-commit-required']);
  if (!timestamp) return fail(['valid-now-required']);
  if (!Array.isArray(availablePaths) || availablePaths.length > 5000) return fail(['bounded-available-paths-array-required']);
  const pathSet = new Set(availablePaths.map(path => String(path || '').trim()).filter(Boolean));
  const required = [...new Set([...REQUIRED_CANON_PATHS, ...validated.bootstrap.canonPointers])];
  const missing = required.filter(path => !pathSet.has(path));
  if (missing.length) return fail(['required-canon-path-missing'], { missingPaths: missing });

  const context = {
    schemaVersion: 'uberbond-project-context-1.0.0',
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
    continuityLaw: 'REPOSITORY_CANON_OUTRANKS_CHAT_MEMORY_AND_EVERY_MATERIAL_SESSION_MUST_LEAVE_A_DURABLE_HANDOFF',
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
    schemaVersion: 'uberbond-handoff-1.0.0',
    sourceCommit: projectContext.sourceCommit,
    contextDigest: projectContext.contextDigest,
    activeMission: mission,
    completed: done,
    blockers: blocked,
    nextActions: next,
    externalProofGates: clone(projectContext.externalProofGates),
    truthLaw: projectContext.externalTruthLaw,
    businessEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS }
  };
  handoff.handoffDigest = digest(handoff);
  return { ok: true, policyVersion: UBERBOND_BRAIN_CONTEXT_POLICY_VERSION, status: 'DURABLE_HANDOFF_READY', handoff };
}
