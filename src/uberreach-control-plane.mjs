// UberReach: zero-authority composition layer for sender health, contact
// evidence, and bounded account similarity. It prepares evidence for later
// owner/governance review and deliberately performs no external side effects.

import { compileUberWarmFleet } from './uberwarm-reputation-lab.mjs';
import { compileUberVerifyBatch } from './uberverify-contact-hygiene.mjs';
import { rankUberLookalikes } from './uberlookalike-account-expander.mjs';

export const UBERREACH_VERSION = 'uberbond.uberreach.v1';

export function compileUberReachReadiness({
  mailboxes = [],
  mailboxObservations = {},
  contacts = [],
  suppressions = [],
  lookalikeSeeds = [],
  accountCandidates = [],
  warmPolicy = {},
  lookalikeMinScore = 0.25,
  lookalikeLimit = 100,
  now = new Date()
} = {}) {
  const senderHealth = compileUberWarmFleet({
    mailboxes,
    observationsByMailbox: mailboxObservations,
    policy: warmPolicy,
    now
  });

  const contactHygiene = compileUberVerifyBatch({ contacts, suppressions, now });

  const accountExpansion = lookalikeSeeds.length
    ? rankUberLookalikes({
      seeds: lookalikeSeeds,
      candidates: accountCandidates,
      minScore: lookalikeMinScore,
      limit: lookalikeLimit
    })
    : {
      version: 'uberbond.uberlookalike.v1',
      seedCount: 0,
      candidateCount: Array.isArray(accountCandidates) ? accountCandidates.length : 0,
      returnedCount: 0,
      candidates: [],
      businessEffectAuthority: 'NONE',
      externalEffects: 0,
      reasonCodes: ['no-lookalike-seeds-supplied']
    };

  const blockers = [];
  if (!senderHealth.readyMailboxCount) blockers.push('no-evidence-ready-sender');
  if (!contactHygiene.verifiedForAuthorizationGate) blockers.push('no-source-backed-verified-contact-route');

  return {
    version: UBERREACH_VERSION,
    generatedAt: new Date(now).toISOString(),
    state: blockers.length ? 'PREPARATION_BLOCKED' : 'READY_FOR_SEPARATE_AUTHORIZATION_REVIEW',
    blockers,
    senderHealth,
    contactHygiene,
    accountExpansion,
    providerCalls: 0,
    messagesSent: 0,
    purchases: 0,
    dnsChanges: 0,
    externalEffectAuthority: 'NONE',
    businessEffectAuthority: 'NONE',
    truthBoundary: 'Readiness means only that supplied evidence passed these local preparation gates. It is never permission to contact, spend, provision infrastructure, or claim deliverability.'
  };
}
