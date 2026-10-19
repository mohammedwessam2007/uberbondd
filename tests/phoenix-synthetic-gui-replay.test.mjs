import test from 'node:test';
import assert from 'node:assert/strict';
import {compileSyntheticGuiRecording,replaySyntheticGuiRecording} from '../src/phoenix-synthetic-gui-replay.mjs';
import {runPhoenixCosCommand} from '../scripts/phoenix-cos-operator.mjs';
const fields=[
  {id:'email',label:'Email Address',role:'TEXTBOX'},
  {id:'submit',label:'Submit',role:'BUTTON'}
];
const actions=[
  {id:'step1',kind:'TYPE',fieldId:'email',value:'synthetic-secret@invalid.example'},
  {id:'step2',kind:'CLICK',fieldId:'submit'}
];
test('Wave 5 synthetic recording replays twice with no model calls or real effects',()=>{
  const compiled=compileSyntheticGuiRecording({fields,actions});
  assert.equal(compiled.ok,true);
  assert.equal(compiled.status,'SYNTHETIC_GUI_RECORDING_COMPILED');
  assert.equal(JSON.stringify(compiled).includes('synthetic-secret@invalid.example'),false);
  const a=replaySyntheticGuiRecording({fields,recording:compiled.recording});
  const b=replaySyntheticGuiRecording({fields,recording:compiled.recording});
  assert.equal(a.ok,true);
  assert.equal(b.ok,true);
  assert.equal(a.virtualStateDigest,b.virtualStateDigest);
  assert.equal(a.executedStepCount,2);
  assert.equal(a.modelCalls,0);
  assert.equal(a.realBrowserEffects,0);
  assert.equal(a.externalEffectLedger.providerCalls,0);
  assert.equal(a.externalEffectLedger.messages,0);
});
test('target-label change fails closed before replaying actions',()=>{
  const compiled=compileSyntheticGuiRecording({fields,actions});
  const changed=[{id:'email',label:'Other Field',role:'TEXTBOX'},fields[1]];
  const denied=replaySyntheticGuiRecording({fields:changed,recording:compiled.recording});
  assert.equal(denied.ok,false);
  assert.equal(denied.reason,'TARGET_IDENTITY_CHANGED__REPLAY_STOPPED');
});
test('missing targets, wrong roles, unknown operations and injected dynamic content are denied',()=>{
  assert.equal(compileSyntheticGuiRecording({fields,actions:[{id:'bad',fieldId:'unknown',kind:'CLICK'}]}).ok,false);
  assert.equal(compileSyntheticGuiRecording({fields,actions:[{id:'bad',fieldId:'email',kind:'CLICK'}]}).ok,false);
  assert.equal(compileSyntheticGuiRecording({fields,actions:[{id:'bad',fieldId:'email',kind:'eval',value:'1+1'}]}).ok,false);
  assert.equal(compileSyntheticGuiRecording({fields,actions:[{id:'bad',fieldId:'email',kind:'TYPE',value:'x'.repeat(10000)}]}).ok,false);
  const recording=compileSyntheticGuiRecording({fields,actions}).recording;
  const corrupt=structuredClone(recording);corrupt.steps[0].value='LEAK';
  const denied=replaySyntheticGuiRecording({fields,recording:corrupt});
  assert.equal(denied.ok,false);
});
test('CoS terminal command compiles and replays a bounded fixture without source values',()=>{
  const compiled=runPhoenixCosCommand(['gui-record',JSON.stringify({fields,actions})]);
  assert.equal(compiled.ok,true);
  const replay=runPhoenixCosCommand(['gui-replay',JSON.stringify({fields,recording:compiled.recording})]);
  assert.equal(replay.ok,true);
  assert.equal(replay.status,'SYNTHETIC_GUI_REPLAY_COMPLETE');
  assert.equal(replay.externalEffectAuthority,'NONE');
  assert.equal(replay.externalEffectLedger.spendCents,0);
});
