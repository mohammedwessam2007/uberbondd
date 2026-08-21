import { evaluateFounderAbsenceReadiness } from './founder-absence-readiness.mjs';

export const AGENT_MESH_ACTIVATION_POLICY_VERSION = 'agent-mesh-activation-gate-1.0.0';

const CORE = Object.freeze([
  'repositoryVerification',
  'durableState',
  'agentRelay',
  'boundedBudgets',
  'truthReceipts',
  'killSwitch',
  'ownerEscalationQueue'
]);

const LIVE = Object.freeze([
  'scheduler',
  'agentWorkers'
]);

const PROVIDERS = Object.freeze(['openai', 'anthropic']);
const VALID_ARCHITECTURE = new Set(['TEST_VERIFIED', 'VERIFIED_LIVE']);

function text(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

function normalizeEvidence(input = {}) {
  const refs = Array.isArray(input.evidenceRefs)
    ? [...new Set(input.evidenceRefs.map(value => text(value, 500)).filter(Boolean))].slice(0, 50)
    : [];
  const typed = refs.filter(value => /^(receipt|issue|github|deployment|test|audit|payment|delivery|doc|provider):/i.test(value));
  return {
    status: text(input.status, 80).toUpperCase() || 'UNKNOWN',
    evidenceRefs: refs,
    evidenceValid: refs.length > 0 && refs.length === typed.length,
    externallyVerified: input.externallyVerified === true,
    enabled: input.enabled === true,
    detail: text(input.detail, 500)
  };
}

function fail(reasonCodes, status = 'BLOCKED', extra = {}) {
  return {
    ok: false,
    policyVersion: AGENT_MESH_ACTIVATION_POLICY_VERSION,
    status,
    reasonCodes: [...new Set((reasonCodes || []).filter(Boolean))],
    businessEffectAuthority: 'NONE',
    ...extra
  };
}

function providerState(provider, input = {}) {
  const normalized = normalizeEvidence(input);
  return {
    provider,
    ...normalized,
    credentialPresent: input.credentialPresent === true,
    pricingEvidencePresent: input.pricingEvidencePresent === true,
    computeBudgetAuthorized: input.computeBudgetAuthorized === true,
    canaryReceiptPresent: input.canaryReceiptPresent === true
  };
}

export function evaluateAgentMeshActivation({
  capabilities = {},
  providers = {},
  ownerComputeAuthorization = false,
  cloudCycleEnabled = false,
  targetDays = 7
} = {}) {
  const normalizedCapabilities = Object.fromEntries(
    [...new Set([...CORE, ...LIVE])].map(name => [name, normalizeEvidence(capabilities[name])])
  );
  const normalizedProviders = Object.fromEntries(
    PROVIDERS.map(provider => [provider, providerState(provider, providers[provider])])
  );

  const blockers = [];
  const architectureMissing = [];
  const liveMissing = [];

  for (const name of CORE) {
    const item = normalizedCapabilities[name];
    if (!VALID_ARCHITECTURE.has(item.status) || !item.evidenceValid) architectureMissing.push(name);
  }

  for (const name of LIVE) {
    const item = normalizedCapabilities[name];
    if (item.status !== 'VERIFIED_LIVE' || !item.evidenceValid || !item.externallyVerified) liveMissing.push(name);
  }

  if (normalizedCapabilities.killSwitch.enabled !== true) blockers.push('kill-switch-not-enabled');
  if (normalizedCapabilities.repositoryVerification.status !== 'TEST_VERIFIED' && normalizedCapabilities.repositoryVerification.status !== 'VERIFIED_LIVE') {
    blockers.push('clean-repository-verification-required');
  }

  const providerReadyForCanary = {};
  for (const provider of PROVIDERS) {
    const state = normalizedProviders[provider];
    const ready = VALID_ARCHITECTURE.has(state.status)
      && state.evidenceValid
      && state.credentialPresent
      && state.pricingEvidencePresent
      && state.computeBudgetAuthorized
      && ownerComputeAuthorization === true;
    providerReadyForCanary[provider] = ready;
  }

  const providerLive = Object.fromEntries(PROVIDERS.map(provider => [provider,
    normalizedProviders[provider].status === 'VERIFIED_LIVE'
      && normalizedProviders[provider].externallyVerified
      && normalizedProviders[provider].canaryReceiptPresent
  ]));

  let status = 'ARCHITECTURE_ONLY';
  let permittedMode = 'NO_PROVIDER_CALLS';

  if (!architectureMissing.length && !blockers.length) {
    status = 'OFFLINE_REHEARSAL_READY';
    permittedMode = 'SYNTHETIC_ONLY';
  }

  if (status === 'OFFLINE_REHEARSAL_READY' && Object.values(providerReadyForCanary).some(Boolean)) {
    status = 'BOUNDED_COMPUTE_CANARY_READY';
    permittedMode = 'ONE_PROVIDER_CANARY';
  }

  if (status === 'BOUNDED_COMPUTE_CANARY_READY'
      && !liveMissing.length
      && Object.values(providerLive).every(Boolean)
      && cloudCycleEnabled === true) {
    status = 'DEVICE_OFF_MESH_REHEARSAL_READY';
    permittedMode = 'BOUNDED_CLOUD_REHEARSAL';
  }

  // Founder-absence scoring deliberately receives only evidence states. It is
  // informational here and cannot upgrade the activation state on its own.
  const absenceCapabilities = {
    durableState: capabilities.durableState,
    scheduler: capabilities.scheduler,
    agentRelay: capabilities.agentRelay,
    agentWorkers: capabilities.agentWorkers,
    boundedBudgets: capabilities.boundedBudgets,
    staleRecovery: capabilities.staleRecovery,
    truthReceipts: capabilities.truthReceipts,
    killSwitch: capabilities.killSwitch,
    paymentObservation: capabilities.paymentObservation,
    deliveryObservation: capabilities.deliveryObservation,
    ownerEscalationQueue: capabilities.ownerEscalationQueue
  };
  const founderAbsence = evaluateFounderAbsenceReadiness({ capabilities: absenceCapabilities, targetDays });

  const nextGates = [];
  for (const item of architectureMissing) nextGates.push(`VERIFY_ARCHITECTURE:${item}`);
  for (const item of blockers) nextGates.push(`BLOCKER:${item}`);
  if (status === 'OFFLINE_REHEARSAL_READY' && !Object.values(providerReadyForCanary).some(Boolean)) {
    nextGates.push('AUTHORIZE_ONE_BOUNDED_PROVIDER_CANARY');
  }
  if (status === 'BOUNDED_COMPUTE_CANARY_READY') {
    for (const provider of PROVIDERS) if (!providerLive[provider]) nextGates.push(`VERIFY_PROVIDER_LIVE:${provider}`);
    for (const item of liveMissing) nextGates.push(`VERIFY_LIVE:${item}`);
    if (!cloudCycleEnabled) nextGates.push('ENABLE_BOUNDED_CLOUD_CYCLE_AFTER_LIVE_PROOF');
  }

  return {
    ok: true,
    policyVersion: AGENT_MESH_ACTIVATION_POLICY_VERSION,
    status,
    permittedMode,
    architectureMissing,
    liveMissing,
    blockers,
    providerReadyForCanary,
    providerLive,
    capabilities: normalizedCapabilities,
    providers: normalizedProviders,
    founderAbsence,
    nextGates: [...new Set(nextGates)].slice(0, 20),
    businessEffectAuthority: 'NONE'
  };
}
