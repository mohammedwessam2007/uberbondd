import test from 'node:test';
import assert from 'node:assert/strict';
import {
  UBEROUTBOUND_CLAIM_MATRIX,
  UBEROUTBOUND_CONTRADICTION_MAP,
  UBEROUTBOUND_EXPERT_RESEARCH_COUNCIL,
  UBEROUTBOUND_INDUSTRY_POLICIES,
  UBEROUTBOUND_LEGAL_MATRIX,
  UBEROUTBOUND_OFFER_TAXONOMY,
  UBEROUTBOUND_VISIBLE_SOURCE_LEDGER,
  UBEROUTBOUND_VISIBLE_PRIORITY_HYPOTHESES,
  UBEROUTBOUND_VISIBLE_UNKNOWN_UNKNOWNS,
  compileUberOutboundContextPolicy,
  compileUberOutboundMonocultureAudit,
  compileUberOutboundResearchCoverage,
  compileUberOutboundSequenceDecision
} from '../src/uberoutbound-policy-registry.mjs';

test('report-visible research coverage is explicit and missing downloads are not fabricated', () => {
  const coverage = compileUberOutboundResearchCoverage();
  assert.equal(coverage.state, 'REPORT_VISIBLE_CORPUS_COMPLETE_EXTERNAL_DOWNLOADS_PENDING');
  assert.equal(coverage.reportVisible.visibleSourceLedgerRows, 22);
  assert.equal(coverage.reportVisible.reportedFullSourceLedgerRows, 26);
  assert.equal(coverage.reportVisible.expertResearchUniverseRows, 71);
  assert.equal(coverage.reportVisible.visiblePriorityHypotheses, 15);
  assert.equal(coverage.reportVisible.reportedFullHypotheses, 100);
  assert.equal(coverage.reportVisible.visibleUnknownUnknowns, 22);
  assert.equal(coverage.reportVisible.reportedFullUnknownUnknowns, 50);
  assert.ok(coverage.externalResearchAssetsPending.includes('TOP_100_TESTABLE_HYPOTHESES_CSV'));
  assert.equal(coverage.externalEffectAuthority, 'NONE');
});

test('research council preserves the report-visible 71 person/group universe', () => {
  const count = Object.values(UBEROUTBOUND_EXPERT_RESEARCH_COUNCIL).reduce((sum, rows) => sum + rows.length, 0);
  assert.equal(count, 71);
});

test('policy registry encodes the major report-visible matrices without flattening confidence', () => {
  assert.equal(UBEROUTBOUND_VISIBLE_SOURCE_LEDGER.length, 22);
  assert.equal(UBEROUTBOUND_OFFER_TAXONOMY.length, 9);
  assert.equal(UBEROUTBOUND_INDUSTRY_POLICIES.length, 18);
  assert.equal(UBEROUTBOUND_LEGAL_MATRIX.length, 9);
  assert.equal(UBEROUTBOUND_CLAIM_MATRIX.length, 14);
  assert.equal(UBEROUTBOUND_CONTRADICTION_MAP.length, 5);
  assert.equal(UBEROUTBOUND_VISIBLE_PRIORITY_HYPOTHESES.length, 15);
  assert.equal(UBEROUTBOUND_VISIBLE_UNKNOWN_UNKNOWNS.length, 22);
  assert.equal(UBEROUTBOUND_INDUSTRY_POLICIES.find(row => row.industry === 'HVAC').confidence, 'L');
  assert.equal(UBEROUTBOUND_INDUSTRY_POLICIES.find(row => row.industry === 'SAAS').confidence, 'M');
});

test('context policy is conditional on seniority department industry and intent', () => {
  const cold = compileUberOutboundContextPolicy({ seniority: 'CFO', department: 'Finance', industry: 'SaaS', intentState: 'COLD' });
  assert.equal(cold.seniorityKey, 'C_SUITE');
  assert.equal(cold.departmentKey, 'FINANCE');
  assert.equal(cold.industryKey, 'SAAS');
  assert.ok(cold.seniorityPolicy.policy.includes('strategic'));
  assert.ok(cold.departmentPolicy.policy.includes('cost/risk/time'));
  assert.deepEqual(cold.ctaPolicy, ['MAKE_AN_OFFER', 'ASK_FOR_INTEREST', 'SEND_ASSET', 'BENCHMARK']);
  assert.equal(cold.externalEffectAuthority, 'NONE');

  const warm = compileUberOutboundContextPolicy({ seniority: 'CFO', department: 'Finance', industry: 'SaaS', intentState: 'HIGH_INTENT' });
  assert.deepEqual(warm.ctaPolicy, ['DIRECT_NEXT_STEP', 'SCHEDULING']);
});

test('weakly evidenced industry policy remains speculative rather than becoming hard truth', () => {
  const hvac = compileUberOutboundContextPolicy({ seniority: 'Owner', department: 'Operations', industry: 'HVAC' });
  assert.equal(hvac.industryPolicy.industry, 'HVAC');
  assert.equal(hvac.industryPolicy.confidence, 'L');
  assert.equal(hvac.evidenceState, 'SPECULATIVE');
});

test('sequence decision gives suppression and reputation guardrails precedence', () => {
  const suppressed = compileUberOutboundSequenceDecision({ state: 'NO_RESPONSE_NO_NEGATIVE_SIGNAL', unsubscribed: true, freshTrigger: true });
  assert.equal(suppressed.action, 'IMMEDIATE_GLOBAL_SUPPRESSION');

  const reputation = compileUberOutboundSequenceDecision({ qualifiedReply: true, reputationDeterioration: true });
  assert.equal(reputation.action, 'REDUCE_OR_FREEZE_AFFECTED_SENDER_PATH');

  const reply = compileUberOutboundSequenceDecision({ qualifiedReply: true });
  assert.equal(reply.action, 'EXIT_COLD_AUTOMATION_TO_REPLY_OPPORTUNITY_POLICY');
});

test('sequence policy adds new information rather than blind bumping', () => {
  const decision = compileUberOutboundSequenceDecision({ state: 'NO_RESPONSE_NO_NEGATIVE_SIGNAL' });
  assert.equal(decision.action, 'ADD_NEW_INFORMATION_NOT_RESTATEMENT');
  assert.equal(decision.externalEffectAuthority, 'NONE');
});

test('monoculture audit is observability only unless a threshold is explicitly supplied', () => {
  const repeated = Array.from({ length: 8 }, (_, index) => ({
    genotypeId: `g-${index}`,
    atoms: {
      subject: { architecture: 'PRIORITY' },
      opening: { architecture: 'TRIGGER_PROBLEM' },
      problem: { architecture: 'COST_OF_INACTION' },
      offer: { type: 'BENCHMARK' },
      cta: { type: 'OFFER' },
      tone: { type: 'PLAIN' },
      sequence: { position: 1 }
    }
  }));
  const observed = compileUberOutboundMonocultureAudit({ genotypes: repeated });
  assert.equal(observed.state, 'OBSERVABILITY_ONLY');
  assert.equal(observed.structuralDiversityRatio, 0.125);

  const flagged = compileUberOutboundMonocultureAudit({ genotypes: repeated, policy: { minStructuralDiversityRatio: 0.25 } });
  assert.equal(flagged.state, 'MONOCULTURE_RISK_CANDIDATE');
  assert.equal(flagged.evidenceState, 'SPECULATIVE');
  assert.equal(flagged.externalEffectAuthority, 'NONE');
});
