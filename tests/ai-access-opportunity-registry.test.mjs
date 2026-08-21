import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AI_ACCESS_OPPORTUNITIES,
  AI_ACCESS_OPPORTUNITY_COUNT,
  AI_ACCESS_OPPORTUNITY_POLICY_VERSION,
  buildAIAccessOwnerActionQueue,
  buildAIAccessReceipt,
  evaluateAIAccessOpportunity,
  getAIAccessModelRoutingPlan,
  getAIAccessOpportunity,
  listAIAccessOpportunities,
  validateAIAccessCatalog,
  assertNoAccountFarming
} from '../src/ai-access-opportunity-registry.mjs';

const referenceDate = new Date('2026-08-21T08:00:00.000Z');

test('catalog contains all researched access routes as immutable, unique records', () => {
  assert.ok(AI_ACCESS_OPPORTUNITY_COUNT >= 30);
  assert.equal(AI_ACCESS_OPPORTUNITIES.length, AI_ACCESS_OPPORTUNITY_COUNT);
  assert.equal(new Set(AI_ACCESS_OPPORTUNITIES.map((item) => item.id)).size, AI_ACCESS_OPPORTUNITY_COUNT);
  assert.equal(validateAIAccessCatalog().ok, true);
  assert.equal(AI_ACCESS_OPPORTUNITIES[0].policy.automaticApplication, false);
});

test('catalog records official HTTPS evidence and explicit verification dates', () => {
  for (const item of AI_ACCESS_OPPORTUNITIES) {
    assert.match(item.officialUrl, /^https:\/\//);
    assert.equal(item.evidenceClass, 'VERIFIED_FACT');
    assert.match(item.lastVerifiedOn, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(item.externalEffectLedger.spendCents, 0);
  }
});

test('the expired Egypt student campaign cannot be treated as current access', () => {
  const decision = evaluateAIAccessOpportunity({
    opportunityId: 'google-ai-pro-egypt-student-2025-expired',
    context: { country: 'EG' },
    date: referenceDate
  });
  assert.equal(decision.status, 'EXPIRED');
  assert.equal(decision.externalEffectLedger.providerCalls, 0);
});

test('the US-only student offer rejects known Egypt context without a loophole', () => {
  const decision = evaluateAIAccessOpportunity({
    opportunityId: 'google-ai-pro-us-student-2026',
    context: { country: 'EG', verifiedStudent: true },
    date: referenceDate
  });
  assert.equal(decision.status, 'NOT_ELIGIBLE_GIVEN_CONTEXT');
  assert.equal(decision.externalEffectLedger.spendCents, 0);
});

test('missing eligibility proof remains owner review, not an invented approval', () => {
  const decision = evaluateAIAccessOpportunity({
    opportunityId: 'google-ai-pro-us-student-2026',
    context: {},
    date: referenceDate
  });
  assert.equal(decision.status, 'OWNER_REVIEW_REQUIRED');
  assert.ok(decision.ownerOnlySteps.length >= 3);
  assert.deepEqual(decision.externalEffectLedger, {
    providerCalls: 0,
    messages: 0,
    purchases: 0,
    deployments: 0,
    credentialChanges: 0,
    dnsChanges: 0,
    productionMutations: 0,
    spendCents: 0
  });
});

test('free API tiers are available as interfaces but still require the owner account/key', () => {
  const decision = evaluateAIAccessOpportunity({
    opportunityId: 'gemini-api-free-tier',
    context: {},
    date: referenceDate
  });
  assert.equal(decision.status, 'FREE_TIER_AVAILABLE');
  assert.ok(decision.reasonCodes.includes('account-and-key-owner-required'));
  assert.equal(decision.externalEffectLedger.credentialChanges, 0);
});

test('account farming, fake identities, and multiple accounts fail closed', () => {
  for (const context of [
    { accountCount: 2 },
    { requestedAccountCount: 3 },
    { identityCount: 2 },
    { useMultipleAccounts: true },
    { wantsToFarm: true }
  ]) {
    const result = assertNoAccountFarming(context);
    assert.equal(result.ok, false);
    const decision = evaluateAIAccessOpportunity({
      opportunityId: 'groq-free-plan',
      context,
      date: referenceDate
    });
    assert.equal(decision.status, 'DENIED_ACCOUNT_FARMING');
    assert.equal(decision.externalEffectLedger.messages, 0);
  }
});

test('Kiro student route does not claim Cairo University eligibility', () => {
  const decision = evaluateAIAccessOpportunity({
    opportunityId: 'kiro-student-university-list',
    context: { institution: 'Cairo University', country: 'EG' },
    date: referenceDate
  });
  assert.equal(decision.status, 'NOT_MATCHED_TO_PUBLISHED_LIST');
});

test('startup routes remain application-gated even when safe preparation is possible', () => {
  const decision = evaluateAIAccessOpportunity({
    opportunityId: 'vercel-startups',
    context: { country: 'EG' },
    date: referenceDate
  });
  assert.equal(decision.status, 'APPLICATION_REQUIRED');
  assert.ok(decision.ownerOnlySteps.some((step) => /application/i.test(step)));
});

test('closed programs are retained for monitoring but excluded from the active owner queue', () => {
  const all = listAIAccessOpportunities({ includeClosed: true });
  const active = listAIAccessOpportunities({ includeClosed: false });
  assert.ok(all.length > active.length);
  assert.ok(all.some((item) => item.status === 'PROGRAM_CLOSED'));
  assert.ok(active.every((item) => !['EXPIRED', 'PROGRAM_CLOSED'].includes(item.status)));
  const queue = buildAIAccessOwnerActionQueue({ context: {}, date: referenceDate });
  assert.ok(queue.every((item) => !['EXPIRED', 'PROGRAM_CLOSED'].includes(item.status)));
});

test('research grants do not become commercial eligibility by being listed', () => {
  const decision = evaluateAIAccessOpportunity({
    opportunityId: 'anthropic-rare-disease-grants',
    context: { country: 'EG', verifiedStudent: true },
    date: referenceDate
  });
  assert.equal(decision.status, 'APPLICATION_REQUIRED');
  assert.ok(decision.reasonCodes.includes('application-and-provider-approval-owner-required'));
});

test('routing plan uses deterministic work first and never embeds credentials', () => {
  const plan = getAIAccessModelRoutingPlan();
  assert.equal(plan[0].preferred, 'deterministic-code');
  assert.ok(plan.some((item) => item.preferred === 'blocked-until-v9-authorized-provider'));
  assert.equal(JSON.stringify(plan).includes('apiKey'), false);
  assert.equal(JSON.stringify(plan).includes('sk-'), false);
});

test('receipt makes no revenue or payment claim and keeps all effects zero', () => {
  const receipt = buildAIAccessReceipt({ context: {}, date: referenceDate });
  assert.equal(receipt.policyVersion, AI_ACCESS_OPPORTUNITY_POLICY_VERSION);
  assert.equal(receipt.catalogCount, AI_ACCESS_OPPORTUNITY_COUNT);
  assert.equal(receipt.truthClassification, 'INTERFACE_ONLY');
  assert.equal(receipt.commercialState.verifiedRevenue, 0);
  assert.equal(receipt.commercialState.verifiedPayments, 0);
  assert.equal(receipt.externalEffectLedger.deployments, 0);
  assert.equal(receipt.decisions.length, AI_ACCESS_OPPORTUNITY_COUNT);
});

test('unknown opportunity IDs cannot silently create access', () => {
  const decision = evaluateAIAccessOpportunity({
    opportunityId: 'invented-provider-offer',
    context: {},
    date: referenceDate
  });
  assert.equal(decision.ok, false);
  assert.equal(decision.status, 'UNKNOWN_OPPORTUNITY');
  assert.equal(decision.externalEffectLedger.purchases, 0);
});

test('evaluation is deterministic for a supplied reference date and does not mutate context', () => {
  const context = { country: 'EG', verifiedStudent: true };
  const before = JSON.stringify(context);
  const first = evaluateAIAccessOpportunity({
    opportunityId: 'gemini-api-free-tier',
    context,
    date: referenceDate
  });
  const second = evaluateAIAccessOpportunity({
    opportunityId: 'gemini-api-free-tier',
    context,
    date: referenceDate
  });
  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(context), before);
});

test('catalog clones prevent callers from mutating canonical records', () => {
  const copy = getAIAccessOpportunity('groq-free-plan');
  copy.status = 'FREE';
  copy.policy.automaticApplication = true;
  assert.equal(getAIAccessOpportunity('groq-free-plan').status, 'FREE_TIER_AVAILABLE');
  assert.equal(getAIAccessOpportunity('groq-free-plan').policy.automaticApplication, false);
});

test('validation rejects a fake positive record and a non-zero effect ledger', () => {
  const fake = [{
    id: 'fake',
    officialUrl: 'https://example.com',
    evidenceClass: 'VERIFIED_FACT',
    lastVerifiedOn: '2026-08-21',
    status: 'FREE_TIER_AVAILABLE',
    policy: { automaticApplication: false },
    externalEffectLedger: { spendCents: 100 }
  }];
  const result = validateAIAccessCatalog(fake);
  assert.equal(result.ok, false);
  assert.ok(result.failures.some((failure) => failure.reason === 'zero-effect-ledger-required'));
});

test('owner queue exposes only owner decisions and no automatic effects', () => {
  const queue = buildAIAccessOwnerActionQueue({ context: {}, date: referenceDate });
  assert.ok(queue.length >= 20);
  for (const item of queue) {
    assert.equal(item.consequenceClass, 'OWNER_REQUIRED');
    assert.deepEqual(item.automaticActions, []);
    assert.equal(item.externalEffectLedger.messages, 0);
  }
});
