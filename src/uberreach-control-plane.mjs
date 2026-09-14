// UberReach: zero-authority composition layer for sender health, contact
// evidence, bounded account similarity, quality-preserving outreach capacity,
// and the evidence-weighted UberOutbound strategy genome. It prepares evidence
// for later owner/governance review and deliberately performs no external effects.

import { compileUberWarmFleet } from './uberwarm-reputation-lab.mjs';
import { compileUberVerifyBatch } from './uberverify-contact-hygiene.mjs';
import { rankUberLookalikes } from './uberlookalike-account-expander.mjs';
import { compileQualityPreservingOutreachCapacity } from './uberquality-capacity-governor.mjs';
import { compileUberOutboundGenomeDecision } from './uberoutbound-genome.mjs';

export const UBERREACH_VERSION = 'uberbond.uberreach.v1.2';

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
  capacityInputs = null,
  genomeInputs = null,
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

  const capacity = capacityInputs && typeof capacityInputs === 'object'
    ? compileQualityPreservingOutreachCapacity({
      warmFleet: senderHealth,
      domains: capacityInputs.domains || [],
      egress: capacityInputs.egress || {},
      recipientBudgets: capacityInputs.recipientBudgets || [],
      leads: capacityInputs.leads || [],
      policy: capacityInputs.policy || {}
    })
    : null;

  const outboundGenome = genomeInputs && typeof genomeInputs === 'object'
    ? compileUberOutboundGenomeDecision({
      prospect: genomeInputs.prospect || {},
      sender: genomeInputs.sender || {},
      authorization: genomeInputs.authorization || {},
      legalDecision: genomeInputs.legalDecision || {},
      messageCandidates: genomeInputs.messageCandidates || [],
      experiment: genomeInputs.experiment || null,
      policy: genomeInputs.policy || {},
      now
    })
    : null;

  const blockers = [];
  if (!senderHealth.readyMailboxCount) blockers.push('no-evidence-ready-sender');
  if (!contactHygiene.verifiedForAuthorizationGate) blockers.push('no-source-backed-verified-contact-route');
  if (capacity && capacity.qualityPreservingDailyMax === 0) blockers.push('quality-preserving-daily-capacity-zero');
  if (outboundGenome && genomeInputs?.enforce === true && outboundGenome.recommendedAction !== 'SEND_CANDIDATE') {
    blockers.push('outbound-genome-not-send-candidate');
  }

  return {
    version: UBERREACH_VERSION,
    generatedAt: new Date(now).toISOString(),
    state: blockers.length ? 'PREPARATION_BLOCKED' : 'READY_FOR_SEPARATE_AUTHORIZATION_REVIEW',
    blockers,
    senderHealth,
    contactHygiene,
    accountExpansion,
    capacity,
    outboundGenome,
    providerCalls: 0,
    messagesSent: 0,
    purchases: 0,
    dnsChanges: 0,
    externalEffectAuthority: 'NONE',
    businessEffectAuthority: 'NONE',
    truthBoundary: 'Readiness means only that supplied evidence passed these local preparation gates. Capacity and strategy priors never relax the lead-quality floor, legal eligibility, suppression, provider policy or separate authorization. Readiness is never permission to contact, spend, provision infrastructure, or claim deliverability.'
  };
}
