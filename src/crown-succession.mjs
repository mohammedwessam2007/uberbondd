export function planCrownSuccession({currentRoles={},marketCandidates=[],trigger,compiledCapital=[]}={}){
 const allowed=new Set(['NEW_MODEL_RELEASE','PRICE_CHANGE','PROVIDER_DEGRADATION','QUALITY_REGRESSION','SCHEDULED_REVALIDATION']);
 if(!allowed.has(trigger))return{ok:false,status:'SUCCESSION_TRIGGER_REFUSED'};
 const challengers=marketCandidates.filter(c=>c.callability==='VERIFIED'&&c.freshness==='CURRENT'&&Array.isArray(c.roles)&&c.roles.length);
 const audits=compiledCapital.filter(a=>a&&a.status==='VALID_FOR_CURRENT_TYPED_SCOPE').map(a=>({assetId:a.assetId,currentCrownRevision:a.crownRevision,action:'REVALIDATE_IF_ROLE_CROWN_CHANGES',automaticDeletion:false}));
 return{ok:true,status:challengers.length?'SUCCESSION_TOURNAMENT_REQUIRED':'NO_VERIFIED_CHALLENGER',trigger,incumbents:currentRoles,challengers,audits,promotionLaw:'EVIDENCE_WIN_ONLY',rollback:'KEEP_PREVIOUS_ROLE_UNTIL_NEW_ADMISSION_VALID'};
}
export function applySuccession({currentRoles={},tournamentRoles={},admissionReceipts={}}={}){
 const next={...currentRoles},changed=[];for(const [role,candidate] of Object.entries(tournamentRoles)){const receipt=admissionReceipts[role];if(receipt?.semanticAuthority!=='CURRENT_TASK_CLASS_CROWN'||receipt?.exactModelId!==candidate)continue;if(next[role]!==candidate){changed.push({role,from:next[role]??null,to:candidate});next[role]=candidate;}}
 return{ok:true,status:changed.length?'CROWN_SUCCESSION_APPLIED':'NO_ADMITTED_CHANGE',roles:next,changed,decompileCompiledCapital:changed.length>0};
}
