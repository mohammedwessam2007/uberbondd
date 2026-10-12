/**
 * UberWarm6: robust economic dominance certificate, NOT inbox reputation magic.
 *
 * Let N = certified upper bound on legally eligible first touches in the paid
 * billing window, V = certified upper bound on incremental CLEARED contribution
 * value of one additional Inbox delivery (cents), d = certified upper bound on
 * paid warmer's causal Inbox-placement advantage, and O = certified bound on
 * attributable future-option value not already counted in N*V*d.
 *
 * Paid warming's maximum defensible incremental value <= N*V*d + O.
 * UberBond's own incremental running cost C must also be upper bounded.
 * If the proven recurring fee F is STRICTLY GREATER than N*V*d + O + C, then
 * choosing zero-added-cost warming is economically dominant within the stated
 * horizon/assumptions. This does NOT establish better Inbox placement.
 *
 * Missing, manipulated, forward-looking, or unauthenticated evidence may
 * never create a dominance certificate. The code has no send/spend effects.
 */
export const UBERWARM6_PROOF_VERSION='uberbond.uberwarm6-economic-dominance.v1';
const int=v=>Number.isSafeInteger(v)&&v>=0?v:null;
const frac=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=1?v:null;
const nonempty=v=>typeof v==='string'&&v.trim().length>=12;
const noProof=(why,more={})=>Object.freeze({
  version:UBERWARM6_PROOF_VERSION,status:'NOT_CERTIFIED',
  reasonCodes:[...new Set(why)].sort(),
  zeroAddonEconomicallyDominant:false,
  paidWarmingOutperformsInbox:false,
  evidenceQuality:'NOT_ESTABLISHED',
  doesNotAuthorizeSend:true,doesNotAuthorizeSpend:true,
  ...more
});
const safeVerify=(callback,payload)=>{
  try{return typeof callback==='function'&&callback(payload)===true}catch{return false}
};
export function compileUberWarm6EconomicDominance({
  horizonDays=30,paidFeeCents=null,
  certifiedEligibleUpper=null,certifiedValuePerExtraInboxCentsUpper=null,
  certifiedPaidPlacementUpliftUpper=null,certifiedFutureOptionValueCentsUpper=null,
  certifiedFreeOperatingCostCentsUpper=null,
  feeEvidenceRef='',eligibleEvidenceRef='',valueEvidenceRef='',
  causalUpliftEvidenceRef='',futureOptionEvidenceRef='',freeOperatingCostEvidenceRef='',
  verifyPaidFee,verifyEligibleUpper,verifyValueUpper,
  verifyCausalUpliftUpper,verifyFutureOptionUpper,verifyFreeOperatingCostUpper
}={}) {
  const reasons=[];
  const F=int(paidFeeCents),N=int(certifiedEligibleUpper);
  const V=int(certifiedValuePerExtraInboxCentsUpper);
  const delta=frac(certifiedPaidPlacementUpliftUpper);
  const O=int(certifiedFutureOptionValueCentsUpper);
  const C=int(certifiedFreeOperatingCostCentsUpper);
  const H=int(horizonDays);
  if(!H||H>366)reasons.push('invalid-comparison-horizon');
  if(F===null||F===0)reasons.push('positive-paid-fee-not-established');
  if(N===null)reasons.push('eligible-horizon-volume-upper-bound-unknown');
  if(V===null)reasons.push('cleared-contribution-upper-bound-unknown');
  if(delta===null)reasons.push('causal-paid-uplift-upper-bound-unknown');
  if(O===null)reasons.push('future-option-value-upper-bound-unknown');
  if(C===null)reasons.push('free-path-operating-cost-upper-bound-unknown');
  const proofs=[
    ['paid-fee-not-verified',verifyPaidFee,{value:F,evidenceRef:feeEvidenceRef,horizonDays:H},feeEvidenceRef],
    ['eligible-volume-bound-not-verified',verifyEligibleUpper,{value:N,evidenceRef:eligibleEvidenceRef,horizonDays:H},eligibleEvidenceRef],
    ['cleared-contribution-bound-not-verified',verifyValueUpper,{value:V,evidenceRef:valueEvidenceRef,horizonDays:H},valueEvidenceRef],
    ['causal-uplift-bound-not-verified',verifyCausalUpliftUpper,{value:delta,evidenceRef:causalUpliftEvidenceRef,horizonDays:H},causalUpliftEvidenceRef],
    ['future-option-bound-not-verified',verifyFutureOptionUpper,{value:O,evidenceRef:futureOptionEvidenceRef,horizonDays:H},futureOptionEvidenceRef],
    ['free-operating-cost-bound-not-verified',verifyFreeOperatingCostUpper,{value:C,evidenceRef:freeOperatingCostEvidenceRef,horizonDays:H},freeOperatingCostEvidenceRef]
  ];
  for(const [reason,callback,payload,ref] of proofs) {
    if(!nonempty(ref)||!safeVerify(callback,payload))reasons.push(reason);
  }
  if(reasons.length)return noProof(reasons,{
    observedInputs:{horizonDays:H,paidFeeCents:F,certifiedEligibleUpper:N},
    nextStep:'Do not purchase automatically. Obtain independent bounded cost, eligible volume, causal uplift, cash contribution and future-option evidence.'
  });
  const bound=N*V*delta+O+C;
  if(!Number.isFinite(bound)||bound>Number.MAX_SAFE_INTEGER)
    return noProof(['bound-arithmetic-not-safe']);
  const maximumPaidBenefitCents=Math.ceil(bound);
  const conservativeAdvantageCents=F-maximumPaidBenefitCents;
  const dominance=conservativeAdvantageCents>0;
  const certified=Object.freeze({
    version:UBERWARM6_PROOF_VERSION,
    status:dominance?'PROVEN_ZERO_ADDON_ECONOMIC_DOMINANCE':'NO_PROOF_PAID_ADDON_UNECONOMICAL',
    reasonCodes:dominance?[]:['paid-possible-value-exceeds-or-equals-fee'],
    horizonDays:H,paidFeeCents:F,
    eligibleFirstTouchUpper:N,valuePerExtraInboxCentsUpper:V,
    paidPlacementUpliftUpper:delta,
    futureOptionValueCentsUpper:O,
    freePathOperatingCostCentsUpper:C,
    maximumPaidBenefitCents,
    conservativeZeroAddonAdvantageCents:conservativeAdvantageCents,
    zeroAddonEconomicallyDominant:dominance,
    paidWarmingOutperformsInbox:false,
    evidenceQuality:'SERVER_VERIFIED_UPPER_BOUND_ASSERTIONS',
    doesNotAuthorizeSend:true,doesNotAuthorizeSpend:true,
    proofStatement:dominance?
      'Within the authenticated horizon and certified bounds on uplift, future benefits and the free path own costs, no paid warming uplift can repay its verified fee.':
      'The admitted evidence still permits paid warming to recover its fee. No robust economic dominance proof exists.',
    truthBoundary:'Conditional bounded-cash theorem, not a claim of universal Inbox superiority, guaranteed delivery, or a license to contact unapproved recipients.'
  });
  return certified;
}
/**
 * Analytic break-even in percentage points, using expected realized cash.
 * Completely HYPOTHETICAL until all causal/recipient/value inputs verified.
 */
export function calculateUberWarm6BreakEven({
  paidFeeCents=3000,eligibleFirstTouches=null,
  clearedContributionCentsPerExtraInbox=null,
  futureOptionValueCents=0
}={}) {
  const fee=int(paidFeeCents),n=int(eligibleFirstTouches);
  const v=int(clearedContributionCentsPerExtraInbox),option=int(futureOptionValueCents);
  if(fee===null||n===null||v===null||option===null)
    return {status:'INVALID_INPUT',breakEvenUpliftPercentagePoints:null};
  const required=Math.max(0,fee-option);
  const denominator=n*v;
  if(denominator===0)return {
    status:required>0?'NO_CURRENT_INBOX_PATH_TO_RECOVER_FEE':'FEE_COVERED_BY_ASSUMED_OTHER_OPTION',
    breakEvenUpliftPercentagePoints:null,
    interpretation:'With zero eligible volume or zero cleared value, placement gains cannot recover paid warming inside this window; future option must be analyzed separately.'
  };
  const fraction=required/denominator;
  return Object.freeze({
    status:fraction>1?'IMPOSSIBLE_TO_BREAK_EVEN_THROUGH_INBOX_PLACEMENT_ALONE':'HYPOTHETICAL_THRESHOLD',
    breakEvenUpliftPercentagePoints:Number((fraction*100).toFixed(6)),
    requiredAdditionalInboxDeliveries:Math.ceil(required/v),
    maximumIncrementalInboxProbability:1,
    observedCausalUpliftProof:false,
    numericalTruth:'Illustrative threshold only: even a realistic uplift may be zero or negative and cleared contribution per inbox is not yet observed.'
  });
}
