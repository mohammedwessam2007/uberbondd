import { createOpenRouterManagementReconciler } from '../src/openrouter-management-reconciler.mjs';
import { compileCognitionEconomicPerimeter } from '../src/cognition-economic-perimeter.mjs';

const key=String(process.env.OPENROUTER_MANAGEMENT_KEY||'');
const memberId=String(process.env.OPENROUTER_MEMBER_ID||'').trim();
if(!key){console.error(JSON.stringify({ok:false,status:'OPENROUTER_MANAGEMENT_KEY_REQUIRED',providerCallsPerformed:0}));process.exit(2);}
if(!memberId){console.error(JSON.stringify({ok:false,status:'OPENROUTER_MEMBER_ID_REQUIRED_FOR_GUARDRAIL_BINDING',providerCallsPerformed:0}));process.exit(2);}
const reconciler=createOpenRouterManagementReconciler({managementKeyProvider:async()=>key});
const usage=await reconciler.listKeyUsage({expectedLabels:['uberbond-runtime-20'],rejectUnexpectedActiveKeys:true});
if(!usage.ok){console.log(JSON.stringify({...usage,providerCallsPerformed:1,secretsReturned:false},null,2));process.exit(2);}
const guardrail=await reconciler.listGuardrails({expectedName:'uberbond-global-28',expectedLimitUsd:28,expectedReset:'monthly',expectedMemberId:memberId});
if(!guardrail.ok){console.log(JSON.stringify({...guardrail,providerCallsPerformed:2,secretsReturned:false},null,2));process.exit(2);}
const byLabel=Object.fromEntries(usage.keys.map(k=>[k.label,k]));
const exact=Number(byLabel['uberbond-runtime-20']?.limitUsd)===20;
const perimeter=compileCognitionEconomicPerimeter({runtimeKeyLimitUsd:Number(byLabel['uberbond-runtime-20']?.limitUsd),typingMindKeyLimitUsd:0,memberGuardrailUsd:Number(guardrail.guardrail?.limitUsd),guardrailScope:'MEMBER_ALL_KEYS',purchaseFeeRate:.055,otherPaidKeyLimitsUsd:[],limitReset:'monthly',includeByokInLimits:true,legacySpendRoutesBlocked:true});
const receipt={ok:exact&&perimeter.ok,status:exact&&perimeter.ok?'GATEWAY_ONLY_RUNTIME_KEY_MEMBER_GUARDRAIL_PERIMETER_RECONCILED':'GATEWAY_ONLY_PROVIDER_PERIMETER_MISMATCH',observedAt:new Date().toISOString(),providerCallsPerformed:2,secretsReturned:false,keys:usage.keys,unexpectedActiveKeys:usage.unexpectedActiveKeys,guardrail:guardrail.guardrail,aggregateLimitUsd:usage.aggregateLimitUsd,aggregateUsageMonthlyUsd:usage.aggregateUsageMonthlyUsd,perimeter:perimeter.plan??null,typingMindDirectProviderKeyRequired:false,legacyDirectTypingMindKeyMustBeDisabled:true,truthBoundary:'Management receipts prove observed key and member-guardrail configuration only. They are not inference authority, semantic authority, or proof of card-fee/tax settlement.'};
console.log(JSON.stringify(receipt,null,2));if(!receipt.ok)process.exitCode=2;
