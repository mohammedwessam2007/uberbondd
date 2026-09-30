import { createOpenRouterManagementReconciler } from '../src/openrouter-management-reconciler.mjs';
import { compileCognitionEconomicPerimeter } from '../src/cognition-economic-perimeter.mjs';

const key=String(process.env.OPENROUTER_MANAGEMENT_KEY||'');
if(!key){console.error(JSON.stringify({ok:false,status:'OPENROUTER_MANAGEMENT_KEY_REQUIRED',providerCallsPerformed:0}));process.exit(2);}
const reconciler=createOpenRouterManagementReconciler({managementKeyProvider:async()=>key});
const usage=await reconciler.listKeyUsage({expectedLabels:['uberbond-runtime','uberbond-typingmind']});
if(!usage.ok){console.log(JSON.stringify({...usage,providerCallsPerformed:1,secretsReturned:false},null,2));process.exit(2);}
const byLabel=Object.fromEntries(usage.keys.map(k=>[k.label,k]));
const exact=Number(byLabel['uberbond-runtime']?.limitUsd)===20&&Number(byLabel['uberbond-typingmind']?.limitUsd)===8;
const perimeter=compileCognitionEconomicPerimeter({runtimeKeyLimitUsd:Number(byLabel['uberbond-runtime']?.limitUsd),typingMindKeyLimitUsd:Number(byLabel['uberbond-typingmind']?.limitUsd),accountGuardrailUsd:28,purchaseFeeRate:.055,otherPaidKeyLimitsUsd:[],limitReset:'monthly',includeByokInLimits:true,legacySpendRoutesBlocked:true});
const receipt={ok:exact&&perimeter.ok,status:exact&&perimeter.ok?'TWO_KEY_PROVIDER_PERIMETER_RECONCILED':'TWO_KEY_PROVIDER_PERIMETER_MISMATCH',observedAt:new Date().toISOString(),providerCallsPerformed:1,secretsReturned:false,keys:usage.keys,aggregateLimitUsd:usage.aggregateLimitUsd,aggregateUsageMonthlyUsd:usage.aggregateUsageMonthlyUsd,perimeter:perimeter.plan??null,truthBoundary:'Provider-management usage receipt only. It is not inference authority, semantic authority, or proof that no non-OpenRouter cash route exists.'};
console.log(JSON.stringify(receipt,null,2));if(!receipt.ok)process.exitCode=2;
