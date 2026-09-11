import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import { verifyContextProjection } from './context-projection.mjs';

export const CONTEXT_TASK_BINDING_POLICY_VERSION = 'context-task-binding-1.0.0';
export const CONTEXT_TASK_BINDING_SCHEMA_VERSION = 'uberbond.context-task-binding.v1';
const zeroEffects = () => structuredClone(ZERO_EXTERNAL_EFFECTS);
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
}
function digest(value) { return crypto.createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex'); }
function text(value, max) { const out=String(value??'').trim(); return out && out.length<=max ? out : null; }
function fail(reasonCodes,status='CONTEXT_TASK_BINDING_REFUSED') {
  return {ok:false,policyVersion:CONTEXT_TASK_BINDING_POLICY_VERSION,status,reasonCodes:[...new Set((reasonCodes||[]).filter(Boolean))],businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zeroEffects()};
}
function payload(value={}) { const {bindingId:_ignored,...rest}=value; return rest; }

export function compileTaskBoundContextProjection({projection,taskId,taskClass=null,objective=null}={}) {
  const verified=verifyContextProjection(projection);
  if(!verified.ok) return fail(['verified-context-projection-required']);
  const id=text(taskId,300);
  const klass=taskClass==null?null:text(taskClass,160);
  const goal=objective==null?null:text(objective,16000);
  if(!id) return fail(['bounded-task-id-required']);
  if(taskClass!=null&&!klass) return fail(['bounded-task-class-required']);
  if(objective!=null&&!goal) return fail(['bounded-task-objective-required']);
  const bound={schemaVersion:CONTEXT_TASK_BINDING_SCHEMA_VERSION,projection,taskBinding:{taskId:id,taskClass:klass,objectiveSha256:goal?digest(goal):null,sourceCommit:projection.sourceCommit,projectionId:projection.projectionId,audience:projection.audience},consequenceAuthority:'NONE',businessEffectAuthority:'NONE',externalEffectAuthority:'NONE'};
  bound.bindingId=digest(payload(bound));
  return {ok:true,policyVersion:CONTEXT_TASK_BINDING_POLICY_VERSION,status:'CONTEXT_TASK_BINDING_READY',boundProjection:bound,externalEffectLedger:zeroEffects()};
}

export function verifyTaskBoundContextProjection(bound,{taskId=null,taskClass=null,objective=null,audience=null,sourceCommit=null}={}) {
  if(!bound||typeof bound!=='object'||Array.isArray(bound)) return fail(['context-task-binding-object-required'],'CONTEXT_TASK_BINDING_INVALID');
  if(bound.schemaVersion!==CONTEXT_TASK_BINDING_SCHEMA_VERSION) return fail(['context-task-binding-schema-mismatch'],'CONTEXT_TASK_BINDING_INVALID');
  if(!/^[a-f0-9]{64}$/.test(String(bound.bindingId||''))||bound.bindingId!==digest(payload(bound))) return fail(['context-task-binding-digest-mismatch'],'CONTEXT_TASK_BINDING_INVALID');
  if(bound.consequenceAuthority!=='NONE'||bound.businessEffectAuthority!=='NONE'||bound.externalEffectAuthority!=='NONE') return fail(['zero-context-task-binding-authority-required'],'CONTEXT_TASK_BINDING_INVALID');
  const nested=verifyContextProjection(bound.projection,{audience,sourceCommit});
  if(!nested.ok) return fail(['nested-context-projection-invalid',...(nested.reasonCodes||[])],'CONTEXT_TASK_BINDING_INVALID');
  const binding=bound.taskBinding;
  if(!binding||typeof binding!=='object'||Array.isArray(binding)||!text(binding.taskId,300)) return fail(['task-binding-required'],'CONTEXT_TASK_BINDING_INVALID');
  if(binding.projectionId!==bound.projection.projectionId||binding.sourceCommit!==bound.projection.sourceCommit||binding.audience!==bound.projection.audience) return fail(['task-binding-projection-identity-mismatch'],'CONTEXT_TASK_BINDING_INVALID');
  if(taskId&&binding.taskId!==String(taskId)) return fail(['context-task-binding-task-mismatch'],'CONTEXT_TASK_BINDING_INVALID');
  if(taskClass!=null&&binding.taskClass!==String(taskClass)) return fail(['context-task-binding-class-mismatch'],'CONTEXT_TASK_BINDING_INVALID');
  if(objective!=null&&binding.objectiveSha256!==digest(String(objective))) return fail(['context-task-binding-objective-mismatch'],'CONTEXT_TASK_BINDING_INVALID');
  return {ok:true,policyVersion:CONTEXT_TASK_BINDING_POLICY_VERSION,status:'CONTEXT_TASK_BINDING_VERIFIED',bindingId:bound.bindingId,projectionId:bound.projection.projectionId,taskId:binding.taskId,sourceCommit:binding.sourceCommit,brainstateId:bound.projection.brainstateId,contextMountId:bound.projection.contextMountId,businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zeroEffects()};
}
