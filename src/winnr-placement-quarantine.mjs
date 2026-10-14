import crypto from 'node:crypto';
import { createStore } from './store.mjs';

const clean=(v,n=500)=>String(v??'').trim().slice(0,n);
const digest=v=>crypto.createHash('sha256').update(String(v??'')).digest('hex');

// Quarantine selects senders by explicit stable slot (`winnr:<address>`), never by position in a list.
// A position in a sorted account list changes when accounts are added, so it can hold the wrong sender.
export async function applyWinnrPlacementQuarantine({
  config,
  slotsText=process.env.WINNR_PLACEMENT_QUARANTINE_SLOTS || '',
  ordinalText=process.env.WINNR_PLACEMENT_QUARANTINE_ORDINALS || '',
  storeFactory=createStore
}={}){
  if(clean(ordinalText,200))return {ok:false,status:'WINNR_PLACEMENT_QUARANTINE_REFUSED',reasonCodes:['ordinal-selection-retired-use-explicit-slots']};
  const slots=[...new Set(String(slotsText||'').split(',').map(s=>clean(s,200)).filter(Boolean))].sort();
  if(!slots.length)return {ok:true,status:'WINNR_PLACEMENT_QUARANTINE_DISABLED',pausedSlotDigests:[]};
  if(slots.some(slot=>!slot.startsWith('winnr:')))return {ok:false,status:'WINNR_PLACEMENT_QUARANTINE_REFUSED',reasonCodes:['quarantine-slot-must-be-winnr-smtp-slot']};
  const store=storeFactory(config);
  try{
    await store.init();
    const accounts=(await store.list('accounts'))
      .filter(a=>a?.provider==='smtp-relay'&&String(a?.slot||'').startsWith('winnr:'));
    const paused=[];
    for(const slot of slots){
      const matches=accounts.filter(a=>a.slot===slot);
      if(matches.length===0)return {ok:false,status:'WINNR_PLACEMENT_QUARANTINE_REFUSED',reasonCodes:['quarantine-slot-not-found'],slotDigest:digest(slot)};
      if(matches.length>1)return {ok:false,status:'WINNR_PLACEMENT_QUARANTINE_REFUSED',reasonCodes:['quarantine-slot-ambiguous'],slotDigest:digest(slot)};
    }
    for(const slot of slots){
      await store.setSenderPaused(slot,true,'winnr-gmail-placement-red-2026-10-02');
      paused.push(digest(slot));
    }
    const receipt={
      appliedAt:new Date().toISOString(),
      pausedSlotDigests:paused,
      selection:'EXPLICIT_SLOT_KEYS',
      reason:'GMAIL_PLACEMENT_RED',
      scope:'SMTP_FLEET_SELECTION_ONLY',
      imapCustodyChanged:false,
      prospectSendAuthorityGranted:false
    };
    await store.setSetting('winnrPlacementQuarantineV1',receipt);
    await store.log('winnr_placement_quarantine_applied',{
      pausedCount:paused.length,
      reason:receipt.reason,
      selection:receipt.selection,
      senderAddressesLogged:false,
      credentialsLogged:false,
      imapCustodyChanged:false
    });
    return {ok:true,status:'WINNR_PLACEMENT_QUARANTINE_APPLIED',...receipt};
  }catch(error){
    return {ok:false,status:'WINNR_PLACEMENT_QUARANTINE_FAILED',reasonCodes:[clean(error?.message||error,200)]};
  }finally{await store.close().catch(()=>{});}
}
