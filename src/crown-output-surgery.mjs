export const CROWN_PATCH_OPS=Object.freeze(['ACCEPT','REJECT','PATCH','ADD','DELETE','BOUNDARY','INVALIDATOR','TEST','ABSTAIN','ESCALATE']);
export function validateCrownSemanticPatch(patch={}){
 const reasons=[];
 if(!CROWN_PATCH_OPS.includes(patch.op))reasons.push('unsupported-crown-patch-op');
 if(typeof patch.target!=='string'||!patch.target||patch.target.length>500)reasons.push('bounded-target-required');
 if(patch.payload!=null&&JSON.stringify(patch.payload).length>12000)reasons.push('bounded-payload-required');
 if(patch.op==='PATCH'&&!patch.payload)reasons.push('patch-payload-required');
 if(['ACCEPT','REJECT','ABSTAIN','ESCALATE'].includes(patch.op)&&patch.payload!=null)reasons.push('verdict-op-must-not-regenerate-stable-artifact');
 return {ok:reasons.length===0,status:reasons.length?'CROWN_PATCH_REFUSED':'CROWN_PATCH_ADMITTED',reasons,stableProseRegenerationAuthorized:false};
}
export function applyCrownSemanticPatch(document,patch){
 const v=validateCrownSemanticPatch(patch);if(!v.ok)return v;
 if(patch.op!=='PATCH'&&patch.op!=='ADD'&&patch.op!=='DELETE')return {...v,document,materialized:false};
 const next=structuredClone(document??{});
 if(patch.op==='DELETE')delete next[patch.target];
 else next[patch.target]=structuredClone(patch.payload);
 return {...v,document:next,materialized:true};
}
