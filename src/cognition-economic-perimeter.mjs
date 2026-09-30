import crypto from 'node:crypto';

export const ECONOMIC_PERIMETER_SCHEMA='uberbond.cognition-economic-perimeter.v1';
export const HARD_ALL_IN_USD=30;
export const MAX_INFERENCE_USD=28;
export const RUNTIME_KEY_LIMIT_USD=20;
export const TYPINGMIND_KEY_LIMIT_USD=0;
export const LEGACY_DIRECT_TYPINGMIND_KEY_LIMIT_USD=8;
export const CROWN_RESERVE_USD=15;
export const FEE_BUFFER_USD=2;
const cents=x=>Math.round(Number(x)*100);
const finite=x=>Number.isFinite(Number(x))&&Number(x)>=0;
const digest=x=>'sha256:'+crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');

export function compileCognitionEconomicPerimeter(input={}){
  const runtime=Number(input.runtimeKeyLimitUsd??RUNTIME_KEY_LIMIT_USD);
  const interactive=Number(input.typingMindKeyLimitUsd??TYPINGMIND_KEY_LIMIT_USD);
  const account=Number(input.memberGuardrailUsd??input.accountGuardrailUsd??MAX_INFERENCE_USD);
  const feeRate=Number(input.purchaseFeeRate??0.055);
  const other=Array.isArray(input.otherPaidKeyLimitsUsd)?input.otherPaidKeyLimitsUsd.map(Number):[];
  const reasons=[];
  if(![runtime,interactive,account,feeRate,...other].every(finite)) reasons.push('finite-nonnegative-limits-required');
  if(cents(runtime)<cents(CROWN_RESERVE_USD)) reasons.push('runtime-key-must-protect-15-dollar-crown-reserve');
  const aggregate=runtime+interactive+other.reduce((a,b)=>a+b,0);
  if(cents(aggregate)>cents(MAX_INFERENCE_USD)) reasons.push('aggregate-key-limits-exceed-28-dollar-inference-envelope');
  if(cents(account)>cents(MAX_INFERENCE_USD)) reasons.push('member-guardrail-exceeds-28-dollar-inference-envelope');
  if(input.guardrailScope!=='MEMBER_ALL_KEYS') reasons.push('member-all-keys-cross-key-guardrail-required');
  if(cents(aggregate)>cents(account)) reasons.push('aggregate-keys-exceed-account-guardrail');
  const worstAllIn=aggregate*(1+feeRate);
  if(cents(worstAllIn)>cents(HARD_ALL_IN_USD)) reasons.push('purchase-fee-adjusted-envelope-exceeds-30-dollars');
  if(input.limitReset!=='monthly') reasons.push('monthly-provider-reset-required');
  if(input.includeByokInLimits!==true) reasons.push('byok-must-count-toward-provider-limits');
  if(input.legacySpendRoutesBlocked!==true) reasons.push('all-other-cash-metered-routes-must-be-blocked-or-budgeted');
  const plan={schemaVersion:ECONOMIC_PERIMETER_SCHEMA,runtimeKeyLimitUsd:runtime,typingMindKeyLimitUsd:interactive,
    memberGuardrailUsd:account,guardrailScope:'MEMBER_ALL_KEYS',aggregateKeyLimitsUsd:aggregate,purchaseFeeRate:feeRate,worstCaseAllInUsd:Number(worstAllIn.toFixed(6)),
    crownReserveUsd:CROWN_RESERVE_USD,feeBufferUsd:FEE_BUFFER_USD,limitReset:'monthly',includeByokInLimits:true,
    queueBeforeDowngrade:true,automaticSpendAuthority:false,
    cockpitArchitecture:interactive===0?'UBERBOND_GATEWAY_ONLY':'DIRECT_PROVIDER_COCKPIT_COMPATIBILITY'};
  return {ok:reasons.length===0,status:reasons.length?'ECONOMIC_PERIMETER_REFUSED':'ECONOMIC_PERIMETER_CLOSED_BY_CONFIGURATION',reasons,plan,planHash:digest(plan)};
}

export function reconcileChannels({runtimeUsageUsd,typingMindUsageUsd,otherCashUsageUsd=0,providerAccountUsageUsd,unsettled=[]}={}){
  const values=[runtimeUsageUsd,typingMindUsageUsd,otherCashUsageUsd,providerAccountUsageUsd].map(Number);
  if(!values.every(finite)||!Array.isArray(unsettled)) return {ok:false,status:'OBSERVED_CHANNEL_USAGE_REQUIRED'};
  const channelTotal=values[0]+values[1]+values[2];
  const delta=Math.abs(channelTotal-values[3]);
  if(unsettled.length) return {ok:false,status:'UNCERTAIN_CHARGES_HOLD_CAPACITY',channelTotalUsd:channelTotal,providerAccountUsageUsd:values[3],deltaUsd:delta};
  if(cents(delta)!==0) return {ok:false,status:'PROVIDER_ACCOUNT_RECONCILIATION_MISMATCH',channelTotalUsd:channelTotal,providerAccountUsageUsd:values[3],deltaUsd:delta};
  return {ok:true,status:'GLOBAL_CASH_LEDGER_RECONCILED',channelTotalUsd:channelTotal,providerAccountUsageUsd:values[3],remainingInferenceUsd:Math.max(0,MAX_INFERENCE_USD-values[3])};
}
