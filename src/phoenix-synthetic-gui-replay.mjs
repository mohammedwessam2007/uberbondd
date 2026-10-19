import { createHash } from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const PHOENIX_GUI_REPLAY_VERSION='phoenix.synthetic-gui-replay.v1';
const hash=v=>'sha256:'+createHash('sha256').update(JSON.stringify(v)).digest('hex');
const envelope=extra=>({
  externalEffectAuthority:'NONE',businessEffectAuthority:'NONE',
  externalEffectLedger:structuredClone(ZERO_EXTERNAL_EFFECTS),...extra
});
const refuse=reason=>envelope({ok:false,status:'SYNTHETIC_GUI_REPLAY_REFUSED',reason});
const validId=v=>typeof v==='string' && /^[a-zA-Z][a-zA-Z0-9_-]{0,79}$/.test(v);
const validLabel=v=>typeof v==='string' && v.length>0 && v.length<=100 && !/[\u0000-\u001f]/.test(v);
function safeFields(fields){
  if(!Array.isArray(fields)||fields.length<1||fields.length>30)return null;
  const ids=new Set(),out=[];
  for(const field of fields){
    if(!field||!validId(field.id)||!validLabel(field.label)
      ||!['TEXTBOX','BUTTON'].includes(field.role)||ids.has(field.id))return null;
    ids.add(field.id);
    out.push({id:field.id,label:field.label,role:field.role});
  }
  return out;
}
function safeActions(actions){
  if(!Array.isArray(actions)||actions.length<1||actions.length>30)return null;
  const ids=new Set(),out=[];
  for(const step of actions){
    if(!step||!validId(step.id)||ids.has(step.id)||!validId(step.fieldId)
      ||!['TYPE','CLICK'].includes(step.kind)
      ||(step.kind==='TYPE'&&(typeof step.value!=='string'||step.value.length>512))
      ||(step.kind==='CLICK' && step.value!==undefined))return null;
    ids.add(step.id);
    out.push({id:step.id,fieldId:step.fieldId,kind:step.kind,
      ...(step.kind==='TYPE'?{value:step.value}:{})});
  }
  return out;
}
const identity=field=>hash({id:field.id,label:field.label,role:field.role});

export function compileSyntheticGuiRecording({fields,actions}={}){
  const normalizedFields=safeFields(fields),normalizedActions=safeActions(actions);
  if(!normalizedFields||!normalizedActions)return refuse('BOUNDED_TYPED_FIELDS_AND_ACTIONS_REQUIRED');
  const byId=new Map(normalizedFields.map(f=>[f.id,f]));
  const steps=[];
  for(const a of normalizedActions){
    const f=byId.get(a.fieldId);
    if(!f)return refuse('RECORDING_REFERENCES_MISSING_TARGET');
    if((a.kind==='TYPE'&&f.role!=='TEXTBOX')||(a.kind==='CLICK'&&f.role!=='BUTTON'))
      return refuse('ACTION_TARGET_ROLE_MISMATCH');
    steps.push({id:a.id,fieldId:a.fieldId,kind:a.kind,
      ...(a.kind==='TYPE'?{valueDigest:hash(a.value)}:{}),
      expectedFieldIdentity:identity(f)});
  }
  const recording={schema:PHOENIX_GUI_REPLAY_VERSION,fields:normalizedFields,steps};
  return envelope({ok:true,status:'SYNTHETIC_GUI_RECORDING_COMPILED',recording,
    recordingDigest:hash(recording),sourceProposalId:'phoenix-wave5-0001',
    truthBoundary:'RECORDED_VIRTUAL_APP_ACTIONS_NOT_A_REAL_BROWSER_SESSION'});
}

export function replaySyntheticGuiRecording({fields,recording}={}){
  const targetFields=safeFields(fields);
  if(!targetFields||!recording||recording.schema!==PHOENIX_GUI_REPLAY_VERSION
    ||!Array.isArray(recording.steps)||recording.steps.length<1||recording.steps.length>30)
    return refuse('VERIFIED_RECORDING_AND_BOUNDED_TARGET_REQUIRED');
  // The runtime never evals code, opens network, touches a page or sends a
  // message. Only the in-memory synthetic fixture changes.
  const byId=new Map(targetFields.map(f=>[f.id,f]));
  const state=new Map();
  for(const step of recording.steps){
    if(!step||!validId(step.id)||!validId(step.fieldId)||!['TYPE','CLICK'].includes(step.kind))
      return refuse('INVALID_REPLAY_STEP');
    const target=byId.get(step.fieldId);
    if(!target||identity(target)!==step.expectedFieldIdentity)
      return refuse('TARGET_IDENTITY_CHANGED__REPLAY_STOPPED');
    if(step.kind==='TYPE'){
      if(target.role!=='TEXTBOX'||typeof step.valueDigest!=='string'
        ||!/^sha256:[a-f0-9]{64}$/.test(step.valueDigest)||'value' in step)
        return refuse('UNSAFE_TYPE_ACTION');
      state.set(step.fieldId,{typedDigest:step.valueDigest});
    }else{
      if(target.role!=='BUTTON'||step.value!==undefined)return refuse('UNSAFE_CLICK_ACTION');
      const n=state.get(step.fieldId)?.clicks||0;state.set(step.fieldId,{clicks:n+1});
    }
  }
  const digest=hash([...state.entries()].sort(([a],[b])=>a.localeCompare(b)));
  return envelope({ok:true,status:'SYNTHETIC_GUI_REPLAY_COMPLETE',
    executedStepCount:recording.steps.length,virtualStateDigest:digest,
    modelCalls:0,realBrowserEffects:0,sourceProposalId:'phoenix-wave5-0001',
    truthBoundary:'VIRTUAL_FIXTURE_REPLAY_ONLY__NO_APPROVAL_FOR_REAL_BROWSER_EFFECTS'});
}
