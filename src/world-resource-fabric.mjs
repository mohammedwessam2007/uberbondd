import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import { normalizeCapability, normalizeCapabilityAtom } from './capability-genome-schema.mjs';
import { admitCapability } from './capability-genome-admission.mjs';

export const WORLD_RESOURCE_FABRIC_VERSION = 'uberbond.world-resource-fabric.v1';
export const WORLD_RESOURCE_TYPES = Object.freeze([
  'PUBLIC_DATA', 'API', 'COMPUTE', 'HARDWARE', 'SENSOR', 'LAB', 'INSTITUTION',
  'PROFESSIONAL_SERVICE', 'HUMAN_EXPERT', 'PHYSICAL_ENVIRONMENT', 'AUTHORIZED_APP'
]);
export const EXECUTABLE_RESOURCE_TYPES = Object.freeze(['API', 'COMPUTE', 'AUTHORIZED_APP']);
export const HUMAN_RESOURCE_TYPES = Object.freeze(['HUMAN_EXPERT']);

const SHA256 = /^[a-f0-9]{64}$/;
const ID = /^[a-z0-9][a-z0-9._:/-]{1,199}$/;
const ZERO = () => structuredClone(ZERO_EXTERNAL_EFFECTS);
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const text = (value, max = 1000) => { const out = String(value ?? '').trim(); return out && out.length <= max ? out : null; };
const iso = value => { const d = new Date(String(value ?? '')); return Number.isFinite(d.getTime()) ? d.toISOString() : null; };
const list = (value, max = 128, itemMax = 500) => {
  if (!Array.isArray(value) || value.length > max) return null;
  const out = [];
  for (const item of value) { const v = text(item, itemMax); if (!v) return null; if (!out.includes(v)) out.push(v); }
  return out;
};
const finite = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
const fail = (status, reasonCodes, extra = {}) => ({
  ok: false, status, policyVersion: WORLD_RESOURCE_FABRIC_VERSION,
  reasonCodes: [...new Set((reasonCodes || []).filter(Boolean))],
  callabilityAuthority: 'NONE', contactAuthority: 'NONE', acquisitionAuthority: 'NONE',
  businessEffectAuthority: 'NONE', externalEffectLedger: ZERO(), ...extra
});

function normalizeEvidence(item, expectedClaimClass = null) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
  const ref = text(item.ref, 1000);
  const observedAt = iso(item.observedAt);
  const claimClass = text(item.claimClass, 100)?.toUpperCase();
  const subjectHash = text(item.subjectHash, 64)?.toLowerCase();
  const verifierId = text(item.verifierId, 200);
  if (!ref || !observedAt || !claimClass || !subjectHash || !SHA256.test(subjectHash)) return null;
  if (expectedClaimClass && claimClass !== expectedClaimClass) return null;
  return { ref, observedAt, claimClass, subjectHash, verifierId: verifierId || null };
}

function sourceTypeFor(type) {
  if (type === 'API') return 'API';
  if (type === 'COMPUTE') return 'RUNTIME';
  if (type === 'AUTHORIZED_APP') return 'PLUGIN';
  if (type === 'PROFESSIONAL_SERVICE') return 'HOSTED_SERVICE';
  return 'NATIVE';
}

function dataClassFor(privacyClasses) {
  if (privacyClasses.some(v => v === 'CREDENTIAL')) return 'CREDENTIAL';
  if (privacyClasses.some(v => v === 'PRIVATE_CUSTOMER')) return 'PRIVATE_CUSTOMER';
  if (privacyClasses.some(v => v === 'SOURCE_CODE')) return 'SOURCE_CODE';
  if (privacyClasses.some(v => v === 'INTERNAL_NON_SECRET')) return 'INTERNAL_NON_SECRET';
  return 'PUBLIC';
}

function normalizeAtoms(rawAtoms) {
  if (!Array.isArray(rawAtoms) || rawAtoms.length === 0 || rawAtoms.length > 128) return null;
  const atoms = [];
  for (const raw of rawAtoms) {
    const result = normalizeCapabilityAtom(raw);
    if (!result.ok) return null;
    atoms.push(result.atom);
  }
  return atoms;
}

export function normalizeWorldResource(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return fail('WORLD_RESOURCE_INVALID', ['resource-object-required']);
  const reasons = [];
  const id = text(input.id, 200)?.toLowerCase();
  const type = text(input.type, 80)?.toUpperCase();
  const name = text(input.name, 300);
  const sourceUrl = text(input.provenance?.sourceUrl, 1000);
  const sourceRevision = text(input.provenance?.sourceRevision, 240);
  const sourceHash = text(input.provenance?.sourceHash, 64)?.toLowerCase();
  const observedAt = iso(input.provenance?.observedAt);
  const ownerClass = text(input.owner?.class, 80)?.toUpperCase();
  const ownerRef = text(input.owner?.ref, 300);
  const atoms = normalizeAtoms(input.capabilityAtoms);
  const permissions = list(input.permissions || [], 128, 200);
  const privacyClasses = list(input.privacyClasses || ['PUBLIC'], 32, 80)?.map(v => v.toUpperCase());
  const sideEffects = list(input.sideEffects || ['NONE'], 32, 80)?.map(v => v.toUpperCase());
  const legalConstraints = list(input.legalConstraints || [], 64, 500);
  const failureModes = list(input.failureModes || [], 128, 500);
  const substitutes = list(input.substitutes || [], 128, 200);
  const inputs = list(input.inputs || [], 128, 160);
  const outputs = list(input.outputs || [], 128, 160);
  const revocation = input.revocation && typeof input.revocation === 'object' ? structuredClone(input.revocation) : { revoked: false, reasonCodes: [] };
  const availability = input.availability && typeof input.availability === 'object' ? structuredClone(input.availability) : {};
  const consent = input.consent && typeof input.consent === 'object' ? structuredClone(input.consent) : null;
  const credentialRef = input.credentialRef == null ? null : text(input.credentialRef, 300);
  const license = text(input.license || 'NOASSERTION', 120)?.toUpperCase();
  const licenseConfidence = typeof input.licenseConfidence === 'number' && input.licenseConfidence >= 0 && input.licenseConfidence <= 1 ? input.licenseConfidence : null;

  if (!id || !ID.test(id)) reasons.push('valid-resource-id-required');
  if (!WORLD_RESOURCE_TYPES.includes(type)) reasons.push('recognized-resource-type-required');
  if (!name) reasons.push('resource-name-required');
  if (!sourceUrl || !sourceRevision || !sourceHash || !SHA256.test(sourceHash) || !observedAt) reasons.push('immutable-provenance-required');
  if (!ownerClass || !ownerRef) reasons.push('resource-owner-required');
  if (!atoms) reasons.push('valid-capability-atoms-required');
  if (!permissions || !privacyClasses || !sideEffects || !legalConstraints || !failureModes || !substitutes || !inputs || !outputs) reasons.push('bounded-resource-fields-required');
  if (licenseConfidence == null) reasons.push('license-confidence-required');
  if (credentialRef && !credentialRef.startsWith('credential-ref:')) reasons.push('credential-must-be-reference-only');
  if (HUMAN_RESOURCE_TYPES.includes(type) && ownerClass !== 'HUMAN') reasons.push('human-expert-owner-must-be-human');
  if (HUMAN_RESOURCE_TYPES.includes(type) && credentialRef) reasons.push('human-expert-cannot-have-credential-ref');
  if (revocation.revoked === true && !Array.isArray(revocation.reasonCodes)) reasons.push('revocation-reasons-required');
  if (reasons.length) return fail('WORLD_RESOURCE_INVALID', reasons);

  const normalized = {
    schemaVersion: WORLD_RESOURCE_FABRIC_VERSION,
    id, type, name,
    provenance: { sourceUrl, sourceRevision, sourceHash, observedAt },
    owner: { class: ownerClass, ref: ownerRef },
    capabilityAtoms: atoms, inputs, outputs, permissions, privacyClasses, sideEffects,
    credentialRef, license, licenseConfidence, legalConstraints, failureModes, substitutes,
    availability,
    consent,
    costs: {
      monetaryCents: input.costs?.monetaryCents == null ? null : finite(input.costs.monetaryCents),
      latencyMs: input.costs?.latencyMs == null ? null : finite(input.costs.latencyMs)
    },
    reliability: input.reliability && typeof input.reliability === 'object' ? structuredClone(input.reliability) : { status: 'UNKNOWN' },
    benchmarks: Array.isArray(input.benchmarks) ? structuredClone(input.benchmarks) : [],
    observedValue: Array.isArray(input.observedValue) ? structuredClone(input.observedValue) : [],
    revocation
  };
  return { ok: true, status: 'WORLD_RESOURCE_NORMALIZED', resource: normalized, resourceDigest: digest(normalized), callabilityAuthority: 'NONE', contactAuthority: 'NONE', acquisitionAuthority: 'NONE', businessEffectAuthority: 'NONE', externalEffectLedger: ZERO() };
}

export function projectWorldResourceToCapability(resource) {
  const normalized = resource?.ok && resource?.resource ? resource : normalizeWorldResource(resource);
  if (!normalized.ok) return normalized;
  const r = normalized.resource;
  if (r.type === 'HUMAN_EXPERT') {
    return {
      ok: true, status: 'HUMAN_RESOURCE_NOT_EXECUTABLE_CAPABILITY', capability: null,
      reasonCodes: ['humans-are-sovereign-counterparties-not-tools'],
      resourceDigest: normalized.resourceDigest,
      callabilityAuthority: 'NONE', contactAuthority: 'NONE', businessEffectAuthority: 'NONE', externalEffectLedger: ZERO()
    };
  }
  const capability = {
    id: `world.${r.id}`,
    canonicalIdentity: `world:${r.type.toLowerCase()}:${r.provenance.sourceHash.slice(0,32)}`,
    aliases: [],
    source: { url: r.provenance.sourceUrl, lineageRoot: `world-resource:${r.id}` },
    sourceType: sourceTypeFor(r.type),
    sourceRevision: r.provenance.sourceRevision,
    sourceHash: r.provenance.sourceHash,
    maintainer: { name: r.owner.ref },
    license: r.license,
    licenseConfidence: r.licenseConfidence,
    capabilityAtoms: r.capabilityAtoms,
    taskClasses: [`world-resource:${r.type.toLowerCase()}`],
    inputs: r.inputs,
    outputs: r.outputs,
    sideEffects: r.sideEffects,
    dataClasses: [dataClassFor(r.privacyClasses)],
    permissions: r.permissions,
    credentialRequirements: r.credentialRef ? [r.credentialRef] : [],
    networkRequirements: [], dependencies: [],
    executionEnvironment: { resourceType: r.type, directExecution: EXECUTABLE_RESOURCE_TYPES.includes(r.type) },
    supportedAgents: [], supportedModels: [], supportedProviders: [],
    knownVulnerabilities: r.failureModes, knownConflicts: [], compatibilityEdges: [], substitutes: r.substitutes,
    evidencePointers: [{ type: 'WORLD_RESOURCE_PROVENANCE', ref: r.provenance.sourceUrl, observedAt: r.provenance.observedAt, digest: r.provenance.sourceHash, claimClass: 'RESOURCE_IDENTITY' }],
    promotionState: 'DISCOVERED', lastEvaluatedAt: r.provenance.observedAt,
    revocationState: r.revocation
  };
  const projected = normalizeCapability(capability);
  if (!projected.ok) return fail('WORLD_RESOURCE_CAPABILITY_PROJECTION_REFUSED', projected.reasonCodes, { resourceDigest: normalized.resourceDigest });
  return { ok: true, status: 'WORLD_RESOURCE_PROJECTED_TO_CAPABILITY_GENOME', capability: projected.capability, capabilityDigest: projected.capabilityDigest, resourceDigest: normalized.resourceDigest, callabilityAuthority: 'NONE', contactAuthority: 'NONE', businessEffectAuthority: 'NONE', externalEffectLedger: ZERO() };
}

export function admitWorldResource(resource, {
  availabilityEvidence = null,
  consentEvidence = null,
  capabilitySecurityEvidence = [],
  requestedPermissions = [],
  authorizedPermissions = [],
  now = new Date(),
  maxEvidenceAgeDays = 30
} = {}) {
  const normalized = resource?.ok && resource?.resource ? resource : normalizeWorldResource(resource);
  if (!normalized.ok) return normalized;
  const r = normalized.resource;
  if (r.revocation?.revoked === true) return fail('WORLD_RESOURCE_DENIED', ['resource-revoked'], { resourceDigest: normalized.resourceDigest });
  const nowMs = new Date(now).getTime();
  if (!Number.isFinite(nowMs)) return fail('WORLD_RESOURCE_DENIED', ['valid-clock-required']);
  const availability = normalizeEvidence(availabilityEvidence, 'RESOURCE_AVAILABILITY');
  const availabilityAge = availability ? (nowMs - new Date(availability.observedAt).getTime()) / 86_400_000 : Number.POSITIVE_INFINITY;
  const availabilityValid = Boolean(availability && availability.subjectHash === r.provenance.sourceHash && availabilityAge >= 0 && availabilityAge <= maxEvidenceAgeDays);
  const reasons = [];
  if (!availabilityValid) reasons.push('fresh-resource-availability-evidence-required');

  let consent = null;
  if (r.type === 'HUMAN_EXPERT') {
    consent = normalizeEvidence(consentEvidence, 'HUMAN_CONSENT');
    const consentAge = consent ? (nowMs - new Date(consent.observedAt).getTime()) / 86_400_000 : Number.POSITIVE_INFINITY;
    if (!consent || consent.subjectHash !== r.provenance.sourceHash || consentAge < 0 || consentAge > maxEvidenceAgeDays) reasons.push('fresh-explicit-human-consent-required');
    if (!consent?.verifierId || consent.verifierId === r.owner.ref) reasons.push('independent-consent-evidence-required');
  }

  const projection = projectWorldResourceToCapability(normalized);
  let capabilityAdmission = null;
  if (EXECUTABLE_RESOURCE_TYPES.includes(r.type)) {
    if (!projection.ok || !projection.capability) reasons.push('executable-resource-capability-projection-required');
    else {
      capabilityAdmission = admitCapability(projection.capability, { securityEvidence: capabilitySecurityEvidence, requestedPermissions, authorizedPermissions, now });
      if (capabilityAdmission.decision !== 'ELIGIBLE') reasons.push('capability-genome-admission-required');
    }
  }

  const decision = reasons.length ? 'REVIEW' : 'RESOURCE_ELIGIBLE_FOR_PLANNING';
  return {
    ok: true,
    status: decision,
    reasonCodes: reasons,
    resource: r,
    resourceDigest: normalized.resourceDigest,
    capabilityProjection: projection.capability ? { capabilityId: projection.capability.id, capabilityDigest: projection.capabilityDigest } : null,
    capabilityAdmission: capabilityAdmission ? { decision: capabilityAdmission.decision, reasonCodes: capabilityAdmission.reasonCodes } : null,
    evidence: { availability, consent },
    availabilityTruth: availabilityValid ? 'OBSERVED_AVAILABLE_WITHIN_EVIDENCE_WINDOW' : 'NOT_ESTABLISHED',
    callabilityAuthority: 'NONE',
    contactAuthority: 'NONE',
    acquisitionAuthority: 'NONE',
    humanSovereignty: r.type === 'HUMAN_EXPERT' ? 'HUMAN_REMAINS_SOVEREIGN_COUNTERPARTY__CONSENT_DOES_NOT_CREATE_CONTACT_OR_TASKING_AUTHORITY' : null,
    truthBoundary: 'RESOURCE ELIGIBILITY SUPPORTS PLANNING ONLY. AVAILABILITY, CONSENT OR CAPABILITY ADMISSION NEVER CREATE CALLABILITY, CONTACT, PURCHASE, ACCESS OR EXECUTION AUTHORITY.',
    businessEffectAuthority: 'NONE', externalEffectLedger: ZERO()
  };
}

export function chooseWorldResourceSubstitutes(resources = [], { requiredAtomIds = [] } = {}) {
  if (!Array.isArray(resources) || !Array.isArray(requiredAtomIds) || requiredAtomIds.length === 0) return fail('WORLD_RESOURCE_SUBSTITUTES_REFUSED', ['resources-and-required-atoms-required']);
  const normalized = [];
  for (const item of resources) { const result = normalizeWorldResource(item); if (!result.ok) return fail('WORLD_RESOURCE_SUBSTITUTES_REFUSED', ['invalid-resource-in-candidate-set', ...result.reasonCodes]); normalized.push(result); }
  const wanted = new Set(requiredAtomIds.map(v => String(v).toLowerCase()));
  const candidates = normalized.filter(row => !row.resource.revocation?.revoked && [...wanted].every(id => row.resource.capabilityAtoms.some(atom => atom.id === id)));
  return {
    ok: true, status: candidates.length ? 'WORLD_RESOURCE_SUBSTITUTES_FOUND' : 'NO_WORLD_RESOURCE_SUBSTITUTE_FOUND',
    candidates: candidates.map(row => ({ id: row.resource.id, type: row.resource.type, resourceDigest: row.resourceDigest, substitutes: row.resource.substitutes })),
    callabilityAuthority: 'NONE', contactAuthority: 'NONE', acquisitionAuthority: 'NONE', businessEffectAuthority: 'NONE', externalEffectLedger: ZERO()
  };
}
