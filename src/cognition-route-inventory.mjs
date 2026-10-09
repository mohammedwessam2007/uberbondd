export const COGNITION_ROUTE_INVENTORY_SCHEMA='uberbond.cognition-route-inventory.v1';
export const COGNITION_ROUTES=Object.freeze([
 {id:'openrouter-agent-worker',source:'src/openrouter-agent-executor.mjs',transport:'OPENROUTER',cashMetered:true,admission:'EXISTING_AGENT_WORKER_COMPUTE_BUDGET',status:'GOVERNED_WHEN_CALLED_THROUGH_CANONICAL_FACTORY'},
 {id:'openrouter-governed-transport',source:'src/openrouter-governed-adapter.mjs',transport:'OPENROUTER',cashMetered:true,costClass:'CASH_API_SPEND',admission:'COGNITION_PERIMETER_CAPABILITY_PLUS_CALLER_LEDGER_RESERVATION',status:'FAIL_CLOSED_WITHOUT_ADMISSION'},
 {id:'openrouter-infinite-opus',source:'src/infinite-opus-provider.mjs',transport:'OPENROUTER',cashMetered:true,admission:'INFINITE_OPUS_DURABLE_LEDGER',status:'GOVERNED'},
 {id:'openai-agent-worker',source:'src/openai-agent-executor.mjs',transport:'OPENAI_DIRECT',cashMetered:true,admission:'INFINITE_OPUS_OPENROUTER_ONLY_FACTORY_GATE',status:'FAIL_CLOSED_IN_OPENROUTER_ONLY_CASH_MODE'},
 {id:'anthropic-agent-worker',source:'src/anthropic-agent-executor.mjs',transport:'ANTHROPIC_DIRECT',cashMetered:true,admission:'INFINITE_OPUS_OPENROUTER_ONLY_FACTORY_GATE',status:'FAIL_CLOSED_IN_OPENROUTER_ONLY_CASH_MODE'},
 {id:'vercel-ai-gateway-worker',source:'src/vercel-ai-gateway-executor.mjs',transport:'VERCEL_AI_GATEWAY',cashMetered:true,admission:'INFINITE_OPUS_OPENROUTER_ONLY_FACTORY_GATE',status:'FAIL_CLOSED_IN_OPENROUTER_ONLY_CASH_MODE'},
 {id:'open-model-runtime-worker',source:'src/open-model-runtime-executor.mjs',transport:'OPENAI_COMPATIBLE',cashMetered:'POSSIBLE',admission:'ZERO_CASH_ONLY_IN_INFINITE_OPUS_MODE',status:'ONLY_ZERO_CASH_ALLOWED_IN_INFINITE_OPUS_MODE'},
 {id:'pipeline-ai-helper',source:'src/ai.mjs',transport:'OPENAI_OR_ANTHROPIC_DIRECT',cashMetered:true,admission:'EXPLICIT_COGNITION_PERIMETER_TOKEN',status:'FAIL_CLOSED_WITHOUT_ADMISSION'},
 {id:'uber-socket-openai-conversation',source:'src/openai-conversation-model-adapter.mjs',transport:'OPENAI_DIRECT',cashMetered:true,costClass:'CASH_API_SPEND',admission:'EXPLICIT_COGNITION_PERIMETER_TOKEN',status:'FAIL_CLOSED_WITHOUT_ADMISSION'},
 {id:'founder-center-free-gateway',source:'api/founder-center.mjs',transport:'VERCEL_AI_GATEWAY',cashMetered:false,costClass:'PLAN_INCLUDED_COGNITION',admission:'FREE_MODEL_ONLY_NO_PAID_FALLBACK',status:'NONCASH_GOVERNED'},
 // Refuses without current owner paid authority (20M microusd cap, unexpired, admitted Crown route) and reserves each call's worst case against a spend ceiling first.
 {id:'openrouter-crown-autofinish',source:'scripts/infinite-opus-crown-autofinish.mjs',transport:'OPENROUTER',cashMetered:true,costClass:'CASH_API_SPEND',admission:'CURRENT_PAID_AUTHORITY_PLUS_WORST_CASE_RESERVATION_UNDER_SPEND_CEILING',status:'FAIL_CLOSED_WITHOUT_ADMISSION'},
 // Infers only for an activation-approved profile when the caller asks and the profile is inference-probe-approved; https endpoints may bill.
 {id:'avengers-open-model-profile',source:'src/avengers-arsenal.mjs',transport:'OPENAI_COMPATIBLE',cashMetered:'POSSIBLE',admission:'APPROVED_PROFILE_ACTIVATION_RIGHTS_AND_PRICING_EVIDENCE',status:'FAIL_CLOSED_WITHOUT_ADMISSION'}
]);
export function cognitionRouteInventory(){return {schemaVersion:COGNITION_ROUTE_INVENTORY_SCHEMA,generatedFrom:'STATIC_SOURCE_BOUNDARY_REVIEW',routes:COGNITION_ROUTES.map(x=>({...x})),globalBudgetClaimAllowed:COGNITION_ROUTES.every(x=>String(x.status).startsWith('GOVERNED')||String(x.status).startsWith('FAIL_CLOSED')||x.status==='ONLY_ZERO_CASH_ALLOWED_IN_INFINITE_OPUS_MODE'||x.status==='NONCASH_GOVERNED')};}
