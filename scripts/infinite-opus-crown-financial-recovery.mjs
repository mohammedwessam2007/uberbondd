import { settleCognitionCall, releaseUndispatchedCognition } from '../src/cognition-ledger.mjs';
import { verifyCrownProviderModel } from '../src/crown-model-identity.mjs';

export const RECOVERY_KEY='infinite_opus_crown_financial_recovery_20261001_r1';
export const ORIGINAL_CLAIM='sealed-general-20260930-one-authorized-tournament-v1';
export const ORIGINAL_CALL='sealed-call-06264df855de7eedeb12982dfad2909db0cdcfb0';
export const ORIGINAL_GENERATION='gen-1790807964-m6HWX42a5VtncUFVBpL1';
export const UNDISPATCHED=[
 'sealed-call-f66120a25e6c3904971db18c18be096b48457d23',
 'sealed-call-1e9d0e3549707791fe40af7a15be2e84b76c8bec',
 'sealed-call-60225eada977cb91f4c1d44960138ad0c31e7e12'
];
export function validateOriginalGeneration(d){
 if(d?.id!==ORIGINAL_GENERATION ||
 d?.request_id!=='req-1790807964-Ve3fJIrYt0PXl3LqGRb0' ||
 Date.parse(d?.created_at)!==Date.parse('2026-09-30T22:39:24.829Z') ||
 !verifyCrownProviderModel({requestedModel:'anthropic/claude-opus-5.5',observedModel:d.model,provider:d.provider_name}) ||
 Number(d.total_cost)!==0.011224 ||
 Number(d.native_tokens_prompt)!==681 || Number(d.native_tokens_completion)!==425)
 throw new Error('original-provider-bill-mismatch');
 return d;
}
export async function reconcileOriginalCrownFinancialState({store,generationMetadata}){
 const d=validateOriginalGeneration(generationMetadata);
 return store.transaction(async tx=>{
  if(tx.transactionClient===true)await tx.pool.query('SELECT pg_advisory_xact_lock($1)',[1347375955]);
  const settings=await tx.getSettings();
  if(settings[RECOVERY_KEY]) {
   const prior=settings[RECOVERY_KEY];
   if(prior.status!=='RECONCILED_INVALID_TOURNAMENT_EVIDENCE'||prior.generationId!==d.id)throw new Error('contradictory-financial-recovery');
   return prior;
  }
  const state=structuredClone(settings.infiniteOpusRuntimeV1);
  const claim=settings[ORIGINAL_CLAIM];
  if(!state||claim?.status!=='CLAIMED'||
    claim.snapshotHash!=='sha256:cdaaf3398ee5c78f5e95b44bd45325b3545464aefb8ff3616a4aae97345dcafa')
   throw new Error('exact-historical-claim-required');
  const ledger=state.ledger?.month==='2026-09'?state.ledger:state.archivedLedgers?.['2026-09'];
  const original=ledger?.calls?.find(c=>c.callId===ORIGINAL_CALL);
  if(original?.status!=='DISPATCHED'||original.ceilingMicrousd!==73277||
    original.taskId!=='sealed-paid-0-0-805bb7d11651df598fcb' ||
    original.model!=='anthropic/claude-opus-5.5'||original.provider!=='openrouter')
   throw new Error('exact-original-dispatched-reservation-required');
  for(const id of UNDISPATCHED)if(ledger.calls.find(c=>c.callId===id)?.status!=='RESERVED')
   throw new Error('undispatched-reservation-proof-required');
  // Financial attribution is an explicit forensic reconstruction, NOT a retained
  // cryptographic call/generation binding and NOT semantic tournament evidence.
  const receipt={callId:ORIGINAL_CALL,actualMicrousd:11224,
   receiptRef:d.id,observedModel:original.model,observedProvider:original.provider,
   observedModelRevision:d.model,observedProviderIdentity:d.provider_name,
   bindingMethod:'FORENSIC_SINGLE_DISPATCH_WINDOW',
   retainedExactBinding:false,semanticAuthority:'NONE'};
  let next=settleCognitionCall(ledger,receipt,'2026-09-30').ledger;
  for(const id of UNDISPATCHED)next=releaseUndispatchedCognition(next,id,'2026-09-30');
  if(state.ledger.month==='2026-09')state.ledger=next;
  else{
   state.archivedLedgers['2026-09']=next;
   if(Object.values(state.archivedLedgers).every(l=>l.incidents.length===0&&!l.calls.some(c=>['RESERVED','DISPATCHED'].includes(c.status))))
    state.ledger.incidents=state.ledger.incidents.filter(i=>i.reason!=='HISTORICAL_RECONCILIATION_REQUIRED');
  }
  state.version++;
  const recovered={schemaVersion:'uberbond.crown-financial-recovery.v1',
   status:'RECONCILED_INVALID_TOURNAMENT_EVIDENCE',
   callId:ORIGINAL_CALL,generationId:d.id,actualMicrousd:11224,
   cancelledUndispatchedCallIds:UNDISPATCHED,
   bindingMethod:receipt.bindingMethod,retainedExactBinding:false,
   sourceCommandSha256:'736e1222b20aa7bc0055c0da9258e97d7d5e3b33197508b3fc5948279eb28a14',
   requestBoundAt:'2026-09-30T22:39:24.822759651Z',
   stoppedAt:'2026-09-30T22:39:33.938125970Z',
   providerRequestId:d.request_id,observedModel:d.model,providerIdentity:d.provider_name,
   evidenceRef:'docs/receipts/UBERMIND_CROWN_FINANCIAL_RECONSTRUCTION_2026-10-01.md',
   semanticAuthority:'NONE',oldHiddenTaskContaminated:true,oldAnswersUnavailable:true,
   reconciledAt:new Date().toISOString()};
  state.receipts.push({kind:'COST',...receipt,basis:'OBSERVED_PROVIDER_COST',month:'2026-09'});
  await tx.setSetting('infiniteOpusRuntimeV1',state);
  await tx.setSetting(RECOVERY_KEY,recovered);
  return recovered;
 });
}
