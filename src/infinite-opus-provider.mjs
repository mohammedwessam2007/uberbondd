import { createOpenRouterAgentExecutor } from './openrouter-agent-executor.mjs';
import { semanticHash } from './crown-closure.mjs';

// The existing provider transport remains replaceable. This wrapper reserves
// monthly capacity before dispatch and never releases an uncertain charge.
export function createGovernedOpenRouterExecutor({ store, enabled = false, pricingRecord, apiKey, fetchImpl, role = 'WORKER', platformFeeRate = 0.055 } = {}) {
  return async function execute({ task, callId, maxTokens, now }) {
    if (!enabled) return { ok: false, status:'DISABLED', providerCalls:0 };
    const price = pricingRecord;
    if (!Number.isFinite(platformFeeRate) || platformFeeRate < 0) return {ok:false,status:'FEE_REFUSED',providerCalls:0};
    if (!price || price.provider !== 'openrouter' || !price.model || !price.sourceRef || !Number.isFinite(Date.parse(price.verifiedAt)) || !Number.isFinite(Date.parse(price.expiresAt)) || Date.parse(price.verifiedAt) > Date.parse(now) || Date.parse(price.expiresAt) <= Date.parse(now) || !Number.isSafeInteger(maxTokens) || maxTokens < 1 || maxTokens > 128_000 || !apiKey || !task?.taskId || !task?.objective || (task.consequenceClass && task.consequenceClass !== 'LOCAL_PREPARATION')) return { ok:false, status:'PRICE_OR_CALLABILITY_REFUSED',providerCalls:0 };
    let inputRate = Math.max(price.inputUsdPerMillion, price.cacheWriteUsdPerMillion ?? price.inputUsdPerMillion, price.cacheReadUsdPerMillion ?? price.inputUsdPerMillion);
    let outputRate = price.outputUsdPerMillion;
    for (const tier of price.priceOverrides ?? []) {
      if (300000 >= tier.minPromptTokens) {
        inputRate = Math.max(inputRate, tier.inputUsdPerMillion, tier.cacheWriteUsdPerMillion ?? tier.inputUsdPerMillion);
        outputRate = Math.max(outputRate, tier.outputUsdPerMillion);
      }
    }
    if (price.otherChargesPerUnit && Object.values(price.otherChargesPerUnit).some(v => Number(v) > 0)) return { ok:false,status:'EXTRA_CHARGE_AUTHORIZATION_REQUIRED',providerCalls:0 };
    if (![inputRate,outputRate].every(n=>typeof n==='number' && Number.isFinite(n) && n>=0)) return { ok:false,status:'PRICE_REFUSED',providerCalls:0 };
    // Existing transport bounds the complete JSON body at 300k bytes. Use
    // that upper bound, not a worker's optimistic token estimate.
    const ceilingMicros = Math.max(1,Math.ceil((300_000 * inputRate + maxTokens * outputRate) * (1 + platformFeeRate)));
    const reservation = store.reserve({ callId, day:now?.slice(0,10),role,ceilingMicros,model:price.model,provider:price.provider,taskId:task.taskId,qualityClass:'Q_FRONTIER_PREPARATION',priceExpiresAt:price.expiresAt,now });
    if (!reservation.ok) return {...reservation,providerCalls:0};
    const executor = createOpenRouterAgentExecutor({apiKey,enabled:true,defaultModel:price.model,pricing:price,fetchImpl,maxPromptPrice:inputRate,maxCompletionPrice:outputRate});
    let result;
    try {result = await executor({task,maxTokens,costCeilingCents:Math.ceil(ceilingMicros/10_000),responseCacheEligible:false});}
    catch {result = {ok:false,outcome:'UNCERTAIN',reasonCodes:['provider-exception-no-blind-retry']};}
    const observed = result.usage?.costBasis === 'OPENROUTER_USAGE_COST_OBSERVED' && typeof result.usage.costUsd === 'number' && Number.isFinite(result.usage.costUsd) && result.usage.costUsd >= 0;
    const actualMicros = observed ? Math.ceil(result.usage.costUsd*1_000_000*(1+platformFeeRate)) : null;
    const receiptRef = 'sha256:' + semanticHash({callId,providerRequestId:result.providerRequestId ?? null,observedModel:result.observedModel ?? null,usage:result.usage ?? null,outcome:result.outcome ?? null});
    const reconciliation = store.reconcile({callId,actualMicros,receiptRef});
    return { ...result, reconciliation, semanticAuthority:'PROPOSAL_ONLY', releaseAuthorized:false, providerDispatchAttempts:1, costAccounting:observed?'BILLED_COST_OBSERVED':'UNCERTAIN_HOLD_RESERVATION' };
  };
}
