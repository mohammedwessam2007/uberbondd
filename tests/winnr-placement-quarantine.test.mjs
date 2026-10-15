import test from 'node:test';
import assert from 'node:assert/strict';
import { applyWinnrPlacementQuarantine } from '../src/winnr-placement-quarantine.mjs';

function fakeStore(accounts){
  const paused=[];
  const settings=[];
  const logs=[];
  return {
    paused,settings,logs,
    store:{
      init:async()=>{},
      list:async key=>key==='accounts'?accounts:[],
      setSenderPaused:async(slot,value,reason)=>paused.push({slot,value,reason}),
      setSetting:async(key,value)=>settings.push({key,value}),
      log:async(event,detail)=>logs.push({event,detail}),
      close:async()=>{}
    }
  };
}

test('pauses only the explicitly named Winnr SMTP slot', async () => {
  const accounts=[1,2,3].map(n=>({id:`smtp-0${n}`,slot:`winnr:slot-${n}`,provider:'smtp-relay'}));
  const {store,paused,settings,logs}=fakeStore(accounts);
  const result=await applyWinnrPlacementQuarantine({config:{},slotsText:'winnr:slot-3',storeFactory:()=>store});
  assert.equal(result.ok,true);
  assert.equal(result.status,'WINNR_PLACEMENT_QUARANTINE_APPLIED');
  assert.equal(result.selection,'EXPLICIT_SLOT_KEYS');
  assert.equal(result.pausedSlotDigests.length,1);
  assert.deepEqual(paused,[{slot:'winnr:slot-3',value:true,reason:'winnr-gmail-placement-red-2026-10-02'}]);
  assert.equal(settings[0].key,'winnrPlacementQuarantineV1');
  assert.equal(logs[0].detail.imapCustodyChanged,false);
  assert.equal(logs[0].detail.senderAddressesLogged,false);
});

test('refuses positional ordinal selection', async () => {
  const accounts=[{id:'smtp-01',slot:'winnr:slot-1',provider:'smtp-relay'}];
  const {store,paused}=fakeStore(accounts);
  const result=await applyWinnrPlacementQuarantine({config:{},ordinalText:'1',slotsText:'',storeFactory:()=>store});
  assert.equal(result.ok,false);
  assert.deepEqual(result.reasonCodes,['ordinal-selection-retired-use-explicit-slots']);
  assert.equal(paused.length,0);
});

test('refuses a slot that matches no Winnr SMTP account without pausing anything', async () => {
  const accounts=[{id:'smtp-01',slot:'winnr:slot-1',provider:'smtp-relay'}];
  const {store,paused}=fakeStore(accounts);
  const result=await applyWinnrPlacementQuarantine({config:{},slotsText:'winnr:missing',storeFactory:()=>store});
  assert.equal(result.ok,false);
  assert.deepEqual(result.reasonCodes,['quarantine-slot-not-found']);
  assert.equal(paused.length,0);
});

test('refuses an ambiguous slot that matches two accounts', async () => {
  const accounts=[
    {id:'smtp-01',slot:'winnr:dup',provider:'smtp-relay'},
    {id:'smtp-02',slot:'winnr:dup',provider:'smtp-relay'}
  ];
  const {store,paused}=fakeStore(accounts);
  const result=await applyWinnrPlacementQuarantine({config:{},slotsText:'winnr:dup',storeFactory:()=>store});
  assert.equal(result.ok,false);
  assert.deepEqual(result.reasonCodes,['quarantine-slot-ambiguous']);
  assert.equal(paused.length,0);
});

test('refuses non-Winnr slots and is disabled when no slot is named', async () => {
  const {store}=fakeStore([]);
  const refused=await applyWinnrPlacementQuarantine({config:{},slotsText:'smtp:other',storeFactory:()=>store});
  assert.equal(refused.ok,false);
  assert.deepEqual(refused.reasonCodes,['quarantine-slot-must-be-winnr-smtp-slot']);
  const disabled=await applyWinnrPlacementQuarantine({config:{},slotsText:'',storeFactory:()=>store});
  assert.equal(disabled.status,'WINNR_PLACEMENT_QUARANTINE_DISABLED');
});
