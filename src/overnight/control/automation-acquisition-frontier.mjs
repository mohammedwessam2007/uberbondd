import crypto from 'node:crypto';

export const AUTOMATION_ACQUISITION_FRONTIER_POLICY_VERSION = 'automation-acquisition-frontier-1.1.0';

const ZERO_EFFECTS = Object.freeze({
  providerCalls: 0,
  messages: 0,
  purchases: 0,
  deployments: 0,
  credentialChanges: 0,
  dnsChanges: 0,
  productionMutations: 0,
  spendCents: 0
});

const OBSERVED_AT = '2026-08-28T15:29:00.000Z';

export const EXTENDED_AUTOMATION_CANDIDATES = Object.freeze([
  Object.freeze({
    repo: 'calcom/cal.diy',
    capabilityKey: 'calendar-and-booking-execution',
    capabilityLabel: 'Provider-neutral scheduling and booking execution',
    coverage: 'ADAPTER_GATED',
    sourceMode: 'API_ADAPTER',
    licenseSpdx: 'MIT',
    stars: 47972,
    pushedAt: '2026-08-08T17:13:42.000Z',
    observedAt: OBSERVED_AT,
    patterns: ['availability windows', 'booking lifecycle', 'reschedule/cancel idempotency'],
    existingUberBondModules: ['src/booking-calendar-contract.mjs', 'src/voice-telephony-contract.mjs', 'src/task-universe.mjs'],
    priorities: { economicLeverage: 9, founderMinuteReduction: 10, reuseAcrossOffers: 9, maintenanceBurden: 5, externalEffectRisk: 7 }
  }),
  Object.freeze({
    repo: 'formbricks/formbricks',
    capabilityKey: 'form-and-feedback-ingestion',
    capabilityLabel: 'Forms, intake, surveys, and customer-feedback ingestion',
    coverage: 'MISSING',
    sourceMode: 'PROVIDER_NEUTRAL_PATTERN',
    licenseSpdx: 'NOASSERTION',
    stars: 12834,
    pushedAt: '2026-08-28T15:27:56.000Z',
    observedAt: OBSERVED_AT,
    patterns: ['structured form submissions', 'survey response lifecycle', 'feedback event ingestion'],
    existingUberBondModules: ['src/task-universe.mjs', 'src/store.mjs', 'src/commercial-learning.mjs'],
    priorities: { economicLeverage: 6, founderMinuteReduction: 8, reuseAcrossOffers: 8, maintenanceBurden: 4, externalEffectRisk: 3 }
  }),
  Object.freeze({
    repo: 'documenso/documenso',
    capabilityKey: 'commercial-document-signature',
    capabilityLabel: 'Commercial document and signature lifecycle',
    coverage: 'MISSING',
    sourceMode: 'PROVIDER_NEUTRAL_PATTERN',
    licenseSpdx: 'AGPL-3.0',
    stars: 14791,
    pushedAt: '2026-08-28T13:45:09.000Z',
    observedAt: OBSERVED_AT,
    patterns: ['document lifecycle', 'signature state receipts', 'recipient/signing identity references'],
    existingUberBondModules: ['src/delivery-acceptance.mjs', 'src/task-universe.mjs', 'src/adapter-contracts.mjs'],
    priorities: { economicLeverage: 8, founderMinuteReduction: 8, reuseAcrossOffers: 7, maintenanceBurden: 5, externalEffectRisk: 8 }
  }),
  Object.freeze({
    repo: 'invoiceninja/invoiceninja',
    capabilityKey: 'invoice-and-receivables-automation',
    capabilityLabel: 'Invoice, quote, and receivables lifecycle automation',
    coverage: 'MISSING',
    sourceMode: 'PROVIDER_NEUTRAL_PATTERN',
    licenseSpdx: 'NOASSERTION',
    stars: 10031,
    pushedAt: '2026-08-27T22:54:39.000Z',
    observedAt: OBSERVED_AT,
    patterns: ['invoice lifecycle', 'quote-to-invoice transition', 'receivables follow-up'],
    existingUberBondModules: ['src/revenue.mjs', 'src/payment-provider.mjs', 'src/task-universe.mjs'],
    priorities: { economicLeverage: 10, founderMinuteReduction: 9, reuseAcrossOffers: 9, maintenanceBurden: 5, externalEffectRisk: 7 }
  }),
  Object.freeze({
    repo: 'gitroomhq/postiz-app',
    capabilityKey: 'social-publishing-and-scheduling',
    capabilityLabel: 'Governed social publishing and scheduling',
    coverage: 'MISSING',
    sourceMode: 'PROVIDER_NEUTRAL_PATTERN',
    licenseSpdx: 'AGPL-3.0',
    stars: 35228,
    pushedAt: '2026-08-28T12:15:20.000Z',
    observedAt: OBSERVED_AT,
    patterns: ['cross-channel post scheduling', 'publication receipts', 'provider-specific publishing adapters'],
    existingUberBondModules: ['src/distribution-channel.mjs', 'src/task-universe.mjs', 'src/adapter-contracts.mjs'],
    priorities: { economicLeverage: 8, founderMinuteReduction: 10, reuseAcrossOffers: 8, maintenanceBurden: 6, externalEffectRisk: 7 }
  }),
  Object.freeze({
    repo: 'bigcapitalhq/bigcapital',
    capabilityKey: 'accounting-ledger-export',
    capabilityLabel: 'Receipt-bound double-entry accounting export',
    coverage: 'MISSING',
    sourceMode: 'PROVIDER_NEUTRAL_PATTERN',
    licenseSpdx: 'AGPL-3.0',
    stars: 3868,
    pushedAt: '2026-08-28T16:08:09.000Z',
    observedAt: '2026-08-28T16:12:30.000Z',
    patterns: ['double-entry accounting', 'expense and payment journals', 'currency-separated financial reporting'],
    existingUberBondModules: ['src/commercial-outcome.mjs', 'src/payment-provider.mjs', 'src/receivables-contract.mjs'],
    priorities: { economicLeverage: 8, founderMinuteReduction: 8, reuseAcrossOffers: 8, maintenanceBurden: 6, externalEffectRisk: 4 }
  }),
  Object.freeze({
    repo: 'knadh/listmonk',
    capabilityKey: 'marketing-lifecycle-automation',
    capabilityLabel: 'Newsletter and mailing-list campaign management',
    coverage: 'COMPOSE_REQUIRED',
    sourceMode: 'REFERENCE_ONLY',
    licenseSpdx: 'AGPL-3.0',
    stars: 23155,
    pushedAt: '2026-08-25T16:40:09.000Z',
    observedAt: OBSERVED_AT,
    patterns: ['list segmentation', 'newsletter lifecycle', 'campaign delivery tracking'],
    existingUberBondModules: ['src/outreach-automation.mjs', 'src/send-safety.mjs', 'src/unsubscribe.mjs'],
    priorities: { economicLeverage: 6, founderMinuteReduction: 8, reuseAcrossOffers: 6, maintenanceBurden: 5, externalEffectRisk: 6 }
  })
]);

export const INTERNAL_AUTOMATION_CAPABILITY_REGISTRY = Object.freeze([
  ['voice-reception-and-call-lifecycle', ['src/voice-telephony-contract.mjs']],
  ['browser-action-automation', ['src/browser-action-contract.mjs']],
  ['omnichannel-conversation-transport', ['src/omnichannel-communication-contract.mjs']],
  ['calendar-and-booking-execution', ['src/booking-calendar-contract.mjs']],
  ['external-crm-sync', ['src/external-crm-sync-contract.mjs']],
  ['web-context-extraction-at-scale', ['src/web-context-extraction-contract.mjs']],
  ['invoice-and-receivables-automation', ['src/receivables-contract.mjs']],
  ['form-and-feedback-ingestion', ['src/form-feedback-contract.mjs']],
  ['commercial-document-signature', ['src/commercial-signature-contract.mjs']],
  ['accounting-ledger-export', ['src/accounting-ledger-export-contract.mjs']],
  ['social-publishing-and-scheduling', [
    'src/social-publication-schedule-contract.mjs',
    'src/omnichannel-communication-contract.mjs',
    'src/agent-autonomy-scheduled-run.mjs'
  ]]
].map(([capabilityKey, contractModules]) => Object.freeze({
  capabilityKey,
  contractModules: Object.freeze([...contractModules]),
  satisfactionClass: contractModules.length > 1 ? 'COMPOSED_INTERNAL_CONTRACT' : 'INTERNAL_CONTRACT',
  externalActivation: 'EXTERNAL_PROOF_REQUIRED',
  businessEffectAuthority: 'NONE'
})));

function clone(value) { return structuredClone(value); }
function digest(value) { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function slug(value) {
  const source = String(value ?? '').trim().toLowerCase();
  if (!source || source.length > 120) return null;
  const normalized = source.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return normalized || null;
}
function invalid(reasonCodes, extra = {}) {
  return {
    ok: false,
    policyVersion: AUTOMATION_ACQUISITION_FRONTIER_POLICY_VERSION,
    reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
    businessEffectAuthority: 'NONE',
    externalEffectLedger: clone(ZERO_EFFECTS),
    ...extra
  };
}

function comparableCandidate(candidate) {
  return JSON.stringify(candidate);
}

export function mergeAutomationCandidateSets(baseCandidates = [], additionalCandidates = EXTENDED_AUTOMATION_CANDIDATES) {
  if (!Array.isArray(baseCandidates) || !Array.isArray(additionalCandidates)) {
    return invalid(['candidate-arrays-required']);
  }
  const candidates = [];
  const byRepo = new Map();
  const duplicates = [];
  const conflicts = [];
  [...baseCandidates, ...additionalCandidates].forEach((candidate, index) => {
    const repo = String(candidate?.repo ?? '').trim().toLowerCase();
    if (!repo) {
      conflicts.push({ index, repo: null, reason: 'repository-required' });
      return;
    }
    const prior = byRepo.get(repo);
    if (!prior) {
      const copied = clone(candidate);
      byRepo.set(repo, copied);
      candidates.push(copied);
      return;
    }
    if (comparableCandidate(prior) === comparableCandidate(candidate)) duplicates.push({ repo, index });
    else conflicts.push({ repo, index, reason: 'conflicting-repository-evidence' });
  });
  if (conflicts.length) return invalid(['conflicting-repository-evidence'], { conflicts, duplicates, candidates: [] });
  return {
    ok: true,
    policyVersion: AUTOMATION_ACQUISITION_FRONTIER_POLICY_VERSION,
    candidates,
    candidateCount: candidates.length,
    duplicates,
    businessEffectAuthority: 'NONE',
    externalEffectLedger: clone(ZERO_EFFECTS)
  };
}

function normalizeSatisfiedCapabilityKeys(values) {
  if (!Array.isArray(values)) return invalid(['satisfied-capability-keys-array-required']);
  const result = [];
  const seen = new Set();
  for (const value of values) {
    const normalized = slug(value);
    if (!normalized) return invalid(['invalid-satisfied-capability-key']);
    if (!seen.has(normalized)) {
      seen.add(normalized);
      result.push(normalized);
    }
  }
  result.sort();
  return { ok: true, values: result };
}

function validateInternalCapabilityRegistry(registry = INTERNAL_AUTOMATION_CAPABILITY_REGISTRY) {
  if (!Array.isArray(registry)) return invalid(['internal-capability-registry-array-required']);
  const seen = new Set();
  const entries = [];
  for (const entry of registry) {
    const capabilityKey = slug(entry?.capabilityKey);
    const contractModules = Array.isArray(entry?.contractModules)
      ? [...new Set(entry.contractModules.map(item => String(item ?? '').trim()).filter(Boolean))]
      : [];
    if (!capabilityKey) return invalid(['invalid-internal-capability-key']);
    if (seen.has(capabilityKey)) return invalid(['duplicate-internal-capability-key'], { capabilityKey });
    if (!contractModules.length || contractModules.some(path => !/^src\/[A-Za-z0-9_./-]+\.mjs$/.test(path))) {
      return invalid(['valid-internal-contract-module-required'], { capabilityKey });
    }
    seen.add(capabilityKey);
    entries.push({
      capabilityKey,
      contractModules,
      satisfactionClass: String(entry.satisfactionClass || 'INTERNAL_CONTRACT'),
      externalActivation: 'EXTERNAL_PROOF_REQUIRED',
      businessEffectAuthority: 'NONE'
    });
  }
  entries.sort((a, b) => a.capabilityKey.localeCompare(b.capabilityKey));
  return { ok: true, entries };
}

export function currentInternalSatisfiedCapabilityKeys() {
  const validated = validateInternalCapabilityRegistry();
  return validated.ok ? validated.entries.map(entry => entry.capabilityKey) : [];
}

export function advanceAutomationAcquisitionFrontier({ loopResult, satisfiedCapabilityKeys = [] } = {}) {
  if (!loopResult || loopResult.ok !== true || !Array.isArray(loopResult.ranked)) {
    return invalid(['valid-acquisition-loop-result-required']);
  }
  const normalizedSatisfied = normalizeSatisfiedCapabilityKeys(satisfiedCapabilityKeys);
  if (!normalizedSatisfied.ok) return normalizedSatisfied;
  const satisfied = new Set(normalizedSatisfied.values);
  const ranked = loopResult.ranked.map(item => ({
    ...clone(item),
    internalStepSatisfied: satisfied.has(item?.candidate?.capabilityKey),
    frontierDisposition: satisfied.has(item?.candidate?.capabilityKey)
      ? 'INTERNAL_STEP_SATISFIED'
      : item?.decision === 'BUILD_ADAPTER'
        ? 'ACTIONABLE'
        : 'NON_ACTIONABLE'
  }));
  const selected = ranked.find(item => item.decision === 'BUILD_ADAPTER' && !item.internalStepSatisfied) || null;
  const frontierIdentity = {
    acquisitionDigest: loopResult.acquisitionDigest || null,
    satisfiedCapabilityKeys: normalizedSatisfied.values,
    selected: selected ? {
      repo: selected.candidate.repo,
      capabilityKey: selected.candidate.capabilityKey,
      score: selected.score
    } : null
  };
  return {
    ok: true,
    policyVersion: AUTOMATION_ACQUISITION_FRONTIER_POLICY_VERSION,
    status: selected ? 'NEXT_GAP_SELECTED' : 'NO_REMAINING_ACTIONABLE_GAP',
    satisfiedCapabilityKeys: normalizedSatisfied.values,
    ranked,
    selected,
    frontierDigest: digest(frontierIdentity),
    businessEffectAuthority: 'NONE',
    externalEffectLedger: clone(ZERO_EFFECTS)
  };
}

export function advanceCurrentAutomationAcquisitionFrontier({ loopResult, extraSatisfiedCapabilityKeys = [] } = {}) {
  const registry = validateInternalCapabilityRegistry();
  if (!registry.ok) return registry;
  const extras = normalizeSatisfiedCapabilityKeys(extraSatisfiedCapabilityKeys);
  if (!extras.ok) return extras;
  const satisfiedCapabilityKeys = [...new Set([
    ...registry.entries.map(entry => entry.capabilityKey),
    ...extras.values
  ])].sort();
  const frontier = advanceAutomationAcquisitionFrontier({ loopResult, satisfiedCapabilityKeys });
  if (!frontier.ok) return frontier;
  const evidenceByKey = new Map(registry.entries.map(entry => [entry.capabilityKey, entry]));
  return {
    ...frontier,
    status: frontier.selected ? 'NEXT_UNSATISFIED_INTERNAL_GAP_SELECTED' : 'NO_REMAINING_INTERNAL_BUILD_GAP',
    satisfactionEvidence: frontier.ranked
      .filter(item => item.internalStepSatisfied)
      .map(item => {
        const evidence = evidenceByKey.get(item.candidate.capabilityKey);
        return evidence
          ? { ...clone(evidence), source: 'BRANCH_INTERNAL_CAPABILITY_REGISTRY' }
          : {
              capabilityKey: item.candidate.capabilityKey,
              contractModules: [],
              satisfactionClass: 'CALLER_ASSERTED_INTERNAL_STEP',
              externalActivation: 'EXTERNAL_PROOF_REQUIRED',
              businessEffectAuthority: 'NONE',
              source: 'CALLER_EXTRA_SATISFIED_CAPABILITY'
            };
      }),
    externalActivationStatus: 'UNPROVEN_PROVIDER_AND_CUSTOMER_EFFECTS',
    businessEffectAuthority: 'NONE',
    externalEffectLedger: clone(ZERO_EFFECTS)
  };
}
