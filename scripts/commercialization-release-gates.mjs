#!/usr/bin/env node
// Local evidence and authorization RELEASE HOLD. Never promotes Store readiness
// from implementation, model forecasts or CI alone. This does not send, bill,
// publish, migrate, deploy, or grant approval.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = new URL('../artifacts/commercialization/', import.meta.url);
const load = name => JSON.parse(readFileSync(new URL(name, root), 'utf8'));
export const EVIDENCE_POLICY = 'uberbond.commercial-omega-release-gate.2026-10.v1';
export function evaluateCommercialRelease({quality = load('quality-eval-2026-10.json'), economics = load('unit-economics-2026-10.json')} = {}) {
  const matched = (quality.evaluations ?? []).filter(e => e.automatedIndependentStatus === 'PARSER_CORROBORATED_NOT_HUMAN_VERIFIED' && e.sourceShaMatches === true).length;
  // Unknown is never zero failures or a passed gate. These measurements are
  // report fixtures, not a release-authority credential.
  const human = Number.isSafeInteger(quality.independentlyHumanVerified) ? quality.independentlyHumanVerified : null;
  const target = Number.isSafeInteger(quality.supportedFindingsTarget) && quality.supportedFindingsTarget > 0 ? quality.supportedFindingsTarget : 20;
  const cleared = economics.measured?.clearedContributionProfitUsd === 0 ? 0 : null;
  const gates = {
    matchedOriginalSourceCount: matched,
    humanAcceptedFindings: human,
    targetHumanAcceptedFindings: target,
    independentAccuracyAcceptance: human !== null && human >= target ? 'REQUIRES_EXTERNAL_SOURCE_VALIDATION' : 'FAILED',
    apifyBilledCompute: economics.measured?.actualApifyCU === 'UNKNOWN_NOT_BILLED_BY_APIFY' ? 'NOT_VERIFIED' : 'REQUIRES_PROVIDER_RECEIPT',
    independentPaymentAndSecurityReview: 'NOT_VERIFIED',
    apifyStoreAccountPriceAndPayout: 'NOT_VERIFIED',
    realBuyerDeliveryAcceptance: 'NOT_VERIFIED',
    clearedContributionProfitUsd: cleared,
    externalEffectAuthority: 'NONE'
  };
  return { policy:EVIDENCE_POLICY, status:'HOLD_NOT_READY', stage:'ENGINEERING_CAN_BE_TESTED__STORE_AND_BUYER_RELEASE_NOT_AUTHORIZED', gates, stopReasons:[
    human === null || human < target ? 'HUMAN_ACCEPTED_FINDINGS_SHORTFALL' : 'HUMAN_PROVENANCE_INDEPENDENCE_NOT_YET_AUTHENTICATED',
    'APIFY_BILLED_COMPUTE_AND_SELLER_ACCOUNT_NOT_PROVEN',
    'INDEPENDENT_REVIEW_NOT_PROVEN',
    'CUSTOMER_AND_PAYMENT_ACCEPTANCE_NOT_PROVEN'
  ], actionsProhibited:['publish','collect-payment','outbound','production-deploy','merge-without-review'] };
}
if (process.argv[1] && fileURLToPath(import.meta.url) === fileURLToPath(new URL(`file://${process.argv[1]}`))) {
  const result=evaluateCommercialRelease();
  console.log(JSON.stringify(result,null,2));
  if(process.argv.includes('--require-ready')) process.exitCode=2;
}
