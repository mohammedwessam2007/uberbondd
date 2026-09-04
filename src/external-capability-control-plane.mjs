import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const EXTERNAL_CAPABILITY_POLICY_VERSION = 'external-capability-control-plane-1.1.0';

const ALLOWED_CLASSES = new Set([
  'CANONICAL_METHOD',
  'PROJECT_SKILL',
  'OPTIONAL_RUNTIME',
  'EXTERNAL_ADAPTER',
  'REFERENCE_ONLY',
  'PROJECT_SKILL_AND_OPTIONAL_RUNTIME'
]);

const ALLOWED_AUTHORITIES = new Set(['NONE', 'SECURITY_TEST_ONLY']);
const SAFE_DATA_CLASSES = new Set(['PUBLIC', 'INTERNAL_NON_SECRET', 'SOURCE_CODE']);
const SENSITIVE_DATA_CLASSES = new Set(['SECRET', 'CREDENTIAL', 'AUTH_COOKIE', 'PRIVATE_CUSTOMER_RAW', 'PAYMENT_RAW']);
const CORE_REQUIRED_CAPABILITIES = Object.freeze([
  'find-skills',
  'claude-code-setup',
  'task-observer',
  'claude-mem',
  'headroom',
  'omniroute',
  'strix',
  'agent-reach'
]);
const MIN_CAPABILITIES = CORE_REQUIRED_CAPABILITIES.length;
const MAX_CAPABILITIES = 64;

const TASK_DEFAULTS = Object.freeze({
  'skill-discovery': 'find-skills',
  'automation-audit': 'claude-code-setup',
  'skill-learning': 'task-observer',
  'session-memory': 'claude-mem',
  'context-compression': 'headroom',
  'model-routing': 'omniroute',
  'security-verification': 'strix',
  'world-sensing': 'agent-reach',
  'orchestration-planning': 'fable-orchestrator'
});

function clone(value) {
  return structuredClone(value);
}

function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function fail(reasonCodes, extra = {}) {
  return {
    ok: false,
    policyVersion: EXTERNAL_CAPABILITY_POLICY_VERSION,
    decision: 'DENY',
    reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
    businessEffectAuthority: 'NONE',
    externalEffectLedger: clone(ZERO_EXTERNAL_EFFECTS),
    ...extra
  };
}

function boundedText(value, max = 1000) {
  const text = String(value ?? '').trim();
  return text && text.length <= max ? text : null;
}

function normalizeEntry(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
  const id = boundedText(entry.id, 100)?.toLowerCase();
  const name = boundedText(entry.name, 200);
  const source = boundedText(entry.source, 1000);
  const upstream = boundedText(entry.upstream, 300);
  const license = boundedText(entry.license, 120);
  const capabilityClass = boundedText(entry.class, 120);
  const role = boundedText(entry.role, 1000);
  const uberbondUse = boundedText(entry.uberbondUse, 1200);
  const activation = boundedText(entry.activation, 200);
  const authority = boundedText(entry.authority, 120);
  const risk = boundedText(entry.risk, 120);
  const sourceRef = entry.sourceRef == null ? null : boundedText(entry.sourceRef, 80)?.toLowerCase();
  const projectIntegration = entry.projectIntegration && typeof entry.projectIntegration === 'object' && !Array.isArray(entry.projectIntegration)
    ? clone(entry.projectIntegration)
    : {};
  const notes = Array.isArray(entry.notes)
    ? entry.notes.map(item => boundedText(item, 1000)).filter(Boolean)
    : [];
  if (!id || !/^[a-z0-9][a-z0-9-]*$/.test(id) || !name || !source || !upstream || !license || !capabilityClass || !role || !uberbondUse || !activation || !authority || !risk) return null;
  if (!source.startsWith('https://')) return null;
  if (!ALLOWED_CLASSES.has(capabilityClass) || !ALLOWED_AUTHORITIES.has(authority)) return null;
  if (sourceRef && !/^[a-f0-9]{40}$/.test(sourceRef)) return null;
  return {
    id,
    name,
    source,
    upstream,
    license,
    class: capabilityClass,
    role,
    uberbondUse,
    activation,
    authority,
    risk,
    sourceRef,
    projectIntegration,
    notes
  };
}

export function validateExternalCapabilityRegistry(registry = {}) {
  if (!registry || typeof registry !== 'object' || Array.isArray(registry)) {
    return fail(['registry-object-required']);
  }
  const schemaVersion = boundedText(registry.schemaVersion, 120);
  const project = boundedText(registry.project, 120);
  const policyPath = boundedText(registry.policyPath, 300);
  const entries = Array.isArray(registry.entries) ? registry.entries : null;
  const reasonCodes = [];
  if (![
    'uberbond-external-skill-plugin-registry-1.0.0',
    'uberbond-external-skill-plugin-registry-1.1.0',
    'uberbond-external-skill-plugin-registry-1.2.0'
  ].includes(schemaVersion)) reasonCodes.push('unsupported-registry-schema');
  if (project !== 'UberBond') reasonCodes.push('registry-project-must-be-uberbond');
  if (policyPath !== 'docs/AI_SKILL_PLUGIN_ASSIMILATION_CANON.md') reasonCodes.push('canonical-policy-path-required');
  if (!entries || entries.length < MIN_CAPABILITIES || entries.length > MAX_CAPABILITIES) reasonCodes.push('bounded-expandable-capability-registry-required');

  const normalizedEntries = [];
  const ids = new Set();
  if (entries) {
    for (const raw of entries) {
      const entry = normalizeEntry(raw);
      if (!entry) {
        reasonCodes.push('invalid-capability-entry');
        continue;
      }
      if (ids.has(entry.id)) reasonCodes.push('duplicate-capability-id');
      ids.add(entry.id);
      normalizedEntries.push(entry);
    }
  }

  for (const required of CORE_REQUIRED_CAPABILITIES) {
    if (!ids.has(required)) reasonCodes.push(`missing-core-capability:${required}`);
  }
  for (const required of Object.values(TASK_DEFAULTS)) {
    if (!ids.has(required)) reasonCodes.push(`missing-required-capability:${required}`);
  }

  if (reasonCodes.length) return fail(reasonCodes, { entries: normalizedEntries });

  const identity = {
    schemaVersion,
    project,
    policyPath,
    entries: normalizedEntries.map(entry => ({
      id: entry.id,
      sourceRef: entry.sourceRef,
      class: entry.class,
      activation: entry.activation,
      authority: entry.authority,
      projectIntegration: entry.projectIntegration
    }))
  };

  return {
    ok: true,
    policyVersion: EXTERNAL_CAPABILITY_POLICY_VERSION,
    status: 'EXTERNAL_CAPABILITY_REGISTRY_READY',
    registry: {
      schemaVersion,
      project,
      policyPath,
      entries: normalizedEntries
    },
    capabilityDigest: digest(identity),
    businessEffectAuthority: 'NONE',
    externalEffectLedger: clone(ZERO_EXTERNAL_EFFECTS)
  };
}

export function summarizeExternalCapabilities(registry = {}) {
  const validated = validateExternalCapabilityRegistry(registry);
  if (!validated.ok) return validated;
  return {
    ok: true,
    policyVersion: EXTERNAL_CAPABILITY_POLICY_VERSION,
    capabilityDigest: validated.capabilityDigest,
    capabilityCount: validated.registry.entries.length,
    capabilities: validated.registry.entries.map(entry => ({
      id: entry.id,
      name: entry.name,
      class: entry.class,
      activation: entry.activation,
      authority: entry.authority,
      risk: entry.risk,
      sourceRef: entry.sourceRef,
      integrationStatus: boundedText(entry.projectIntegration?.status, 120) || 'DECLARED'
    })),
    businessEffectAuthority: 'NONE',
    externalEffectLedger: clone(ZERO_EXTERNAL_EFFECTS)
  };
}

function planBase(entry, decision, status, reasonCodes = [], extra = {}) {
  return {
    ok: decision !== 'DENY',
    policyVersion: EXTERNAL_CAPABILITY_POLICY_VERSION,
    decision,
    status,
    capability: {
      id: entry.id,
      name: entry.name,
      class: entry.class,
      activation: entry.activation,
      authority: entry.authority,
      risk: entry.risk,
      sourceRef: entry.sourceRef,
      projectIntegration: clone(entry.projectIntegration)
    },
    reasonCodes: [...new Set(reasonCodes)],
    businessEffectAuthority: entry.authority === 'SECURITY_TEST_ONLY' ? 'SECURITY_TEST_ONLY' : 'NONE',
    externalEffectLedger: clone(ZERO_EXTERNAL_EFFECTS),
    ...extra
  };
}

export function planExternalCapabilityUse({
  registry,
  taskKind = null,
  capabilityId = null,
  targetClass = 'NONE',
  dataClass = 'INTERNAL_NON_SECRET',
  runtimeAvailable = false,
  preserveAuthoritativeOriginal = true,
  providerIdentityObservable = false,
  explicitProviderConfig = false,
  explicitAuthority = false,
  sourceAuthorized = false,
  requiresLogin = false,
  requiresPrivateSession = false,
  bypassRequired = false,
  liveRuntimeRequested = false,
  plannerIdentityObservable = false,
  callableWorkerMenuVerified = false
} = {}) {
  const validated = validateExternalCapabilityRegistry(registry);
  if (!validated.ok) return validated;
  const selectedId = boundedText(capabilityId, 100)?.toLowerCase() || TASK_DEFAULTS[boundedText(taskKind, 100)] || null;
  if (!selectedId) return fail(['capability-or-known-task-kind-required']);
  const entry = validated.registry.entries.find(item => item.id === selectedId);
  if (!entry) return fail(['capability-not-registered'], { capabilityId: selectedId });

  if (SENSITIVE_DATA_CLASSES.has(dataClass)) {
    return planBase(entry, 'DENY', 'SENSITIVE_DATA_NOT_APPROVED', ['sensitive-data-class-prohibited']);
  }
  if (!SAFE_DATA_CLASSES.has(dataClass)) {
    return planBase(entry, 'DENY', 'UNKNOWN_DATA_CLASS', ['recognized-data-class-required']);
  }

  if (entry.id === 'find-skills' || entry.id === 'claude-code-setup') {
    return planBase(entry, 'ALLOW', 'PROJECT_SKILL_READY', ['read-only-or-discovery-capability']);
  }

  if (entry.id === 'task-observer') {
    return planBase(entry, 'ALLOW', 'RECOMMENDATION_ONLY_READY', ['skill-mutation-remains-review-gated'], {
      requiredOutputClass: 'PROPOSED_SKILL_UPDATE_OR_OBSERVATION'
    });
  }

  if (entry.id === 'claude-mem') {
    if (!runtimeAvailable) return planBase(entry, 'REVIEW', 'RUNTIME_NOT_ACTIVE', ['live-claude-mem-runtime-required']);
    return planBase(entry, 'ALLOW', 'SUBORDINATE_MEMORY_ALLOWED', ['repository-memory-outranks-plugin-memory'], {
      truthAuthority: 'ADVISORY_WORKING_MEMORY_ONLY'
    });
  }

  if (entry.id === 'headroom') {
    if (!preserveAuthoritativeOriginal) return planBase(entry, 'DENY', 'AUTHORITATIVE_ORIGINAL_REQUIRED', ['lossy-compression-cannot-destroy-proof']);
    if (!runtimeAvailable) return planBase(entry, 'REVIEW', 'RUNTIME_NOT_ACTIVE', ['live-headroom-runtime-required']);
    return planBase(entry, 'ALLOW', 'REVERSIBLE_CONTEXT_OPTIMIZATION_ALLOWED', ['authoritative-original-preserved']);
  }

  if (entry.id === 'omniroute') {
    if (!runtimeAvailable) return planBase(entry, 'REVIEW', 'RUNTIME_NOT_ACTIVE', ['live-omniroute-runtime-required']);
    if (!explicitProviderConfig) return planBase(entry, 'REVIEW', 'PROVIDER_CONFIGURATION_REQUIRED', ['explicit-provider-configuration-required']);
    if (!providerIdentityObservable) return planBase(entry, 'DENY', 'PROVIDER_IDENTITY_MUST_REMAIN_OBSERVABLE', ['silent-provider-fallback-prohibited']);
    return planBase(entry, 'ALLOW', 'BOUNDED_MODEL_ROUTING_ALLOWED', ['routing-does-not-widen-authority']);
  }

  if (entry.id === 'strix') {
    const safeTargets = new Set(['OWNED_LOCAL', 'OWNED_TEST', 'OWNED_PREVIEW']);
    if (targetClass === 'OWNED_PRODUCTION' && !explicitAuthority) {
      return planBase(entry, 'REVIEW', 'PRODUCTION_SECURITY_AUTHORITY_REQUIRED', ['explicit-production-security-test-authority-required']);
    }
    if (!safeTargets.has(targetClass) && targetClass !== 'OWNED_PRODUCTION') {
      return planBase(entry, 'DENY', 'UNAUTHORIZED_SECURITY_TARGET', ['owned-or-explicitly-authorized-target-required']);
    }
    if (!runtimeAvailable) return planBase(entry, 'REVIEW', 'RUNTIME_NOT_ACTIVE', ['live-strix-runtime-required']);
    return planBase(entry, 'ALLOW', 'BOUNDED_SECURITY_TEST_ALLOWED', ['no-destructive-or-third-party-testing']);
  }

  if (entry.id === 'agent-reach') {
    if (bypassRequired) return planBase(entry, 'DENY', 'ACCESS_BYPASS_PROHIBITED', ['captcha-or-access-control-bypass-prohibited']);
    if (requiresPrivateSession || requiresLogin) return planBase(entry, 'DENY', 'PRIVATE_SESSION_NOT_APPROVED', ['private-cookie-or-login-session-use-prohibited-by-default']);
    if (!sourceAuthorized || !['PUBLIC_WEB', 'AUTHORIZED_PUBLIC_SOURCE'].includes(targetClass)) {
      return planBase(entry, 'REVIEW', 'SOURCE_AUTHORIZATION_REQUIRED', ['public-or-explicitly-authorized-source-required']);
    }
    if (!runtimeAvailable) return planBase(entry, 'REVIEW', 'RUNTIME_NOT_ACTIVE', ['live-agent-reach-runtime-required']);
    return planBase(entry, 'ALLOW', 'PUBLIC_RESEARCH_ALLOWED', ['read-only-public-authorized-research']);
  }

  if (entry.id === 'fable-orchestrator') {
    if (!liveRuntimeRequested) {
      return planBase(entry, 'ALLOW', 'ORCHESTRATION_PROTOCOL_READY', ['provider-neutral-fable-graph-method'], {
        liveRuntimeProven: false,
        requiredCanon: 'docs/ORCHESTRATION_CAPABILITY_CANON.md'
      });
    }
    if (!runtimeAvailable) return planBase(entry, 'REVIEW', 'FABLE_RUNTIME_NOT_ACTIVE', ['live-fable-runtime-required']);
    if (!plannerIdentityObservable) return planBase(entry, 'REVIEW', 'PLANNER_IDENTITY_REQUIRED', ['planner-provider-model-identity-must-be-observable']);
    if (!callableWorkerMenuVerified) return planBase(entry, 'REVIEW', 'CALLABLE_WORKER_MENU_REQUIRED', ['discovered-workers-are-not-callable-workers']);
    return planBase(entry, 'ALLOW', 'BOUNDED_FABLE_RUNTIME_ALLOWED', ['planner-only-no-authority-expansion', 'callable-workers-verified'], {
      plannerAuthority: 'PLAN_AND_ADJUDICATE_ONLY',
      implementationAuthority: 'UNCHANGED_FROM_PARENT_TASK'
    });
  }

  if (entry.id === 'metaswarm' || entry.id === 'superpowers') {
    return planBase(entry, 'ALLOW', 'CANONICAL_METHOD_DONOR_READY', ['mechanism-composition-only-no-wholesale-runtime-promotion'], {
      installationAuthority: 'NONE',
      requiredCanon: 'docs/ORCHESTRATION_CAPABILITY_CANON.md'
    });
  }

  return planBase(entry, 'DENY', 'NO_CAPABILITY_POLICY', ['capability-specific-policy-required']);
}

export function defaultCapabilityForTask(taskKind) {
  const normalized = boundedText(taskKind, 100);
  return normalized ? TASK_DEFAULTS[normalized] || null : null;
}
