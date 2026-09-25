#!/usr/bin/env node
// GENESIS idea burst + Wallbreaker tournament for the outreach first-cash wall.
//   node scripts/genesis-outreach-burst.mjs            # validate and print summaries
//   node scripts/genesis-outreach-burst.mjs --write    # also write the burst and Wallbreaker receipts
// Every candidate binds one activated GENESIS generator and founder moonshot ancestors
// from the immutable 890 corpus. Realization states point at the commit that built it;
// everything else stays a hypothesis with a falsifier and a next probe.
import fs from 'node:fs';
import { compileGenesisIdeaBurst } from '../src/genesis-idea-burst.mjs';
import { planWallbreakerCycle } from '../src/wallbreaker.mjs';

const COMMIT = 'https://github.com/mohammedwessam2007/uberbondd/commit/';
export const OUTREACH_BURST_ID = 'genesis-burst-20260925-outreach-first-cash';
export const OUTREACH_BURST_PATH = 'artifacts/genesis/GENESIS_OUTREACH_FIRST_CASH_BURST_20260925.json';
export const OUTREACH_WALLBREAKER_PATH = 'artifacts/genesis/WALLBREAKER_OUTREACH_FIRST_CASH_20260925.json';

export const signal = {
  id: 'uberbond-outreach-first-cash-wall-2026-09-25',
  summary: 'UberBond first-cash outreach wall: no cold-capable email transport is proven, the chosen host terms are unverified, the sender jurisdiction may require consent for electronic marketing, there are zero prospects and zero customer proof, and the payment rail is not live. GENESIS is asked for lawful demand, consent, trust and distribution mechanisms that do not depend on unsolicited email.',
  evidenceRefs: [`${COMMIT}b1294fb`, `${COMMIT}d16dc80`, `${COMMIT}953aa26`, `${COMMIT}0896398`, 'artifacts/outreach/fleet-dns-observation-2026-09-25.json', 'UBERBOND_NIGHT_WAR_FINAL.md'],
  observedAt: '2026-09-25T02:00:00Z',
  truthClass: 'CURRENT_EXACT_SOURCE_SIGNAL'
};
export const affectedDomains = ['wealth-business-capital', 'relationships-social-intelligence', 'opportunity-world-discovery', 'software-agents-intelligence', 'sensing-data-reality-capture'];

const m = n => `founder-moonshot-${String(n).padStart(4, '0')}`;
const c = (n, generatorKey, title, hypothesis, mechanism, falsifier, nextProbe, moonshots, substrateNeeds, [novelty, leverage, testability, reversibility], realization) => ({
  id: `genesis-candidate-20260925-outreach-${String(n).padStart(4, '0')}`,
  title, hypothesis, mechanism, falsifier, nextProbe, generatorKey,
  moonshotAffinity: moonshots.map(m), substrateNeeds, novelty, leverage, testability, reversibility,
  realization
});

export const candidates = [
  c(1, 'relationships-social-intelligence::friction-collapse', 'Consent Bridge Invitations',
    'A non-email first touch carrying a typeable code converts into permissioned email when the prospect asks for their own report.',
    'HMAC invitation codes printed or handed through letter, partner, in-person or founder-network channels; redemption creates the prospect’s consent receipts and channel attribution.',
    'Fewer than 2% of delivered invitations are redeemed within 21 days across at least 100 invitations.',
    'Issue 20 partner or in-person invitations and measure redemption.',
    [161, 160, 464], ['CONSENT_BRIDGE', 'PUBLIC_INTAKE', 'HUMAN_CHANNEL'], [0.82, 0.9, 0.9, 0.97],
    { state: 'REALIZED_IN_SOURCE', ref: `${COMMIT}0896398`, module: 'src/consent-bridge.mjs' }),
  c(2, 'sensing-data-reality-capture::founder-legibility', 'Evidence-Grade Consent Receipts',
    'Consent recorded with exact wording, purpose, channel and time can be demonstrated to a regulator and unlocks jurisdictions where cold email is closed.',
    'Versioned wording hashes, purposes, double opt-in for marketing, time-ordered revocation; the eligibility engine accepts only receipts that cover the purpose.',
    'A receipt fails to reconstruct what the person agreed to, or a revoked or unconfirmed receipt ever yields a permissioned relationship.',
    'Replay every public-intake lead through consentRelationshipFor and audit the outcomes.',
    [161, 67, 465], ['CONSENT_LEDGER', 'ELIGIBILITY_ENGINE'], [0.62, 0.88, 0.95, 0.99],
    { state: 'REALIZED_IN_SOURCE', ref: `${COMMIT}953aa26`, module: 'src/consent-receipt.mjs' }),
  c(3, 'software-agents-intelligence::cross-domain-translation', 'Lawful Channel Router',
    'Routing each prospect like a packet to the cheapest permitted channel recovers prospects that cold-email rules would drop.',
    'Per-prospect route table with legal state, cost and founder minutes; cold email only when eligibility PASSED; letters, partners and in-person as consent-creating fallbacks; monoculture warning.',
    'Over a 100-prospect cohort the router recovers no targeted route for prospects held or rejected for cold email.',
    'Run the router over the first real cohort and report routedTargeted versus cold-eligible.',
    [107, 790, 394, 1], ['ELIGIBILITY_ENGINE', 'CHANNEL_CATALOG', 'BUDGET_LEDGER'], [0.78, 0.92, 0.9, 0.98],
    { state: 'REALIZED_IN_SOURCE', ref: `${COMMIT}0896398`, module: 'src/lawful-channel-router.mjs' }),
  c(4, 'sensing-data-reality-capture::simulation-first', 'Evidence Beacon',
    'Showing a prospect verified findings on their own public pages is credible without case studies and pre-filters who is worth a first touch.',
    'Run the read-only auditor before contact; keep same-domain, recent, excerpted, confident findings; no revenue claims; no findings means no invitation.',
    'Invited prospects with a beacon convert to report requests no better than prospects without one.',
    'A/B the landing with and without the beacon on the first 40 invitations.',
    [306, 67, 146], ['WEBSITE_AUDITOR', 'CONSENT_BRIDGE'], [0.74, 0.86, 0.88, 0.99],
    { state: 'REALIZED_IN_SOURCE', ref: `${COMMIT}0896398`, module: 'src/evidence-beacon.mjs' }),
  c(5, 'relationships-social-intelligence::scarcity-world', 'Atoms-to-Consent Postal Bridge',
    'Inbox attention is scarce and legally fenced; a physical letter to the business is a less crowded, differently regulated first touch that can carry a consent-bridge code.',
    'Letters addressed to the company (never a named person) from provenance-backed public business addresses, carrying the invitation code and sender identity, sent through a print-and-mail supplier under a founder-authorized budget.',
    'Redemption per letter stays below 1% over 100 letters, or the cost per redeemed report exceeds the lowest pilot price.',
    'Founder authorizes a 20-letter budget; measure redemption and cost per request.',
    [744, 814, 257], ['PRINT_MAIL_SUPPLIER', 'CONSENT_BRIDGE', 'POSTAL_ADDRESS_PROVENANCE'], [0.86, 0.72, 0.8, 0.9],
    { state: 'ROUTED_IN_SOURCE_SUPPLIER_AND_BUDGET_REQUIRED', ref: `${COMMIT}0896398`, module: 'src/lawful-channel-router.mjs' }),
  c(6, 'relationships-social-intelligence::offline-first', 'Partner and In-Person First Touch',
    'An existing relationship holder introducing UberBond under its own relationship converts better and is lawful where cold email is not.',
    'Partner agreement plus the partner’s own attestation of its relationship; the partner hands the invitation code; attribution flows back through the intake source.',
    'No partner agrees to introduce within 30 days of asking five agencies.',
    'Ask five agencies from the partner canary lineage to hand out codes to one client each.',
    [68, 313, 161], ['PARTNER_AGREEMENT', 'CONSENT_BRIDGE'], [0.55, 0.8, 0.85, 0.97],
    { state: 'ROUTED_IN_SOURCE_PARTNERS_REQUIRED', ref: `${COMMIT}0896398`, module: 'src/lawful-channel-router.mjs' }),
  c(7, 'sensing-data-reality-capture::ambient-intelligence', 'Ambient Fleet DNS Observatory',
    'Continuously observing public DNS for every owned domain catches authentication and website defects before they cost reputation or trust.',
    'Resolver sweep over all 30 domains classifying MX, SPF, DMARC and apex state with failure-is-not-absence semantics.',
    'The observatory misses a defect later found by a provider bounce or a human.',
    'Schedule the sweep daily once mail is configured and compare with provider feedback.',
    [445, 167], ['DNS_RESOLVER', 'SCHEDULER'], [0.4, 0.66, 0.97, 1],
    { state: 'REALIZED_IN_SOURCE', ref: `${COMMIT}d16dc80`, module: 'src/outreach-fleet-dns-observatory.mjs' }),
  c(8, 'opportunity-world-discovery::new-sense', 'Own-Domain Leak as Living Case Study',
    'UberBond’s own domain shows a real lead-path leak (uberbond.cloud serves registrar parking to part of its traffic); fixing it and publishing the before/after is truthful proof without a customer.',
    'Record the observed leak, fix it, re-observe, and publish the before/after with both receipts as a demonstration of the audit.',
    'The before/after cannot be verified by a third party from public DNS and page history.',
    'Founder deletes the parked A record; rerun the observatory and keep both receipts.',
    [306, 857, 654], ['DNS_OBSERVATORY', 'PUBLIC_CONTENT'], [0.7, 0.55, 0.95, 0.99],
    { state: 'LEAK_OBSERVED_FIX_PENDING_FOUNDER', ref: 'artifacts/outreach/fleet-dns-observation-2026-09-25.json' }),
  c(9, 'opportunity-world-discovery::prediction-to-action', 'Causal First-Cash Compiler',
    'Backward-chaining from cleared payment to the smallest set of interventions keeps effort on the binding constraint instead of architecture.',
    'Barrier graph from cleared payment back through buyer, delivery, sender, DNS, host and legal identity, recomputed from doctors and live receipts after every change.',
    'The compiled next action repeatedly differs from what actually unblocked progress.',
    'Recompute the graph after each owner action and log whether the predicted next blocker was the real one.',
    [1, 363, 365], ['DOCTORS', 'LIVE_RECEIPTS'], [0.5, 0.84, 0.8, 1],
    { state: 'COMPILED_AS_REPORT', ref: 'UBERBOND_NIGHT_WAR_FINAL.md' }),
  c(10, 'sensing-data-reality-capture::future-backcasting', 'Hiring-Signal Chemotaxis',
    'Companies publicly hiring for marketing operations, CRO or web analytics already feel the problem UberBond’s offers solve; following those public signals finds buyers without buying data.',
    'Read public job postings, extract company and website only (no personal data), score problem relevance, and feed the auditor and the consent bridge.',
    'Companies found by hiring signals show no more audit findings or report requests than random companies in the same category.',
    'Pull 50 public postings, audit their sites, compare finding density with 50 OSM businesses.',
    [178, 16, 167], ['PUBLIC_JOB_POSTINGS', 'WEBSITE_AUDITOR'], [0.68, 0.74, 0.86, 1],
    { state: 'HYPOTHESIS' }),
  c(11, 'wealth-business-capital::constraint-deletion', 'Outcome-Priced Pilot',
    'Pricing the first pilot against the leak the beacon already evidenced removes the need to win on reputation and may reconcile the 450-950 and 1,000+ price lineages with evidence.',
    'Free evidence beacon, then a fixed-scope fix sprint whose acceptance test is the re-observed absence of the evidenced leak; price choice stays the founder’s.',
    'Prospects who requested a report decline an evidence-bound pilot at both price lineages.',
    'Offer both lineages to the first 10 report requesters and record accept/decline.',
    [305, 306, 517], ['EVIDENCE_BEACON', 'OFFER_GENOME', 'FOUNDER_DECISION'], [0.72, 0.8, 0.82, 0.95],
    { state: 'HYPOTHESIS_FOUNDER_DECISION' }),
  c(12, 'software-agents-intelligence::intergenerational-thinking', 'Reputation Capital Conservation',
    'Sender reputation compounds across campaign generations; spending it only where expected value exceeds its burn keeps the machine usable for years instead of weeks.',
    'Per-domain reputation ledger debited by bounces, complaints and silence, credited by replies; a send is allowed only when its expected value clears the debit estimate.',
    'Domains managed by the ledger show no lower complaint or block rates than unmanaged domains over three months.',
    'Enable the ledger on the first sender domain and compare with circuit-breaker-only operation.',
    [445, 59, 883], ['SENDER_HEALTH', 'CIRCUIT_BREAKER', 'EXPERIMENT_LEDGER'], [0.6, 0.7, 0.75, 0.98],
    { state: 'HYPOTHESIS' })
];

export function buildBurst() {
  const compiled = compileGenesisIdeaBurst({ signal, affectedDomains, candidates, maxGenerators: 12, candidateBudgetPerGenerator: 50 });
  if (!compiled.ok) return { compiled };
  const artifact = {
    schemaVersion: 'uberbond.genesis-live-nursery.v1',
    burstId: OUTREACH_BURST_ID,
    generatedAt: signal.observedAt,
    signal,
    affectedDomains,
    activationPolicy: { maxGenerators: 12, candidateBudgetPerGenerator: 50 },
    activatedGeneratorKeys: compiled.activation.selectedGeneratorKeys,
    selectedGeneratorCount: compiled.activation.selectedGeneratorCount,
    selectedFirstGenerationCapacity: compiled.activation.selectedFirstGenerationCapacity,
    materializedCandidateCount: compiled.materializedCandidateCount,
    candidates,
    burstDigest: compiled.burstDigest,
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE',
    truthBoundary: 'Generated hypotheses bound to the immutable 890 corpus. REALIZED_IN_SOURCE means code and tests exist on the branch, not that any prospect, consent, reply or payment has been observed.'
  };
  return { compiled, artifact };
}

// Economics are UNKNOWN (no conversion data exists), so every candidate carries
// zero expected contribution and the tournament ranks only by feasibility,
// reversibility, evidence and robustness. Spend and authority limits are tonight's.
export function runWallbreaker() {
  const problem = {
    objective: 'Obtain UberBond’s first lawful cleared payment from outreach',
    successCriteria: ['one cleared payment with provider-origin evidence', 'every contact lawful under compiled eligibility or a consent receipt'],
    hardConstraints: ['no unsolicited email without PASSED eligibility', 'no provider-terms evasion', 'no fabricated consent or evidence'],
    assumptions: ['cold email is the only acquisition channel'],
    unknowns: ['Netcup terms on unsolicited advertising email', 'sender jurisdiction', 'conversion of any channel', 'which price lineage the founder chooses'],
    requiredCapabilities: ['consent-creation', 'lawful-routing', 'evidence-of-value'],
    ownerReservedAuthority: ['spend', 'deploy', 'send', 'dns-change', 'legal-attestation'],
    riskBudget: 5, maxSpendCents: 0, maxFounderMinutes: 60,
    evidenceRefs: signal.evidenceRefs
  };
  const failures = [{
    failureClass: 'WRONG_ASSUMPTION',
    candidateId: 'cold-email-only',
    invalidatedAssumptions: ['cold email is the only acquisition channel'],
    discoveredConstraints: ['EG/SA/AE sender jurisdiction holds all cold email', 'DE/CH/SA recipients reject cold email', 'no proven cold-capable transport'],
    outcomeUncertain: false,
    evidenceRefs: [`${COMMIT}0896398`]
  }];
  const w = (id, family, mechanism, extra) => ({ id, family, mechanism, expectedContributionCents: 0, successProbability: 0, evidenceRefs: signal.evidenceRefs.slice(0, 4), ...extra });
  const tournament = [
    w('partner-intro', 'PARTNER_FIRST_TOUCH', 'Ask agencies with existing client relationships to hand out consent-bridge codes', { founderMinutes: 30, risk: 2, evidenceStrength: 3, novelty: 6, robustness: 6 }),
    w('founder-network', 'FOUNDER_NETWORK', 'Hand codes personally to businesses the founder already knows', { founderMinutes: 30, risk: 1, evidenceStrength: 4, novelty: 3, robustness: 5 }),
    w('own-domain-proof', 'SELF_CASE_STUDY', 'Fix the observed uberbond.cloud parking leak and keep before/after receipts as proof', { founderMinutes: 1, risk: 0, evidenceStrength: 7, novelty: 5, robustness: 7 }),
    w('hiring-signal-research', 'SIGNAL_PROSPECTING', 'Read public job postings to find companies with the problem, company and website only', { founderMinutes: 0, risk: 1, evidenceStrength: 2, novelty: 7, robustness: 5 }),
    w('offer-decision', 'OFFER_TRUTH', 'Founder chooses the launch price lineage in the launch-facts file', { founderMinutes: 5, risk: 0, evidenceStrength: 5, novelty: 1, robustness: 8 }),
    w('cold-email-canary', 'COLD_EMAIL', 'Buy the Netcup cell and run a 20-recipient cold canary', { costCents: 2952, founderMinutes: 40, risk: 5, evidenceStrength: 3, novelty: 2, robustness: 3, assumptions: ['cold email is the only acquisition channel'] }),
    w('postal-bridge', 'POSTAL_BRIDGE', 'Send 20 letters with consent-bridge codes through a print-and-mail supplier', { costCents: 3000, founderMinutes: 10, risk: 2, evidenceStrength: 2, novelty: 8, robustness: 5 }),
    w('public-xray-deploy', 'INBOUND_SELF_SERVE', 'Deploy the public audit funnel with ?code= attribution', { founderMinutes: 5, risk: 2, evidenceStrength: 4, novelty: 4, robustness: 7, constraintViolations: ['authority:deploy-requires-founder'] })
  ];
  return planWallbreakerCycle({ problem, candidates: tournament, failures });
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const { compiled, artifact } = buildBurst();
  if (!compiled.ok) { process.stdout.write(`${JSON.stringify(compiled, null, 2)}\n`); process.exit(2); }
  const wall = runWallbreaker();
  if (process.argv.includes('--write')) {
    fs.writeFileSync(OUTREACH_BURST_PATH, `${JSON.stringify(artifact, null, 2)}\n`);
    fs.writeFileSync(OUTREACH_WALLBREAKER_PATH, `${JSON.stringify(wall, null, 2)}\n`);
  }
  process.stdout.write(`${JSON.stringify({
    burst: { status: compiled.status, burstDigest: compiled.burstDigest, generators: compiled.activation.selectedGeneratorKeys.length, candidates: compiled.materializedCandidateCount, top: compiled.candidates.slice(0, 5).map(x => [x.id.slice(-4), x.title, x.utility]) },
    wallbreaker: { status: wall.status, receipt: wall.wallbreakerReceiptId, selected: wall.selected?.candidate.id, fallbacks: wall.fallbacks.map(f => f.candidate.id), rejected: wall.rejected.map(r => [r.candidate.id, r.reasonCodes]) }
  }, null, 2)}\n`);
}
