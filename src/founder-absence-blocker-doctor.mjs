// What is actually standing between UberBond and running without its founder.
//
// The readiness scorer (src/founder-absence-readiness.mjs) answers "is the
// observation proof good enough". It does not answer "and if not, what kind of
// thing is missing, and who can remove it". Those are different questions, and
// conflating them is how a repository talks itself into CODE_READY: every
// capability is implemented, every test is green, and nobody has an API key, a
// payment account, a sending domain or a single elapsed unattended day.
//
// This module classifies every discovered blocker into exactly one class, and
// derives -- never accepts as an assertion -- which of them are removable by
// writing code in this repository. `softwareGaps` being empty is the exit
// condition of the whole Ragnarok closure mission, so it must be a measurement,
// not a claim. Every row therefore carries a resolution probe that is evaluated
// against the tree, the environment's presence booleans, and externally
// observed evidence supplied by the caller.
//
// Three invariants this file exists to hold:
//
//   1. CODE_READY is unreachable while any credential, account or payment
//      blocker is open. It is the last state, not the first.
//   2. Elapsed-time evidence is never satisfied without an observation proof
//      whose span AND source commit actually match -- and the proof semantics
//      are the ones in founder-absence-readiness.mjs, reused rather than
//      re-derived, because a second implementation of that gate is a second
//      place for it to be wrong.
//   3. Environment variables are read for PRESENCE ONLY. No value in this file
//      is ever read into a report, a reason code, an error, or a hash. Names
//      are configuration; values are credentials.
//
// It performs no network I/O, changes nothing, and carries the canonical zero
// external-effect ledger. Capability never creates authority.

import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import { evaluateFounderAbsenceReadiness } from './founder-absence-readiness.mjs';

export const FOUNDER_ABSENCE_BLOCKER_POLICY_VERSION = 'founder-absence-blocker-doctor-1.0.0';

/** The seven classes. Every discovered blocker lands in exactly one of them. */
export const BLOCKER_CLASSES = Object.freeze([
  'CODE_READY',
  'CREDENTIAL_BLOCKED',
  'ACCOUNT_BLOCKED',
  'PAYMENT_BLOCKED',
  'DISTRIBUTION_BLOCKED',
  'DELIVERABILITY_BLOCKED',
  'ELAPSED_EVIDENCE_PENDING'
]);

// Dependency order. A credential blocker dominates an account blocker because
// an account you cannot authenticate against is not a usable account; payment
// dominates distribution because reaching a buyer you cannot charge is worse
// than not reaching them; and elapsed evidence is last because it can only
// start accruing once everything before it is standing.
//
// CODE_READY is deliberately NOT in this list. It is not a blocking gate: it is
// the name of the state where none of these six is open and no removable
// software gap remains.
export const BLOCKING_CLASS_ORDER = Object.freeze([
  'CREDENTIAL_BLOCKED',
  'ACCOUNT_BLOCKED',
  'PAYMENT_BLOCKED',
  'DISTRIBUTION_BLOCKED',
  'DELIVERABILITY_BLOCKED',
  'ELAPSED_EVIDENCE_PENDING'
]);

/** Subject -> class. Total and injective; a row declares a subject, never a class. */
export const BLOCKER_SUBJECT_CLASS = Object.freeze({
  CODE: 'CODE_READY',
  CREDENTIAL: 'CREDENTIAL_BLOCKED',
  ACCOUNT: 'ACCOUNT_BLOCKED',
  PAYMENT: 'PAYMENT_BLOCKED',
  DISTRIBUTION: 'DISTRIBUTION_BLOCKED',
  DELIVERABILITY: 'DELIVERABILITY_BLOCKED',
  ELAPSED_EVIDENCE: 'ELAPSED_EVIDENCE_PENDING'
});

/** Who or what removes a blocker. Orthogonal to which gate it sits on. */
export const BLOCKER_REMOVABILITY = Object.freeze([
  'SOFTWARE',
  'EXTERNAL_HUMAN_ATOMIC',
  'PROVIDER_ACCEPTANCE',
  'CUSTOMER_REALITY',
  'ELAPSED_TIME',
  'LEGAL_OR_PHYSICAL_IMPOSSIBILITY'
]);

const OPEN_STATUS_FOR_REMOVABILITY = Object.freeze({
  SOFTWARE: 'SOFTWARE_OPEN',
  EXTERNAL_HUMAN_ATOMIC: 'EXTERNAL_HUMAN_ATOMIC',
  PROVIDER_ACCEPTANCE: 'PROVIDER_ACCEPTANCE_REQUIRED',
  CUSTOMER_REALITY: 'CUSTOMER_REALITY_REQUIRED',
  ELAPSED_TIME: 'ELAPSED_TIME_REQUIRED',
  LEGAL_OR_PHYSICAL_IMPOSSIBILITY: 'LEGAL_OR_PHYSICAL_IMPOSSIBILITY'
});

// The statuses a blocker may still hold when the mission is finished. Note what
// is absent: SOFTWARE_OPEN. A software blocker has no resting place -- that is
// the whole point of the exit condition.
export const DEFINITION_OF_DONE_STATUSES = Object.freeze([
  'RESOLVED',
  'VERIFIED_RESOLVED',
  'EXTERNAL_HUMAN_ATOMIC',
  'PROVIDER_ACCEPTANCE_REQUIRED',
  'CUSTOMER_REALITY_REQUIRED',
  'ELAPSED_TIME_REQUIRED',
  'LEGAL_OR_PHYSICAL_IMPOSSIBILITY'
]);

// Statuses that look like a decision and are not one. A row wearing any of
// these is forced open regardless of what its probe says, because "TODO" is
// how an unfinished thing gets counted as a finished one.
export const PROHIBITED_BLOCKER_STATUSES = Object.freeze([
  'TODO', 'FOLLOW_UP', 'IMPLEMENT_LATER', 'NEEDS_RESEARCH', 'UNKNOWN_CODE_GAP',
  'UNTESTED', 'UNDEPLOYED', 'UNWIRED', 'MISSING_DOCTOR', 'MISSING_RECONCILIATION',
  'MISSING_RECOVERY', 'MISSING_RECEIPT', 'MISSING_SCHEMA', 'MISSING_TEST'
]);

// Environment variables consulted for PRESENCE ONLY. This object is the entire
// surface: nothing else in this file touches an environment. The names are
// safe to print; the values are never read into anything that leaves a
// function, and `presenceOf` below is the only reader.
export const ENVIRONMENT_PRESENCE_GROUPS = Object.freeze({
  modelCredential: Object.freeze(['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'AI_GATEWAY_API_KEY']),
  modelPricingEvidence: Object.freeze([
    'AI_GATEWAY_INPUT_USD_PER_MILLION',
    'AI_GATEWAY_OUTPUT_USD_PER_MILLION',
    'AI_GATEWAY_PRICING_SOURCE',
    'AI_GATEWAY_PRICING_VERIFIED_AT'
  ]),
  paymentProvider: Object.freeze(['LEMONSQUEEZY_WEBHOOK_SECRET']),
  emailProviderAccount: Object.freeze([
    'POSTAL_API_KEY', 'INSTANTLY_API_KEY', 'ICEMAIL_API_KEY',
    'MAILFORGE_API_KEY', 'GOOGLE_WORKSPACE_CLIENT_ID'
  ]),
  durableState: Object.freeze(['DATABASE_URL'])
});

function presenceOf(env, name) {
  // The only expression in this module that touches an environment value, and
  // it collapses to a boolean in the same expression. Nothing downstream can
  // recover the string.
  return Boolean(String(env?.[name] ?? '').trim());
}

/** Presence booleans for every consulted variable. Never a value, never a length, never a hash. */
export function deriveEnvironmentPresence(env = {}) {
  const groups = {};
  for (const [group, names] of Object.entries(ENVIRONMENT_PRESENCE_GROUPS)) {
    const keys = names.map(name => ({ name, present: presenceOf(env, name) }));
    groups[group] = {
      keys,
      anyPresent: keys.some(entry => entry.present),
      allPresent: keys.every(entry => entry.present),
      presentCount: keys.filter(entry => entry.present).length
    };
  }
  return groups;
}

function text(value, max = 400) {
  return String(value ?? '').trim().slice(0, max);
}

function referenceDate(value) {
  const candidate = value instanceof Date ? value : new Date(value ?? Date.now());
  return Number.isNaN(candidate.getTime()) ? new Date() : candidate;
}

/**
 * Place one blocker row into exactly one class.
 *
 * Total: an unrecognised subject or removability is a refusal, not a default.
 * A default here would silently absorb a blocker nobody had thought about into
 * whichever class happened to be first.
 */
export function classifyFounderAbsenceBlocker(row = {}) {
  const id = text(row.id, 120);
  const subject = text(row.subject, 40).toUpperCase();
  const removability = text(row.removability, 40).toUpperCase();
  const reasonCodes = [];
  if (!id) reasonCodes.push('blocker-id-required');
  if (!Object.hasOwn(BLOCKER_SUBJECT_CLASS, subject)) reasonCodes.push('blocker-subject-unrecognised');
  if (!BLOCKER_REMOVABILITY.includes(removability)) reasonCodes.push('blocker-removability-unrecognised');
  if (reasonCodes.length) {
    return { ok: false, id: id || null, blockerClass: null, removability: null, reasonCodes };
  }
  return {
    ok: true,
    id,
    title: text(row.title, 300),
    blockerClass: BLOCKER_SUBJECT_CLASS[subject],
    subject,
    removability,
    owner: text(row.owner, 80) || 'UNASSIGNED',
    removedBy: text(row.removedBy, 200),
    reasonCodes: []
  };
}

const NO_PROBES = Object.freeze({
  fileExists: () => false,
  sourceIncludes: () => false
});

function resolveProbe(row, context) {
  const spec = row.resolvedWhen;
  const evidence = [];
  if (!spec || typeof spec !== 'object') {
    return { resolved: false, verified: false, evidence, reasonCodes: ['no-resolution-probe-declared'] };
  }
  const reasonCodes = [];
  const checks = [];

  if (Array.isArray(spec.filesPresent) && spec.filesPresent.length) {
    for (const file of spec.filesPresent) {
      const present = context.probes.fileExists(file) === true;
      checks.push(present);
      evidence.push(`file:${file}=${present ? 'PRESENT' : 'ABSENT'}`);
    }
  }
  if (Array.isArray(spec.sourceIncludes) && spec.sourceIncludes.length) {
    for (const [file, needle] of spec.sourceIncludes) {
      const found = context.probes.sourceIncludes(file, needle) === true;
      checks.push(found);
      evidence.push(`source:${file}~${found ? 'MATCH' : 'NO_MATCH'}`);
    }
  }
  if (spec.sourceIncludesCurrentCommit) {
    const commit = context.currentSourceCommit;
    const found = Boolean(commit) && context.probes.sourceIncludes(spec.sourceIncludesCurrentCommit, commit) === true;
    checks.push(found);
    evidence.push(`canon:${spec.sourceIncludesCurrentCommit}=${found ? 'NAMES_CURRENT_HEAD' : 'DRIFTED_OR_UNKNOWN'}`);
    if (!commit) reasonCodes.push('current-source-commit-required');
  }
  if (spec.environmentAnyOf) {
    const group = context.environmentPresence[spec.environmentAnyOf];
    const ok = Boolean(group?.anyPresent);
    checks.push(ok);
    evidence.push(`env:${spec.environmentAnyOf}.anyPresent=${ok}`);
  }
  if (spec.environmentAllOf) {
    const group = context.environmentPresence[spec.environmentAllOf];
    const ok = Boolean(group?.allPresent);
    checks.push(ok);
    evidence.push(`env:${spec.environmentAllOf}.allPresent=${ok}`);
  }
  if (spec.externalEvidence) {
    // Externally observed facts the repository cannot produce about itself.
    // Absent means unresolved: silence is never evidence of acceptance.
    const observed = context.externalEvidence?.[spec.externalEvidence];
    const ok = observed === true;
    checks.push(ok);
    evidence.push(`external:${spec.externalEvidence}=${ok ? 'OBSERVED' : 'NOT_OBSERVED'}`);
  }
  if (spec.elapsedEvidence) {
    const ok = context.elapsedEvidenceSatisfied === true;
    checks.push(ok);
    evidence.push(`elapsed:observationProof=${ok ? 'SATISFIED' : 'UNSATISFIED'}`);
  }

  if (!checks.length) {
    return { resolved: false, verified: false, evidence, reasonCodes: ['no-resolution-probe-declared'] };
  }
  const resolved = checks.every(Boolean);
  return { resolved, verified: resolved, evidence, reasonCodes };
}

/**
 * The blockers this mission actually discovered, as a machine-readable ledger.
 *
 * Each row names how it would be proven resolved. That is the difference
 * between a status board and a measurement: nothing here says "done" because
 * somebody typed it.
 */
export const RAGNAROK_BLOCKER_LEDGER = Object.freeze([
  {
    id: 'canonical-ledger-copy', subject: 'CODE', removability: 'SOFTWARE', owner: 'executor',
    title: 'A local const redeclared the canonical 8-key zero effect ledger instead of importing it',
    removedBy: 'packet 2.2 -- import ZERO_EXTERNAL_EFFECTS from src/effect-ledgers.mjs',
    resolvedWhen: { sourceIncludes: [['src/free-first-outreach-router.mjs', "from './effect-ledgers.mjs'"]] }
  },
  {
    id: 'unclassified-src-modules', subject: 'CODE', removability: 'SOFTWARE', owner: 'executor',
    title: 'Three new src modules have no entry point and no reachability classification',
    // Resolved either way a module can stop being invisible, and the two are
    // not equal: an operator script that reaches a module is strictly better
    // evidence than an entry in the file that explains why nothing does. The
    // router and the receipt validator earned entry points when the free-first
    // doctor began importing them, at which point the ratchet requires them to
    // be REMOVED from the classification -- so a probe demanding they stay
    // listed would reopen this gap for improving the tree.
    removedBy: 'packet 2.3 -- an operator entry point where one is warranted, a classification where it is not',
    resolvedWhen: {
      sourceIncludes: [
        ['scripts/free-first-outreach-doctor.mjs', 'free-first-outreach-router.mjs'],
        ['scripts/free-first-outreach-doctor.mjs', 'provider-activation-receipt.mjs'],
        ['config/reachability-classification.json', 'src/omnia-v9/integrations/providers/postal-effect-adapter.mjs']
      ]
    }
  },
  {
    id: 'canon-drift', subject: 'CODE', removability: 'SOFTWARE', owner: 'executor',
    title: 'Present-tense canon names a SHA and module counts the tree no longer has',
    removedBy: 'packet 6 -- regenerate readiness, then update CURRENT_SYSTEM_STATE and CURRENT_HANDOFF',
    resolvedWhen: { sourceIncludesCurrentCommit: 'docs/CURRENT_SYSTEM_STATE.md' }
  },
  {
    id: 'postal-adapter-defects', subject: 'DELIVERABILITY', removability: 'SOFTWARE', owner: 'lane-b',
    title: 'Postal adapter treats 409 as definite rejection, has no dispatch timeout, throws without executionId, accepts unprovenanced rows, and maps a bounce to provider rejection',
    removedBy: 'packet 4.B adapter repairs',
    // One probe per claim in the title, each naming the exact construct that
    // would have to go for the defect to come back. The adapter that survived
    // the convergence merge compares against the provenance literal directly
    // rather than through a shared constant, so the probe follows the code
    // rather than the other way round -- a probe that keeps asserting a
    // spelling the tree no longer uses reports a gap that does not exist.
    resolvedWhen: {
      sourceIncludes: [
        ['src/omnia-v9/integrations/providers/postal-effect-adapter.mjs', 'timeoutMs'],
        // 409 is absent from the definite-rejection set, which is the whole
        // claim: an ambiguous conflict may not read as a provider refusal.
        ['src/omnia-v9/integrations/providers/postal-effect-adapter.mjs', 'const DEFINITE_REJECTION_STATUSES = new Set([400, 401, 403, 404, 422]);'],
        // reconcile requires only the business key and the effect identity, so
        // the recovery batch that supplies no executionId no longer throws.
        ['src/omnia-v9/integrations/providers/postal-effect-adapter.mjs', "reconcile requires businessKey and providerEffectIdentity"],
        ['src/omnia-v9/integrations/providers/postal-webhook-evidence.mjs', 'AUTHENTICATED_POSTAL_WEBHOOK'],
        ['src/omnia-v9/integrations/providers/postal-effect-adapter.mjs', "row.provenance !== 'AUTHENTICATED_POSTAL_WEBHOOK'"],
        ['src/omnia-v9/integrations/providers/postal-effect-adapter.mjs', 'negativeDeliveryEvidence']
      ]
    }
  },
  {
    id: 'postal-webhook-evidence-ledger', subject: 'DELIVERABILITY', removability: 'SOFTWARE', owner: 'lane-b',
    title: 'No signed Postal webhook evidence store, so a dispatch outcome can never be reconciled from provider truth',
    removedBy: 'packet 4.B evidence module, ledger, route and migration',
    resolvedWhen: {
      filesPresent: [
        'src/omnia-v9/integrations/providers/postal-webhook-evidence.mjs',
        'src/omnia-v9/integrations/providers/postal-webhook-ledger.mjs',
        'api/webhooks/postal.mjs',
        'migrations/104_postal_webhook_events.sql'
      ]
    }
  },
  {
    id: 'recipient-cap-unenforced', subject: 'DISTRIBUTION', removability: 'SOFTWARE', owner: 'lane-c',
    title: 'The provider registry records recipientCap and nothing compares an audience to it',
    removedBy: 'packet 4.C router change enforcing recipientCap against audienceSize',
    resolvedWhen: { sourceIncludes: [['src/free-first-outreach-router.mjs', 'audienceSize']] }
  },
  {
    id: 'live-state-not-receipt-derived', subject: 'DISTRIBUTION', removability: 'SOFTWARE', owner: 'lane-c',
    title: 'LIVE provider states are free-form caller booleans rather than derivations from validated activation receipts',
    removedBy: 'packet 4.C deriveProviderStatesFromReceipts wired into the router',
    resolvedWhen: {
      filesPresent: ['tests/provider-activation-receipt.test.mjs'],
      sourceIncludes: [['src/free-first-outreach-router.mjs', 'activationReceipts']]
    }
  },
  {
    id: 'no-payment-rail-doctor', subject: 'PAYMENT', removability: 'SOFTWARE', owner: 'lane-d',
    title: 'No doctor states which payment rail exists and what would make it live',
    removedBy: 'packet 4.D payment rail doctor',
    resolvedWhen: { filesPresent: ['src/payment-rail-doctor.mjs', 'tests/payment-rail-doctor.test.mjs'] }
  },
  {
    id: 'no-paid-to-complete-sprint-machine', subject: 'PAYMENT', removability: 'SOFTWARE', owner: 'lane-d',
    title: 'No PAID to COMPLETE fulfilment state machine composing the existing fulfilment engine',
    removedBy: 'packet 4.D sprint fulfilment layer',
    // The requirement was a PAID-to-COMPLETE machine that *composes* the
    // existing fulfilment engine, so the probe checks for the composition
    // rather than for a file name. A second parallel state machine would
    // satisfy a filename check and fail the actual requirement, which is what
    // the Ragnarok branch had built before this merge replaced it.
    resolvedWhen: {
      filesPresent: ['src/lead-path-sprint-fulfillment.mjs'],
      sourceIncludes: [
        ['src/lead-path-sprint-fulfillment.mjs', "from './service-fulfillment.mjs'"],
        ['src/lead-path-sprint-fulfillment.mjs', 'COMPLETE'],
        ['src/lead-path-sprint-fulfillment.mjs', 'validExternalCustomerEvidence'],
        ['tests/night-payment-customer-binding.test.mjs', 'advanceLeadPathSprint']
      ]
    }
  },
  {
    id: 'no-first-cash-canary-packet', subject: 'DISTRIBUTION', removability: 'SOFTWARE', owner: 'lane-d',
    title: 'No machine-consumable answer to the nineteen first-cash questions',
    removedBy: 'packet 4.D first-cash canary packet',
    resolvedWhen: { filesPresent: ['src/first-cash-canary-packet.mjs', 'tests/first-cash-canary-packet.test.mjs'] }
  },
  {
    id: 'no-founder-absence-blocker-classifier', subject: 'ELAPSED_EVIDENCE', removability: 'SOFTWARE', owner: 'lane-e',
    title: 'No classifier placing every discovered blocker into exactly one class with a derived software-gap set',
    removedBy: 'packet 4.E founder-absence blocker doctor',
    resolvedWhen: {
      filesPresent: [
        'src/founder-absence-blocker-doctor.mjs',
        'tests/founder-absence-blocker-doctor.test.mjs',
        'scripts/founder-absence-doctor.mjs'
      ]
    }
  },
  {
    id: 'no-domain-purpose-plan', subject: 'DELIVERABILITY', removability: 'SOFTWARE', owner: 'lane-e',
    title: 'No plan separating product, outbound, reply, tracking, transactional and testing hosts across the owned roots',
    removedBy: 'packet 4.E domain purpose plan',
    resolvedWhen: {
      filesPresent: [
        'src/domain-purpose-plan.mjs',
        'tests/domain-purpose-plan.test.mjs',
        'scripts/domain-purpose-plan.mjs'
      ]
    }
  },
  {
    id: 'no-ai-gateway-executor', subject: 'CREDENTIAL', removability: 'SOFTWARE', owner: 'lane-g',
    title: 'No gateway executor, so a configured provider could not be routed to even if one existed',
    removedBy: 'packet 4.G Vercel AI Gateway executor and hostile failover suite',
    resolvedWhen: {
      filesPresent: [
        'src/vercel-ai-gateway-executor.mjs',
        'src/model-provider-doctor.mjs',
        'tests/agent-model-failover-hostile.test.mjs'
      ]
    }
  },
  {
    id: 'zero-configured-model-providers', subject: 'CREDENTIAL', removability: 'EXTERNAL_HUMAN_ATOMIC', owner: 'owner',
    title: 'No model provider credential and no pricing evidence, so every provider is DISABLED by refusal',
    removedBy: 'one API key plus four pricing-evidence variables',
    resolvedWhen: { environmentAnyOf: 'modelCredential', environmentAllOf: 'modelPricingEvidence' },
    ownerAction: {
      action: 'Create one AI Gateway API key and set it with the four AI_GATEWAY pricing-evidence variables',
      screen: 'Vercel dashboard -> AI Gateway -> API Keys, then the UberBond project Environment Variables screen',
      minutes: 10,
      cost: 'Free to create the key; model usage is billed per token afterwards',
      evidenceOfCompletion: 'npm run founder-absence:doctor reports modelCredential.anyPresent true and modelPricingEvidence.allPresent true'
    }
  },
  {
    id: 'zero-payment-provider-account', subject: 'PAYMENT', removability: 'EXTERNAL_HUMAN_ATOMIC', owner: 'owner',
    title: 'No payment provider account exists, so the reconciliation chain has nothing to verify a payment against',
    removedBy: 'a Lemon Squeezy store plus its webhook signing secret',
    resolvedWhen: { environmentAnyOf: 'paymentProvider' },
    ownerAction: {
      action: 'Create the Lemon Squeezy store and set LEMONSQUEEZY_WEBHOOK_SECRET',
      screen: 'Lemon Squeezy -> Settings -> Webhooks, then the UberBond project Environment Variables screen',
      minutes: 25,
      cost: 'Free to create; provider fees apply per transaction and payout requires identity verification',
      evidenceOfCompletion: 'A signed test webhook is accepted by api/webhooks/billing.mjs and lands one durable inbox row'
    }
  },
  {
    id: 'zero-activated-email-provider-accounts', subject: 'ACCOUNT', removability: 'EXTERNAL_HUMAN_ATOMIC', owner: 'owner',
    title: 'Every provider activation receipt is NOT_STARTED, so live usable transport capacity is zero',
    removedBy: 'GitHub issue #278 -- activate at least one free-tier provider account',
    resolvedWhen: { environmentAnyOf: 'emailProviderAccount' },
    ownerAction: {
      action: 'Activate one free-tier email provider account and record its activation receipt',
      screen: 'The chosen provider signup flow, then GitHub issue #278',
      minutes: 20,
      cost: 'Free tier; no card required for the providers on the reviewed registry',
      evidenceOfCompletion: 'A validated activation receipt derives configured and active true, and liveUsableCapacity30d stops being zero'
    }
  },
  {
    id: 'no-sending-domain-dns-configured', subject: 'DELIVERABILITY', removability: 'EXTERNAL_HUMAN_ATOMIC', owner: 'owner',
    title: 'No SPF, DKIM or DMARC records exist on either owned root, so no host can authenticate mail',
    removedBy: 'publishing the provider-supplied records on the owned zones',
    resolvedWhen: { externalEvidence: 'sendingDomainDnsVerified' },
    ownerAction: {
      action: 'Publish the provider-supplied SPF, DKIM and DMARC records for the outbound host',
      screen: 'The registrar DNS editor for uberbond.agency and uberbond.cloud',
      minutes: 20,
      cost: 'Free; the domains are already owned and nothing is purchased',
      evidenceOfCompletion: 'npm run domain:plan -- --live reports the outbound host VERIFIED from a DNS observation under 24 hours old'
    }
  },
  {
    id: 'vercel-api-scope-forbidden', subject: 'CREDENTIAL', removability: 'PROVIDER_ACCEPTANCE', owner: 'owner',
    title: 'Vercel list_deployments returns 403 and get_project returns 404, so deployment state is unreadable from this path',
    removedBy: 're-authorizing the Vercel connector for the owning team',
    resolvedWhen: { externalEvidence: 'vercelApiScopeRestored' }
  },
  {
    id: 'branch-deletion-forbidden', subject: 'CREDENTIAL', removability: 'PROVIDER_ACCEPTANCE', owner: 'owner',
    title: 'git push --delete returns 403 for every branch while ordinary pushes succeed; 76 dead branches remain',
    removedBy: 'a token scope change on the GitHub side',
    resolvedWhen: { externalEvidence: 'branchDeletionPermitted' }
  },
  {
    id: 'omniroute-install-denied', subject: 'ACCOUNT', removability: 'PROVIDER_ACCEPTANCE', owner: 'host',
    title: 'The host permission classifier denied the OmniRoute global install; it was not routed around',
    removedBy: 'a host decision, not a workaround',
    resolvedWhen: { externalEvidence: 'omniRouteInstallPermitted' }
  },
  {
    id: 'cold-b2b-transport-zero', subject: 'DISTRIBUTION', removability: 'PROVIDER_ACCEPTANCE', owner: 'providers',
    title: 'Proven free cold-B2B transport across the entire reviewed pool is zero per day',
    removedBy: 'a self-hosted lawful path with DNS and reputation, or a provider that permits it in writing',
    resolvedWhen: { externalEvidence: 'coldB2bTransportProven' }
  },
  {
    id: 'zero-customers-zero-revenue', subject: 'DISTRIBUTION', removability: 'CUSTOMER_REALITY', owner: 'market',
    title: 'Zero real customers, zero cleared revenue, zero accepted deliveries, zero retained customers',
    removedBy: 'an independent external buyer; no amount of code can move these four numbers',
    resolvedWhen: { externalEvidence: 'clearedPaymentObserved' }
  },
  {
    id: 'founder-absence-elapsed-proof', subject: 'ELAPSED_EVIDENCE', removability: 'ELAPSED_TIME', owner: 'clock',
    title: 'No observation window of real unattended days exists at the current source commit',
    removedBy: 'real elapsed time; a timestamp cannot be manufactured',
    resolvedWhen: { elapsedEvidence: true }
  }
]);

/**
 * Elapsed-time evidence, reusing the readiness kernel's observation-proof
 * semantics rather than restating them.
 *
 * `evaluateFounderAbsenceReadiness` already knows that a proof needs a span at
 * least as long as the target, a freshness stamp that is neither future-dated
 * nor stale, zero unauthorized effects, zero open dead letters, zero abandoned
 * cycles, zero undelivered escalations, and a source commit and policy set
 * matching the tree it claims to describe. This function calls that gate and
 * then re-states only the two conditions the mission brief singles out -- span
 * and source commit -- as separate, independently readable booleans, so a
 * reader can see them without parsing a reason-code list.
 *
 * They are additional requirements, not substitutes. Removing the reused gate
 * would not be compensated for by them.
 */
export function evaluateElapsedEvidence({
  observationProof = {},
  currentSourceCommit = null,
  currentPolicyVersions = [],
  capabilities = {},
  targetDays = 7,
  now = new Date(),
  maxProofAgeMs
} = {}) {
  const readiness = evaluateFounderAbsenceReadiness({
    capabilities,
    targetDays,
    observationProof,
    currentSourceCommit,
    currentPolicyVersions,
    now,
    ...(Number.isSafeInteger(maxProofAgeMs) ? { maxProofAgeMs } : {})
  });

  if (!readiness.ok) {
    return {
      satisfied: false,
      readinessStatus: readiness.status,
      proofValid: false,
      spanSatisfied: false,
      sourceCommitMatches: false,
      observedSpanMs: null,
      requiredSpanMs: null,
      reasonCodes: [...new Set(['readiness-evaluation-refused', ...(readiness.reasonCodes || [])])]
    };
  }

  const proof = readiness.observationProof;
  const spanSatisfied = Number.isFinite(proof.observedSpanMs)
    && Number.isFinite(proof.requiredSpanMs)
    && proof.observedSpanMs >= proof.requiredSpanMs;
  const declared = text(currentSourceCommit, 80);
  const sourceCommitMatches = Boolean(declared) && proof.sourceCommit === declared;

  const reasonCodes = [...(proof.reasonCodes || [])];
  if (!spanSatisfied) reasonCodes.push('observation-span-shorter-than-target');
  if (!sourceCommitMatches) reasonCodes.push('observation-source-commit-does-not-match-current-head');

  return {
    satisfied: proof.valid === true && spanSatisfied && sourceCommitMatches,
    readinessStatus: readiness.status,
    proofValid: proof.valid === true,
    spanSatisfied,
    sourceCommitMatches,
    observedSpanMs: proof.observedSpanMs,
    requiredSpanMs: proof.requiredSpanMs,
    reasonCodes: [...new Set(reasonCodes)]
  };
}

function ownerActionCard(row) {
  const card = row.ownerAction;
  if (!card || typeof card !== 'object') return null;
  const minutes = Number(card.minutes);
  return {
    blockerId: row.id,
    blockerClass: BLOCKER_SUBJECT_CLASS[String(row.subject || '').toUpperCase()] || null,
    action: text(card.action, 300),
    screen: text(card.screen, 300),
    minutes: Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes) : null,
    cost: text(card.cost, 200),
    evidenceOfCompletion: text(card.evidenceOfCompletion, 300)
  };
}

function cardComplete(card) {
  return Boolean(card && card.action && card.screen && card.minutes !== null && card.cost && card.evidenceOfCompletion);
}

/**
 * The doctor.
 *
 * Everything derived, nothing asserted: the caller supplies probes and observed
 * evidence, and this function decides what that means. It never accepts a
 * `softwareGaps` array, a `status`, or a resolution claim as an input.
 */
export function evaluateFounderAbsenceBlockers({
  blockers = RAGNAROK_BLOCKER_LEDGER,
  env = {},
  probes = NO_PROBES,
  externalEvidence = {},
  observationProof = {},
  capabilities = {},
  currentSourceCommit = null,
  currentPolicyVersions = [],
  targetDays = 7,
  maxProofAgeMs,
  now = new Date()
} = {}) {
  const at = referenceDate(now);
  const timestamp = at.toISOString();
  const environmentPresence = deriveEnvironmentPresence(env);
  const safeProbes = {
    fileExists: typeof probes?.fileExists === 'function' ? probes.fileExists : NO_PROBES.fileExists,
    sourceIncludes: typeof probes?.sourceIncludes === 'function' ? probes.sourceIncludes : NO_PROBES.sourceIncludes
  };
  const rows = Array.isArray(blockers) ? blockers : [];

  const elapsedEvidence = evaluateElapsedEvidence({
    observationProof, currentSourceCommit, currentPolicyVersions, capabilities, targetDays, now: at, maxProofAgeMs
  });

  const context = {
    probes: safeProbes,
    environmentPresence,
    externalEvidence: externalEvidence && typeof externalEvidence === 'object' ? externalEvidence : {},
    currentSourceCommit: text(currentSourceCommit, 80) || null,
    elapsedEvidenceSatisfied: elapsedEvidence.satisfied
  };

  const unclassifiable = [];
  const classified = [];
  for (const row of rows) {
    const placement = classifyFounderAbsenceBlocker(row);
    if (!placement.ok) {
      unclassifiable.push({ id: placement.id, reasonCodes: placement.reasonCodes });
      continue;
    }
    const probe = resolveProbe(row, context);
    const declaredStatus = text(row.declaredStatus, 60).toUpperCase();
    const prohibited = PROHIBITED_BLOCKER_STATUSES.includes(declaredStatus);
    const open = prohibited || !probe.resolved;
    const card = ownerActionCard(row);
    const reasonCodes = [...probe.reasonCodes];
    if (prohibited) reasonCodes.push('prohibited-placeholder-status');
    if (placement.removability === 'EXTERNAL_HUMAN_ATOMIC' && open && !cardComplete(card)) {
      reasonCodes.push('owner-action-card-incomplete');
    }
    classified.push({
      id: placement.id,
      title: placement.title,
      blockerClass: placement.blockerClass,
      subject: placement.subject,
      removability: placement.removability,
      owner: placement.owner,
      removedBy: placement.removedBy,
      open,
      status: open ? OPEN_STATUS_FOR_REMOVABILITY[placement.removability] : (probe.verified ? 'VERIFIED_RESOLVED' : 'RESOLVED'),
      resolutionEvidence: probe.evidence,
      ownerAction: card,
      reasonCodes: [...new Set(reasonCodes)]
    });
  }

  // Derived, never supplied. A software gap is an open row whose removability
  // is SOFTWARE -- which is a fact about a probe against the tree, not about
  // anybody's opinion of how finished the tree is.
  const softwareGaps = classified.filter(row => row.open && row.removability === 'SOFTWARE');

  const classCounts = Object.fromEntries(BLOCKER_CLASSES.map(name => [name, { open: 0, resolved: 0 }]));
  for (const row of classified) {
    const bucket = classCounts[row.blockerClass];
    if (row.open) bucket.open += 1; else bucket.resolved += 1;
  }

  // A tree that is still being changed cannot also be the tree an unattended
  // observation window ran against. This is not a policy choice bolted on: it
  // is the same source-commit identity the readiness kernel already enforces,
  // applied one step earlier so the doctor never reports a clean elapsed gate
  // while its own source is still moving.
  const softwareStillChanging = softwareGaps.length > 0;
  if (softwareStillChanging) {
    classCounts.ELAPSED_EVIDENCE_PENDING.open = Math.max(1, classCounts.ELAPSED_EVIDENCE_PENDING.open);
  }

  const firstBlockingClass = BLOCKING_CLASS_ORDER.find(name => classCounts[name].open > 0) || null;
  const overallStatus = firstBlockingClass || (softwareGaps.length === 0 ? 'CODE_READY' : 'ELAPSED_EVIDENCE_PENDING');

  const ownerActionQueue = BLOCKING_CLASS_ORDER
    .flatMap(name => classified.filter(row => row.open && row.blockerClass === name && row.removability === 'EXTERNAL_HUMAN_ATOMIC'))
    .map(row => row.ownerAction)
    .filter(cardComplete)
    .slice(0, 3);

  const openStatuses = [...new Set(classified.filter(row => row.open).map(row => row.status))];
  const definitionOfDone = {
    satisfied: unclassifiable.length === 0
      && softwareGaps.length === 0
      && openStatuses.every(status => DEFINITION_OF_DONE_STATUSES.includes(status)),
    openStatuses,
    prohibitedStatusRows: classified.filter(row => row.reasonCodes.includes('prohibited-placeholder-status')).map(row => row.id),
    disallowedOpenStatuses: openStatuses.filter(status => !DEFINITION_OF_DONE_STATUSES.includes(status))
  };

  return {
    ok: unclassifiable.length === 0,
    policyVersion: FOUNDER_ABSENCE_BLOCKER_POLICY_VERSION,
    timestamp,
    targetDays,
    currentSourceCommit: context.currentSourceCommit,
    overallStatus,
    firstBlockingClass,
    classCounts,
    blockers: classified,
    unclassifiable,
    // The mission's exit condition, as a measurement.
    softwareGaps: softwareGaps.map(row => row.id),
    softwareGapDetail: softwareGaps.map(row => ({
      id: row.id, owner: row.owner, blockerClass: row.blockerClass, removedBy: row.removedBy, resolutionEvidence: row.resolutionEvidence
    })),
    environmentPresence,
    elapsedEvidence: { ...elapsedEvidence, forcedOpenBySoftwareChange: softwareStillChanging },
    ownerActionQueue,
    ownerActionQueueLength: ownerActionQueue.length,
    definitionOfDone,
    // Reading this file cannot authorize contacting anyone, spending anything,
    // or changing any DNS record. It is a report.
    businessEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS }
  };
}

// ---------------------------------------------------------------------------
// Convergence-lane API
// ---------------------------------------------------------------------------

/** The class each supplied blocker group maps to, in the order that decides. */
const SUPPLIED_GROUP_CLASS = Object.freeze([
  ['credentials', 'CREDENTIAL_BLOCKED'],
  ['accounts', 'ACCOUNT_BLOCKED'],
  ['payment', 'PAYMENT_BLOCKED'],
  ['distribution', 'DISTRIBUTION_BLOCKED'],
  ['deliverability', 'DELIVERABILITY_BLOCKED'],
  ['elapsedEvidence', 'ELAPSED_EVIDENCE_PENDING']
]);

const strings = value => (Array.isArray(value) ? value.filter(Boolean).map(String) : []);

/**
 * Classify blocker groups that a caller has already established.
 *
 * This is the pure half of the doctor: given groups, which class is blocking,
 * and is the elapsed-observation proof good enough to say CODE_READY. It does
 * not look at the tree. `evaluateFounderAbsenceBlockers` is the half that
 * measures, and it is the one to call when the question is "what is actually
 * true right now" -- a caller passing this function an empty `softwareGaps`
 * gets `CODE_READY`, which is an answer about the argument, not about UberBond.
 *
 * Two rules that differ from a naive reading:
 *
 * An open software gap does not overwrite an external class. A run with a
 * missing credential and an unfinished module is credential-blocked *and*
 * unfinished; reporting only the software gap would hide the blocker a person
 * has to act on, and reporting only the gap as "distribution" would misfile it
 * entirely. The gaps travel in their own field, where nothing can mask them.
 *
 * Absent proof of elapsed observation, the answer is never CODE_READY. Software
 * that has never been observed running unattended is software nobody has
 * watched, and the missing evidence is the finding.
 */
export function classifyFounderAbsenceBlockers({
  credentials = [], accounts = [], payment = [], distribution = [], deliverability = [],
  elapsedEvidence = [], softwareGaps = [], ownerActions = [], observationProof = null
} = {}) {
  const groups = {
    credentials: strings(credentials),
    accounts: strings(accounts),
    payment: strings(payment),
    distribution: strings(distribution),
    deliverability: strings(deliverability),
    elapsedEvidence: strings(elapsedEvidence)
  };
  const gaps = strings(softwareGaps);

  let overall = null;
  for (const [group, blockerClass] of SUPPLIED_GROUP_CLASS) {
    if (groups[group].length) { overall = blockerClass; break; }
  }

  if (!overall) {
    const proof = observationProof;
    const proven = proof?.ok === true
      && Array.isArray(proof.reasonCodes)
      && proof.reasonCodes.length === 0
      && Boolean(proof.observationProof?.sourceCommit);
    overall = proven && gaps.length === 0 ? 'CODE_READY' : 'ELAPSED_EVIDENCE_PENDING';
  }

  return {
    ok: gaps.length === 0,
    policyVersion: FOUNDER_ABSENCE_BLOCKER_POLICY_VERSION,
    overall,
    blockerGroups: groups,
    softwareGaps: gaps,
    ownerActionQueue: (Array.isArray(ownerActions) ? ownerActions : []).slice(0, 3),
    businessEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS }
  };
}
