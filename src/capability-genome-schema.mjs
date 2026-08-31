import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const CAPABILITY_GENOME_SCHEMA_VERSION = 'uberbond.capability-genome.capability.v1';

export const CAPABILITY_SOURCE_TYPES = Object.freeze([
  'SKILL', 'MCP_SERVER', 'CLI', 'LIBRARY', 'SDK', 'API', 'PLUGIN',
  'AGENT', 'FRAMEWORK_PRIMITIVE', 'DOCKER_SERVICE', 'BROWSER_TOOL',
  'WORKFLOW', 'GITHUB_ACTION', 'RUNTIME', 'HOSTED_SERVICE', 'NATIVE'
]);

export const CAPABILITY_PROMOTION_STATES = Object.freeze([
  'DISCOVERED', 'NORMALIZED', 'DEDUPED', 'SECURITY_REVIEWED', 'ELIGIBLE',
  'SANDBOXED', 'BENCHMARKED', 'APPROVED', 'ACTIVE', 'DEGRADED',
  'REPLACED', 'REVOKED', 'ARCHIVED'
]);

export const CAPABILITY_SIDE_EFFECT_CLASSES = Object.freeze([
  'NONE', 'READ_ONLY_NETWORK', 'LOCAL_WRITE', 'EXTERNAL_WRITE', 'MESSAGE',
  'DEPLOYMENT', 'PRODUCTION_MUTATION', 'MONEY_MOVEMENT', 'SECURITY_TEST'
]);

export const CAPABILITY_DATA_CLASSES = Object.freeze([
  'PUBLIC', 'INTERNAL_NON_SECRET', 'SOURCE_CODE', 'PRIVATE_CUSTOMER',
  'CREDENTIAL', 'PAYMENT_RAW'
]);

const ID = /^[a-z0-9][a-z0-9._:/-]{1,199}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const REVISION = /^[A-Za-z0-9._:/@+-]{1,240}$/;
const SENSITIVE_KEY = /^(?:password|passwd|secret|token|authorization|cookie|credential|api[_-]?key|private[_-]?key|access[_-]?token)$/i;
const SENSITIVE_VALUE = /(?:sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9]{20,}|bearer\s+[A-Za-z0-9._-]{12,})/i;

function clone(value) { return structuredClone(value); }
function digest(value) { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function text(value, max = 1000) {
  const result = String(value ?? '').trim();
  return result && result.length <= max ? result : null;
}
function list(value, max = 256, itemMax = 500) {
  if (!Array.isArray(value) || value.length > max) return null;
  const output = [];
  const seen = new Set();
  for (const item of value) {
    const normalized = text(item, itemMax);
    if (!normalized) return null;
    if (!seen.has(normalized)) { seen.add(normalized); output.push(normalized); }
  }
  return output;
}
function number(value, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const normalized = Number(value);
  return Number.isFinite(normalized) && normalized >= min && normalized <= max ? normalized : null;
}
function iso(value) {
  const normalized = text(value, 80);
  const date = normalized ? new Date(normalized) : null;
  return date && Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? clone(value) : null;
}
function sensitivePaths(value, path = '$', depth = 0) {
  if (depth > 12 || value == null) return [];
  if (typeof value === 'string') return SENSITIVE_VALUE.test(value) ? [path] : [];
  if (typeof value !== 'object') return [];
  const findings = [];
  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`;
    if (SENSITIVE_KEY.test(key)) findings.push(childPath);
    findings.push(...sensitivePaths(child, childPath, depth + 1));
  }
  return [...new Set(findings)].slice(0, 100);
}
function fail(reasonCodes, extra = {}) {
  return {
    ok: false,
    schemaVersion: CAPABILITY_GENOME_SCHEMA_VERSION,
    status: 'CAPABILITY_INVALID',
    reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
    businessEffectAuthority: 'NONE',
    externalEffectLedger: clone(ZERO_EXTERNAL_EFFECTS),
    ...extra
  };
}

export function normalizeCapabilityAtom(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return fail(['atom-object-required']);
  const id = text(input.id, 200)?.toLowerCase();
  const verb = text(input.verb, 80)?.toLowerCase();
  const noun = text(input.noun, 120)?.toLowerCase();
  const description = text(input.description, 1000);
  const inputs = list(input.inputs || [], 64, 160);
  const outputs = list(input.outputs || [], 64, 160);
  const sideEffectClass = text(input.sideEffectClass || 'NONE', 80)?.toUpperCase();
  const reasonCodes = [];
  if (!id || !ID.test(id)) reasonCodes.push('valid-atom-id-required');
  if (!verb || !/^[a-z][a-z0-9-]{1,79}$/.test(verb)) reasonCodes.push('valid-atom-verb-required');
  if (!noun || !/^[a-z][a-z0-9-]{1,119}$/.test(noun)) reasonCodes.push('valid-atom-noun-required');
  if (!description) reasonCodes.push('atom-description-required');
  if (!inputs || !outputs) reasonCodes.push('bounded-atom-io-required');
  if (!CAPABILITY_SIDE_EFFECT_CLASSES.includes(sideEffectClass)) reasonCodes.push('recognized-side-effect-class-required');
  if (reasonCodes.length) return fail(reasonCodes);
  return { ok: true, atom: { id, verb, noun, description, inputs, outputs, sideEffectClass } };
}

function normalizeEvidence(value) {
  if (!Array.isArray(value) || value.length > 256) return null;
  const output = [];
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
    const type = text(item.type, 80)?.toUpperCase();
    const ref = text(item.ref, 1000);
    const observedAt = iso(item.observedAt);
    const digestValue = item.digest == null ? null : text(item.digest, 64)?.toLowerCase();
    if (!type || !ref || !observedAt || (digestValue && !SHA256.test(digestValue))) return null;
    output.push({ type, ref, observedAt, digest: digestValue, claimClass: text(item.claimClass || 'SOURCE_EVIDENCE', 80) });
  }
  return output;
}

export function normalizeCapability(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return fail(['capability-object-required']);
  const reasonCodes = [];
  const id = text(input.id, 200)?.toLowerCase();
  const canonicalIdentity = text(input.canonicalIdentity, 240)?.toLowerCase();
  const aliases = list(input.aliases || [], 128, 240);
  const source = object(input.source);
  const sourceType = text(input.sourceType, 80)?.toUpperCase();
  const sourceRevision = text(input.sourceRevision, 240);
  const sourceHash = text(input.sourceHash, 64)?.toLowerCase();
  const maintainer = object(input.maintainer);
  const license = text(input.license || 'UNKNOWN', 120)?.toUpperCase();
  const licenseConfidence = number(input.licenseConfidence, { min: 0, max: 1 });
  const taskClasses = list(input.taskClasses || [], 128, 160);
  const inputs = list(input.inputs || [], 128, 160);
  const outputs = list(input.outputs || [], 128, 160);
  const sideEffects = list(input.sideEffects || ['NONE'], 32, 80)?.map(item => item.toUpperCase());
  const dataClasses = list(input.dataClasses || ['PUBLIC'], 32, 80)?.map(item => item.toUpperCase());
  const permissions = list(input.permissions || [], 128, 200);
  const credentialRequirements = list(input.credentialRequirements || [], 64, 200);
  const networkRequirements = list(input.networkRequirements || [], 64, 300);
  const dependencies = list(input.dependencies || [], 256, 240);
  const supportedAgents = list(input.supportedAgents || [], 64, 160);
  const supportedModels = list(input.supportedModels || [], 128, 160);
  const supportedProviders = list(input.supportedProviders || [], 128, 160);
  const knownVulnerabilities = list(input.knownVulnerabilities || [], 256, 500);
  const knownConflicts = list(input.knownConflicts || [], 256, 240);
  const compatibilityEdges = Array.isArray(input.compatibilityEdges) ? clone(input.compatibilityEdges) : null;
  const substitutes = list(input.substitutes || [], 256, 240);
  const evidencePointers = normalizeEvidence(input.evidencePointers || []);
  const atoms = [];
  if (!Array.isArray(input.capabilityAtoms) || input.capabilityAtoms.length > 256) reasonCodes.push('bounded-capability-atoms-required');
  else for (const raw of input.capabilityAtoms) {
    const result = normalizeCapabilityAtom(raw);
    if (!result.ok) reasonCodes.push(...result.reasonCodes.map(code => `atom:${code}`));
    else atoms.push(result.atom);
  }
  if (!id || !ID.test(id)) reasonCodes.push('valid-capability-id-required');
  if (!canonicalIdentity || !ID.test(canonicalIdentity)) reasonCodes.push('valid-canonical-identity-required');
  if (!aliases) reasonCodes.push('bounded-aliases-required');
  if (!source || !text(source.url, 1000)) reasonCodes.push('source-url-required');
  if (!CAPABILITY_SOURCE_TYPES.includes(sourceType)) reasonCodes.push('recognized-source-type-required');
  if (!sourceRevision || !REVISION.test(sourceRevision)) reasonCodes.push('immutable-or-explicit-source-revision-required');
  if (!sourceHash || !SHA256.test(sourceHash)) reasonCodes.push('sha256-source-hash-required');
  if (!maintainer || !text(maintainer.name, 300)) reasonCodes.push('maintainer-required');
  if (!license || licenseConfidence == null) reasonCodes.push('license-and-confidence-required');
  if (!taskClasses || !inputs || !outputs || !sideEffects || !dataClasses || !permissions || !credentialRequirements || !networkRequirements || !dependencies || !supportedAgents || !supportedModels || !supportedProviders || !knownVulnerabilities || !knownConflicts || !compatibilityEdges || !substitutes || !evidencePointers) reasonCodes.push('bounded-typed-capability-fields-required');
  if (sideEffects?.some(item => !CAPABILITY_SIDE_EFFECT_CLASSES.includes(item))) reasonCodes.push('unknown-side-effect-class');
  if (dataClasses?.some(item => !CAPABILITY_DATA_CLASSES.includes(item))) reasonCodes.push('unknown-data-class');
  const promotionState = text(input.promotionState || 'DISCOVERED', 80)?.toUpperCase();
  if (!CAPABILITY_PROMOTION_STATES.includes(promotionState)) reasonCodes.push('recognized-promotion-state-required');
  const lastEvaluatedAt = iso(input.lastEvaluatedAt);
  if (!lastEvaluatedAt) reasonCodes.push('last-evaluated-at-required');
  const secretFindings = sensitivePaths(input);
  if (secretFindings.length) reasonCodes.push('secret-material-prohibited');
  if (reasonCodes.length) return fail(reasonCodes, { prohibitedSecretPaths: secretFindings });
  const normalized = {
    schemaVersion: CAPABILITY_GENOME_SCHEMA_VERSION,
    id, canonicalIdentity, aliases, source, sourceType, sourceRevision, sourceHash,
    maintainer, license, licenseConfidence, capabilityAtoms: atoms, taskClasses, inputs,
    outputs, sideEffects, dataClasses, permissions, credentialRequirements,
    networkRequirements, dependencies, executionEnvironment: object(input.executionEnvironment) || {},
    supportedAgents, supportedModels, supportedProviders,
    contextCost: object(input.contextCost) || { status: 'UNKNOWN' },
    tokenCost: object(input.tokenCost) || { status: 'UNKNOWN' },
    monetaryCost: object(input.monetaryCost) || { status: 'UNKNOWN' },
    latency: object(input.latency) || { status: 'UNKNOWN' },
    reliability: object(input.reliability) || { status: 'UNKNOWN' },
    maintainerHealth: object(input.maintainerHealth) || { status: 'UNKNOWN' },
    securityEvidence: Array.isArray(input.securityEvidence) ? clone(input.securityEvidence) : [],
    knownVulnerabilities, knownConflicts, compatibilityEdges, substitutes,
    benchmarks: Array.isArray(input.benchmarks) ? clone(input.benchmarks) : [],
    realUsageEvidence: Array.isArray(input.realUsageEvidence) ? clone(input.realUsageEvidence) : [],
    economicPrior: object(input.economicPrior) || { status: 'UNKNOWN' },
    founderMinutesSaved: object(input.founderMinutesSaved) || { status: 'UNKNOWN' },
    observedOutcomes: Array.isArray(input.observedOutcomes) ? clone(input.observedOutcomes) : [],
    versionHistory: Array.isArray(input.versionHistory) ? clone(input.versionHistory) : [],
    promotionState,
    revocationState: object(input.revocationState) || { revoked: false, reasonCodes: [] },
    lastEvaluatedAt,
    evidencePointers
  };
  return {
    ok: true,
    status: 'CAPABILITY_NORMALIZED',
    capability: normalized,
    capabilityDigest: digest(normalized),
    businessEffectAuthority: 'NONE',
    externalEffectLedger: clone(ZERO_EXTERNAL_EFFECTS)
  };
}

export function canonicalCapabilityIdentity({ sourceType, sourceNamespace, sourceName, atomIds = [] } = {}) {
  const type = text(sourceType, 80)?.toUpperCase();
  const namespace = text(sourceNamespace, 240)?.toLowerCase();
  const name = text(sourceName, 240)?.toLowerCase();
  const atoms = list(atomIds, 256, 200)?.map(item => item.toLowerCase()).sort();
  if (!CAPABILITY_SOURCE_TYPES.includes(type) || !namespace || !name || !atoms) return null;
  return `cap:${type.toLowerCase()}:${digest({ namespace, name, atoms }).slice(0, 32)}`;
}

export function capabilityAtomSignature(capability) {
  const normalized = normalizeCapability(capability);
  if (!normalized.ok) return null;
  return digest(normalized.capability.capabilityAtoms.map(atom => ({ id: atom.id, inputs: atom.inputs, outputs: atom.outputs, sideEffectClass: atom.sideEffectClass })).sort((a, b) => a.id.localeCompare(b.id)));
}
