import test from 'node:test';
import assert from 'node:assert/strict';
import { applyWinnrPlacementQuarantine } from '../src/winnr-placement-quarantine.mjs';

test('pauses only requested Winnr SMTP ordinal', async () => {
  const paused=[];
  const settings=[];
  const logs=[];
  const accounts=[1,2,3].map(n=>({id:`smtp-0${n}`,slot:`winnr:slot-${n}`,provider:'smtp-relay'}));
  const store={
    init:async()=>{},
    list:async key=>key==='accounts'?accounts:[],
    setSenderPaused:async(slot,value,reason)=>paused.push({slot,value,reason}),
    setSetting:async(key,value)=>settings.push({key,value}),
    log:async(event,detail)=>logs.push({event,detail}),
    close:async()=>{}
  };
  const result=await applyWinnrPlacementQuarantine({
    config:{},
    ordinalText:'3',
    storeFactory:()=>store
  });
  assert.equal(result.ok,true);
  assert.equal(result.status,'WINNR_PLACEMENT_QUARANTINE_APPLIED');
  assert.deepEqual(result.pausedOrdinals,[3]);
  assert.deepEqual(paused,[{slot:'winnr:slot-3',value:true,reason:'winnr-gmail-placement-red-2026-10-02'}]);
  assert.equal(settings[0].key,'winnrPlacementQuarantineV1');
  assert.equal(logs[0].detail.imapCustodyChanged,false);
});
