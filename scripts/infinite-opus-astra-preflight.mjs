import {inspectInfiniteOpusActivationEnvironment} from '../src/infinite-opus-activation-diagnostic.mjs';
import {compileCognitionEconomicPerimeter} from '../src/cognition-economic-perimeter.mjs';

const environment=inspectInfiniteOpusActivationEnvironment(process.env);
const perimeter=compileCognitionEconomicPerimeter({
 runtimeKeyLimitUsd:20,typingMindKeyLimitUsd:0,memberGuardrailUsd:28,
 guardrailScope:'MEMBER_ALL_KEYS',purchaseFeeRate:.055,otherPaidKeyLimitsUsd:[],
 limitReset:'monthly',includeByokInLimits:true,legacySpendRoutesBlocked:true
});
const actions=[];
if(!environment.runtimeOpenRouterKeyPresent)actions.push('WORK_ASTRA_PRIVATE_UI: create/verify uberbond-runtime-20 and store only as Render OPENROUTER_API_KEY');
if(!environment.typingMindGatewayTokenPresent)actions.push('WORK_ASTRA_PRIVATE_UI: generate >=48-char gateway bearer, set Render UBERMIND_TYPINGMIND_GATEWAY_TOKEN and the same TypingMind custom-model Authorization header');
if(!environment.paidAuthorization.current)actions.push('OWNER_GATE: explicit bounded runtime spend authorization required; mint with scripts/infinite-opus-runtime-authorization-mint.mjs');
if(!environment.crownAdmission.current)actions.push('EVIDENCE_GATE: <=$0.05 canary, sealed GENERAL_CROWN tournament, then scripts/infinite-opus-crown-admission-mint.mjs');
const receipt={
 schemaVersion:'uberbond.infinite-opus.astra-preflight.v1',
 observedAt:new Date().toISOString(),
 ok:perimeter.ok,
 status:actions.length?'WORK_ASTRA_PRIVATE_ACTIVATION_REQUIRED':'PRIVATE_ACTIVATION_ENV_PRESENT_AND_CURRENT',
 environment,perimeter:perimeter.plan,
 canonicalCockpit:'TypingMind -> UberBond ubermind/auto; no direct TypingMind OpenRouter inference key',
 actions,
 providerCallsPerformed:0,spendUsd:0,secretsReturned:false,
 truthBoundary:'Preflight inspects redacted presence/current authority only. It cannot create credentials, approve spend, execute a canary, generate sealed evidence, or mint unsupported Crown authority.'
};
console.log(JSON.stringify(receipt,null,2));if(!receipt.ok)process.exitCode=2;
