// What can this environment actually route to, and what is the smallest human
// action that changes the answer?
//
// `describeProviderReadiness` already answers the first half per provider. What
// nothing answered was the question above it: with these providers in this
// state, is failover possible at all, and if not, what exactly does a person
// have to do? Today every lane reports `ready: false`, which means
// `executeWithFailover` has a routing order, a classifier, an exhaustion
// terminal -- and nowhere to route. That is not a code defect and no further
// code removes it.
//
// So this doctor is deliberately shaped as a blocker classifier rather than a
// dashboard. Its most important output is the owner-action queue: at most three
// atomic actions, each naming the screen, the minutes, the money and the
// evidence that proves it was done. A doctor that prints red without naming the
// action is a status light, not a doctor.
//
// It also writes down the routing law, because the law is the reason this
// component exists and an unwritten law is one somebody re-litigates. Routing
// around an exhausted or unavailable provider is pre-authorized: no approval,
// no ticket, no pause. Evading a quota, farming accounts, rotating identities,
// breaching provider terms or concealing which model served are forbidden --
// and they are forbidden by the same sentence that grants the routing, because
// the grant is "go somewhere else", never "get more out of here".
//
// This performs no I/O of any kind. It reads presence booleans out of an env
// object and returns a report. It never reads, prints, returns or persists a
// credential value.

import {
  describeProviderReadiness,
  describeGatewayProviderReadiness
} from './agent-model-executor-factory.mjs';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const MODEL_PROVIDER_DOCTOR_POLICY_VERSION = 'model-provider-doctor-1.0.0';

/**
 * The owner law, encoded where a reader will find it.
 *
 * `terminalWhenAllExhausted` names the status `executeWithFailover` already
 * returns. It is written here so the doctor's statement of the law and the
 * runtime's behaviour cannot drift into two different answers about what
 * happens when there is nowhere left to go: it stops and says so. It does not
 * loop, and it does not wait for a provider to refill.
 */
export const MODEL_ROUTING_AUTHORITY_LAW = Object.freeze({
  preAuthorized: Object.freeze([
    'ROUTE_AROUND_EXHAUSTED_PROVIDER',
    'ROUTE_AROUND_RATE_LIMITED_PROVIDER',
    'ROUTE_AROUND_PROVIDER_OUTAGE',
    'ROUTE_AROUND_UNAVAILABLE_MODEL',
    'CROSS_PROVIDER_AND_CROSS_MODEL_FAMILY_FALLBACK'
  ]),
  forbidden: Object.freeze([
    'QUOTA_EVASION',
    'ACCOUNT_FARMING',
    'IDENTITY_ROTATION_TO_DEFEAT_LIMITS',
    'PROVIDER_TERM_VIOLATION',
    'CONCEALING_WHICH_MODEL_SERVED'
  ]),
  // An unknown outcome is not a licence to retry. Whether the same task may run
  // twice is the caller's declaration about the task, never the router's guess.
  uncertainOutcomeRetryRequiresDeclaredIdempotency: true,
  terminalWhenAllExhausted: 'ALL_ROUTES_EXHAUSTED',
  loopsWhenAllExhausted: false,
  // Routing is a lane decision. It cannot widen budget, data scope, security
  // scope or consequence authority, and no fallback grants business effect.
  routingWidensAuthority: false
});

const STATUSES = Object.freeze({
  NO_MODEL_PROVIDER_CONFIGURED: 'NO_MODEL_PROVIDER_CONFIGURED',
  SINGLE_PROVIDER_NO_FAILOVER: 'SINGLE_PROVIDER_NO_FAILOVER',
  MODEL_PROVIDER_FAILOVER_READY: 'MODEL_PROVIDER_FAILOVER_READY'
});

export const MODEL_PROVIDER_DOCTOR_STATUSES = STATUSES;

// One action per blocker class, so the queue never grows a fourth entry by
// listing the same missing credential under two providers.
const OWNER_ACTIONS = Object.freeze({
  GATEWAY_CREDENTIAL: Object.freeze({
    id: 'ACTIVATE_VERCEL_AI_GATEWAY_CREDENTIAL',
    action: 'Create a Vercel AI Gateway API key and set AI_GATEWAY_API_KEY in the runtime environment.',
    screen: 'https://vercel.com/dashboard -> AI Gateway -> API Keys -> Create Key',
    minutes: 5,
    costUsd: 0,
    costNote: 'Key creation is free. Model calls made through it are billed by Vercel at usage rates.',
    evidenceOfCompletion: 'npm run providers:doctor reports vercel-ai-gateway credentialPresent: true'
  }),
  GATEWAY_PRICING: Object.freeze({
    id: 'RECORD_AI_GATEWAY_PRICING_EVIDENCE',
    action: 'Set AI_GATEWAY_INPUT_USD_PER_MILLION, AI_GATEWAY_OUTPUT_USD_PER_MILLION, AI_GATEWAY_PRICING_SOURCE and AI_GATEWAY_PRICING_VERIFIED_AT from the gateway model pricing page.',
    screen: 'https://vercel.com/docs/ai-gateway/pricing (copy the exact per-million rates for the model to be routed)',
    minutes: 5,
    costUsd: 0,
    costNote: 'No spend. Without these the lane refuses rather than reporting an invented cost.',
    evidenceOfCompletion: 'npm run providers:doctor reports vercel-ai-gateway pricingEvidencePresent: true'
  }),
  GATEWAY_ENABLE: Object.freeze({
    id: 'ENABLE_AI_GATEWAY_LANE',
    action: 'Set AI_GATEWAY_AGENT_ENABLED=true once the credential and pricing evidence are both in place.',
    screen: 'The same environment settings screen used for the key (Vercel project -> Settings -> Environment Variables, or the host process env).',
    minutes: 1,
    costUsd: 0,
    costNote: 'No spend by itself. It permits spend on the next worker tick.',
    evidenceOfCompletion: 'npm run providers:doctor reports status MODEL_PROVIDER_FAILOVER_READY or SINGLE_PROVIDER_NO_FAILOVER with the gateway ready'
  })
});

function providerRow(row) {
  return {
    provider: row.provider,
    ready: row.ready === true,
    blockers: [...row.blockers],
    credentialPresent: row.credentialPresent === true,
    pricingEvidencePresent: row.pricingEvidencePresent === true
  };
}

/**
 * Turn the readiness rows into at most three atomic human actions.
 *
 * Ordered by dependency, not by severity: a key with no pricing evidence is
 * still refused, and enabling a lane with neither is a setting that changes
 * nothing. Listing them in the order they must actually be done is the
 * difference between a queue and a list of complaints.
 */
export function ownerActionQueueFor(gateway) {
  const queue = [];
  if (!gateway.credentialPresent) queue.push(OWNER_ACTIONS.GATEWAY_CREDENTIAL);
  if (!gateway.pricingEvidencePresent) queue.push(OWNER_ACTIONS.GATEWAY_PRICING);
  if (gateway.blockers.includes('explicitly-disabled')) queue.push(OWNER_ACTIONS.GATEWAY_ENABLE);
  return queue.slice(0, 3);
}

/**
 * Inspect every model lane this process could drive.
 *
 * @param {object}  options
 * @param {object} [options.env]                      environment to read presence from
 * @param {object} [options.sandboxIsolationReceipt]  passed through to the sandbox lane
 */
export function inspectModelProviders({ env = process.env, sandboxIsolationReceipt = null } = {}) {
  const rows = describeProviderReadiness({ env, sandboxIsolationReceipt, includeGateway: true }).map(providerRow);
  const gateway = providerRow(describeGatewayProviderReadiness({ env }));

  const ready = rows.filter(row => row.ready);
  // Two ready lanes is the threshold, because one lane cannot fail over to
  // itself. A single configured provider is a working system with no answer to
  // the exact condition this whole path was built for.
  const failoverCapable = ready.length >= 2;
  const status = ready.length === 0
    ? STATUSES.NO_MODEL_PROVIDER_CONFIGURED
    : failoverCapable
      ? STATUSES.MODEL_PROVIDER_FAILOVER_READY
      : STATUSES.SINGLE_PROVIDER_NO_FAILOVER;

  return {
    ok: ready.length > 0,
    policyVersion: MODEL_PROVIDER_DOCTOR_POLICY_VERSION,
    status,
    businessEffectAuthority: 'NONE',
    // This doctor reads booleans out of an object. Nothing here reaches a
    // network, so the zero is an observation rather than a hope.
    externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS },
    providers: rows,
    gateway,
    configuredProviderCount: ready.length,
    failoverCapable,
    // A configured lane is not a proven one. Nothing in this report was earned
    // by a successful call, and saying so here stops the report being read as
    // evidence that routing works.
    provenProviderCallCount: 0,
    routingLaw: MODEL_ROUTING_AUTHORITY_LAW,
    ownerActionQueue: ownerActionQueueFor(gateway),
    reasonCodes: ready.length === 0
      ? ['no-model-provider-configured', 'model-failover-has-no-destination']
      : failoverCapable ? [] : ['single-provider-cannot-fail-over']
  };
}
