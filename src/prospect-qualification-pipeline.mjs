// The single answer to "may this prospect enter an outreach experiment".
//
// Two things arrived independently and both are right about different halves.
// prospect-qualification.mjs produces the score: nine weighted dimensions with
// provenance, a model's opinion capped and never load-bearing on its own.
// prospect-qualification-gate.mjs consumes a score and applies contact,
// identity and conflict gates on top of it.
//
// Left side by side they are two sources of truth for the same decision, which
// is how a caller ends up quoting whichever one agrees with it. Composed, the
// scorer decides fit and the gate decides admissibility, and the gate may only
// ever narrow -- there is no input to it that can turn a rejected prospect into
// an eligible one. That property is the reason this module exists, and it has
// a test.

import { decideProspectDisposition } from './prospect-qualification.mjs';
import { evaluateProspectQualification } from './prospect-qualification-gate.mjs';

export const PROSPECT_QUALIFICATION_PIPELINE_VERSION = 'uberbond.prospect-qualification-pipeline.v1';

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

/** Present a disposition in the shape the gate expects to receive a score in. */
function scoreFromDisposition(decision) {
  return {
    eligible: decision.disposition === 'ELIGIBLE_FOR_EXPERIMENT',
    total: Math.round(decision.score * 100),
    blocks: decision.disposition === 'ELIGIBLE_FOR_EXPERIMENT' ? [] : [...decision.reasonCodes],
    disposition: decision.disposition
  };
}

export function qualifyProspect({
  bundle = {},
  observations = {},
  assessment = null,
  minimumScore,
  minimumEvidenceQuality,
  requireContact = true,
  requireExactPerson = false,
  allowResearchOnly = false,
  date = new Date()
} = {}) {
  const decision = decideProspectDisposition({
    bundle, observations, assessment, minimumScore, minimumEvidenceQuality, date
  });
  const gate = evaluateProspectQualification({
    score: scoreFromDisposition(decision),
    evidenceBundle: bundle,
    requireContact,
    requireExactPerson,
    allowResearchOnly
  });

  // The gate narrows and never widens. A prospect the scorer rejected stays
  // rejected however the gate is configured, so no combination of gate options
  // can be used to argue one back in.
  const eligible = decision.disposition === 'ELIGIBLE_FOR_EXPERIMENT' && gate.eligible === true;

  return {
    ok: true,
    version: PROSPECT_QUALIFICATION_PIPELINE_VERSION,
    prospectId: decision.prospectId,
    eligible,
    disposition: eligible ? 'ELIGIBLE_FOR_EXPERIMENT' : decision.disposition,
    tier: eligible ? gate.tier : (allowResearchOnly ? 'RESEARCH_ONLY' : 'BLOCKED'),
    blocks: [...new Set([...(gate.blocks || []), ...(eligible ? [] : decision.reasonCodes)])],
    score: decision.score,
    evidenceQuality: decision.evidenceQuality,
    dimensions: decision.dimensions,
    advisory: decision.advisory,
    contact: gate.contact,
    identity: gate.identity,
    evidenceConflicts: gate.evidenceConflicts,
    decisionId: decision.decisionId,
    decidedAt: decision.decidedAt,
    // Unchanged by anything above. Qualification is not permission.
    outboundAuthority: 'NONE',
    businessEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO_EFFECTS },
    note: 'One qualification answer. Outreach still requires suppression, deliverability, authorization and consequence gates.'
  };
}
