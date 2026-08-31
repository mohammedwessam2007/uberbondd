import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import {
  CAPABILITY_PROMOTION_STATES,
  normalizeCapability,
  capabilityAtomSignature
} from './capability-genome-schema.mjs';

export const CAPABILITY_GENOME_ADMISSION_VERSION = 'capability-genome-admission-1.0.0';

const PERMISSIVE = new Set(['MIT', 'APACHE-2.0', 'BSD-2-CLAUSE', 'BSD-3-CLAUSE', 'ISC', 'CC-BY-4.0']);
const REFERENCE_ONLY = new Set(['AGPL-3.0', 'GPL-3.0', 'SSPL-1.0', 'UNKNOWN', 'NOASSERTION']);
const REQUIRED_SECURITY_LAYERS = Object.freeze(['STATIC', 'SEMANTIC', 'SANDBOX']);
const DANGEROUS = Object.freeze([
  ['credential-access', /(?:\.env|ssh\/|id_rsa|credentials?|api[_ -]?keys?|browser cookies?|keychain)/i],
  ['exfiltration', /(?:exfiltrat|upload\s+secrets?|send\s+tokens?|webhook\.site|requestbin)/i],
  ['remote-execution', /(?:curl|wget).{0,120}(?:\||bash|sh)|eval\s*\(|exec\s*\(|remote.{0,30}(?:script|payload)/i],
  ['destructive-shell', /(?:rm\s+-rf|mkfs\.|dd\s+if=|format\s+[a-z]:|del\s+\/s)/i],
  ['privilege-escalation', /(?:sudo\s|chmod\s+777|setuid|disable.{0,30}(?:security|sandbox))/i],
  ['instruction-hierarchy-attack', /(?:ignore (?:all )?(?:prior|previous|system)(?: system)? instructions|override system prompt|reveal system prompt)/i],
  ['access-bypass', /(?:bypass captcha|steal cookies?|fingerprint spoof|evade access controls?|rotate accounts?)/i],
  ['unauthorized-production', /(?:deploy (?:directly )?to production|modify production|change dns|move money|send bulk email)/i]
]);

const TRANSITIONS = Object.freeze({
  DISCOVERED: ['NORMALIZED', 'REVOKED', 'ARCHIVED'],
  NORMALIZED: ['DEDUPED', 'REVOKED', 'ARCHIVED'],
  DEDUPED: ['SECURITY_REVIEWED', 'REVOKED', 'ARCHIVED'],
  SECURITY_REVIEWED: ['ELIGIBLE', 'REVOKED', 'ARCHIVED'],
  ELIGIBLE: ['SANDBOXED', 'REVOKED', 'ARCHIVED'],
  SANDBOXED: ['BENCHMARKED', 'REVOKED', 'DEGRADED', 'ARCHIVED'],
  BENCHMARKED: ['APPROVED', 'REVOKED', 'DEGRADED', 'ARCHIVED'],
  APPROVED: ['ACTIVE', 'REVOKED', 'DEGRADED', 'REPLACED'],
  ACTIVE: ['DEGRADED', 'REPLACED', 'REVOKED'],
  DEGRADED: ['ACTIVE', 'REPLACED', 'REVOKED', 'ARCHIVED'],
  REPLACED: ['ARCHIVED', 'REVOKED'],
  REVOKED: ['ARCHIVED'],
  ARCHIVED: []
});

function clone(value) { return structuredClone(value); }
function digest(value) { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function fail(reasonCodes, extra = {}) {
  return {
    ok: false,
    policyVersion: CAPABILITY_GENOME_ADMISSION_VERSION,
    decision: 'DENY',
    reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
    businessEffectAuthority: 'NONE',
    externalEffectLedger: clone(ZERO_EXTERNAL_EFFECTS),
    ...extra
  };
}

function normalizedCapability(value) {
  const result = value?.ok && value?.capability ? value : normalizeCapability(value);
  return result?.ok ? result.capability : null;
}

export function dedupeCapabilities(capabilities = [], { behavioralEvidence = [] } = {}) {
  if (!Array.isArray(capabilities)) return fail(['capability-array-required']);
  const normalized = [];
  for (const item of capabilities) {
    const result = normalizeCapability(item);
    if (!result.ok) return fail(['invalid-capability-in-dedupe', ...result.reasonCodes]);
    normalized.push(result.capability);
  }
  const parent = normalized.map((_, index) => index);
  const root = i => parent[i] === i ? i : (parent[i] = root(parent[i]));
  const join = (a, b) => { const ra = root(a); const rb = root(b); if (ra !== rb) parent[rb] = ra; };
  const behaviors = new Map(behavioralEvidence.filter(item => item && typeof item === 'object').map(item => [`${item.left}|${item.right}`, Number(item.similarity)]));
  const reasons = [];
  for (let i = 0; i < normalized.length; i += 1) {
    for (let j = i + 1; j < normalized.length; j += 1) {
      const a = normalized[i]; const b = normalized[j];
      const aliases = new Set([a.id, a.canonicalIdentity, ...a.aliases].map(v => v.toLowerCase()));
      const exactIdentity = aliases.has(b.id.toLowerCase()) || aliases.has(b.canonicalIdentity.toLowerCase()) || b.aliases.some(v => aliases.has(v.toLowerCase()));
      const sameHash = a.sourceHash === b.sourceHash;
      const samePackage = a.source.packageIdentity && a.source.packageIdentity === b.source.packageIdentity;
      const sameLineage = a.source.lineageRoot && a.source.lineageRoot === b.source.lineageRoot;
      const sameAtoms = capabilityAtomSignature(a) === capabilityAtomSignature(b);
      const behavioral = behaviors.get(`${a.id}|${b.id}`) ?? behaviors.get(`${b.id}|${a.id}`) ?? 0;
      if (exactIdentity || sameHash || samePackage || sameLineage || (sameAtoms && behavioral >= 0.9)) {
        join(i, j);
        reasons.push({ left: a.id, right: b.id, signals: { exactIdentity, sameHash, samePackage: Boolean(samePackage), sameLineage: Boolean(sameLineage), sameAtoms, behavioral } });
      }
    }
  }
  const groups = new Map();
  normalized.forEach((capability, index) => {
    const key = root(index);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(capability);
  });
  const families = [...groups.values()].map(group => ({
    canonicalId: group.map(item => item.canonicalIdentity).sort()[0],
    members: group.map(item => item.id).sort(),
    sourceHashes: [...new Set(group.map(item => item.sourceHash))].sort(),
    atomSignatures: [...new Set(group.map(item => capabilityAtomSignature(item)))].sort()
  })).sort((a, b) => a.canonicalId.localeCompare(b.canonicalId));
  return {
    ok: true,
    status: 'CAPABILITIES_DEDUPED',
    inputCount: normalized.length,
    familyCount: families.length,
    duplicateCount: normalized.length - families.length,
    families,
    evidence: reasons,
    dedupeDigest: digest({ families, reasons }),
    businessEffectAuthority: 'NONE',
    externalEffectLedger: clone(ZERO_EXTERNAL_EFFECTS)
  };
}

export function evaluateLicense(capability, { intendedUse = 'EXTERNAL_INVOCATION' } = {}) {
  const normalized = normalizedCapability(capability);
  if (!normalized) return fail(['valid-capability-required']);
  const license = normalized.license;
  const confidence = normalized.licenseConfidence;
  if (confidence < 0.8 || REFERENCE_ONLY.has(license)) {
    return {
      ok: true, decision: intendedUse === 'PATTERN_LEARNING' ? 'REFERENCE_ONLY' : 'REVIEW',
      reasonCodes: ['license-uncertain-or-restrictive'], license, confidence,
      allowedIntegrationClasses: ['PATTERN_LEARNING', 'EXTERNAL_INVOCATION_WITH_SEPARATE_TERMS_REVIEW'],
      businessEffectAuthority: 'NONE', externalEffectLedger: clone(ZERO_EXTERNAL_EFFECTS)
    };
  }
  return {
    ok: true, decision: PERMISSIVE.has(license) ? 'ELIGIBLE' : 'REVIEW',
    reasonCodes: PERMISSIVE.has(license) ? ['permissive-license-observed'] : ['license-review-required'],
    license, confidence,
    allowedIntegrationClasses: PERMISSIVE.has(license) ? ['PATTERN_LEARNING', 'EXTERNAL_INVOCATION', 'VENDOR_AFTER_REVIEW', 'NATIVE_REIMPLEMENTATION'] : ['PATTERN_LEARNING'],
    businessEffectAuthority: 'NONE', externalEffectLedger: clone(ZERO_EXTERNAL_EFFECTS)
  };
}

export function scanCapabilityInstructions({ instructions = '', manifests = [], dependencySpecs = [] } = {}) {
  const corpus = [String(instructions ?? ''), ...manifests.map(String), ...dependencySpecs.map(String)].join('\n');
  const findings = [];
  for (const [code, pattern] of DANGEROUS) {
    if (pattern.test(corpus)) findings.push({ code, severity: ['credential-access', 'exfiltration', 'remote-execution', 'destructive-shell', 'privilege-escalation'].includes(code) ? 'CRITICAL' : 'HIGH' });
  }
  if (/(?:https?:\/\/[^\s]+\.(?:sh|ps1)|git\+https?:)/i.test(corpus)) findings.push({ code: 'mutable-remote-dependency', severity: 'HIGH' });
  if (/docker\s+(?:run|pull).*(?::latest|\s[^@\s]+\s*$)/im.test(corpus)) findings.push({ code: 'unpinned-container', severity: 'HIGH' });
  return {
    ok: findings.length === 0,
    decision: findings.some(item => item.severity === 'CRITICAL') ? 'QUARANTINE' : findings.length ? 'REVIEW' : 'STATIC_CLEAR',
    findings,
    scanDigest: digest({ corpus: digest(corpus), findings }),
    caveat: 'Static and semantic inspection is one layer; absence of findings is not runtime safety.',
    businessEffectAuthority: 'NONE', externalEffectLedger: clone(ZERO_EXTERNAL_EFFECTS)
  };
}

export function admitCapability(capability, {
  securityEvidence = [],
  requestedPermissions = [],
  authorizedPermissions = [],
  intendedUse = 'EXTERNAL_INVOCATION',
  now = new Date()
} = {}) {
  const normalized = normalizedCapability(capability);
  if (!normalized) return fail(['valid-capability-required']);
  if (normalized.revocationState?.revoked || normalized.promotionState === 'REVOKED') return fail(['capability-revoked']);
  const license = evaluateLicense(normalized, { intendedUse });
  if (license.decision === 'REVIEW' && intendedUse !== 'PATTERN_LEARNING') return fail(['license-review-required'], { license });
  const layers = new Map();
  for (const item of securityEvidence) {
    if (!item || typeof item !== 'object') continue;
    const layer = String(item.layer || '').toUpperCase();
    const observed = new Date(item?.observedAt);
    const ageDays = Number.isFinite(observed.getTime()) ? (new Date(now).getTime() - observed.getTime()) / 86_400_000 : Number.POSITIVE_INFINITY;
    if (REQUIRED_SECURITY_LAYERS.includes(layer) && item.passed === true && item.artifactRef && item.subjectHash === normalized.sourceHash && ageDays >= 0 && ageDays <= 90) layers.set(layer, item);
  }
  const missingLayers = REQUIRED_SECURITY_LAYERS.filter(layer => !layers.has(layer));
  const requested = [...new Set(requestedPermissions.map(String))];
  const authorized = new Set(authorizedPermissions.map(String));
  const unauthorized = requested.filter(permission => !authorized.has(permission));
  const dangerousEffects = normalized.sideEffects.filter(effect => ['MESSAGE', 'DEPLOYMENT', 'PRODUCTION_MUTATION', 'MONEY_MOVEMENT', 'SECURITY_TEST'].includes(effect));
  const reasons = [];
  if (missingLayers.length) reasons.push('independent-security-layers-required');
  if (unauthorized.length) reasons.push('permission-not-authorized');
  if (dangerousEffects.length && requested.length === 0) reasons.push('explicit-effect-permissions-required');
  return {
    ok: true,
    policyVersion: CAPABILITY_GENOME_ADMISSION_VERSION,
    decision: reasons.length ? 'REVIEW' : 'ELIGIBLE',
    reasonCodes: reasons,
    missingSecurityLayers: missingLayers,
    unauthorizedPermissions: unauthorized,
    dangerousEffects,
    securityEvidenceDigest: digest([...layers.values()]),
    evaluatedAt: new Date(now).toISOString(),
    businessEffectAuthority: 'NONE',
    externalEffectLedger: clone(ZERO_EXTERNAL_EFFECTS)
  };
}

export function transitionCapability(capability, nextState, { reasonCodes = [], evidenceRefs = [], now = new Date() } = {}) {
  const normalized = normalizedCapability(capability);
  if (!normalized) return fail(['valid-capability-required']);
  const next = String(nextState || '').toUpperCase();
  if (!CAPABILITY_PROMOTION_STATES.includes(next)) return fail(['recognized-next-state-required']);
  if (!TRANSITIONS[normalized.promotionState]?.includes(next)) return fail(['illegal-capability-state-transition'], { from: normalized.promotionState, to: next });
  if (next === 'REVOKED' && reasonCodes.length === 0) return fail(['revocation-reason-required']);
  const updated = clone(normalized);
  updated.promotionState = next;
  updated.lastEvaluatedAt = new Date(now).toISOString();
  updated.versionHistory.push({ from: normalized.promotionState, to: next, at: updated.lastEvaluatedAt, reasonCodes: [...new Set(reasonCodes)], evidenceRefs: [...new Set(evidenceRefs)] });
  if (next === 'REVOKED') updated.revocationState = { revoked: true, revokedAt: updated.lastEvaluatedAt, reasonCodes: [...new Set(reasonCodes)], evidenceRefs: [...new Set(evidenceRefs)] };
  return { ok: true, status: `CAPABILITY_${next}`, capability: updated, transitionDigest: digest(updated.versionHistory.at(-1)), businessEffectAuthority: 'NONE', externalEffectLedger: clone(ZERO_EXTERNAL_EFFECTS) };
}

export function revokeCapability(capability, options = {}) {
  return transitionCapability(capability, 'REVOKED', options);
}
