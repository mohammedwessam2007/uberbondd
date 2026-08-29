import crypto from 'node:crypto';

export const ECONOMIC_FEEDBACK_ALLOCATOR_POLICY_VERSION='uberbond.economic-feedback-allocator.v1';
const PROHIBITED_KEY=/(?:^|_)(?:race|ethnicity|ethnic_origin|religion|disability|medical_condition|health_condition|sexual_orientation|sex_life|gender_identity|pregnancy|political_affiliation|union_membership|biometric|genetic|criminal_history)(?:$|_)/i;
const text=(v,m=300)=>String(v??'').trim().slice(0,m);
const sha=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
function fail(reasonCodes,extra={}){return {ok:false,policyVersion:ECONOMIC_FEEDBACK_ALLOCATOR_POLICY_VERSION,status:'BLOCKED',reasonCodes:[...new Set(reasonCodes)],businessEffectAuthority:'NONE',...extra};}

export function proposeProfileWeightUpdates({segments=[],policy={}}={}){
 const minOutcomes=Math.max(1,Math.round(Number(policy.minOutcomes||10))), minPaid=Math.max(1,Math.round(Number(policy.minPaidOutcomes||3))), explorationFloor=clamp(Number(policy.explorationFloor??0.1),0.01,0.5), maxDelta=clamp(Number(policy.maxWeightDeltaPerCycle??0.15),0.01,0.5), minWeight=clamp(Number(policy.minWeight??0.25),0.01,1), maxWeight=Math.max(1,Number(policy.maxWeight??4));
 const results=[]; const errors=[];
 for(const [index,s] of (Array.isArray(segments)?segments:[]).slice(0,500).entries()){
  const profileKey=text(s?.profileKey,180), dimensions=s?.dimensions&&typeof s.dimensions==='object'?s.dimensions:{}; if(!profileKey){errors.push({index,reason:'profile-key-required'});continue;} if(Object.keys(dimensions).some(key=>PROHIBITED_KEY.test(String(key)))){errors.push({index,profileKey,reason:'protected-or-sensitive-profile-dimension-prohibited'});continue;}
  const exposures=Math.max(0,Math.round(Number(s.exposures||0))), outcomes=Math.max(0,Math.round(Number(s.qualifiedOutcomes||0))), paid=Math.max(0,Math.round(Number(s.paidAcceptedOutcomes||0))), clearedContributionCents=Number(s.clearedContributionCents), founderMinutes=Number(s.founderMinutes), currentWeight=clamp(Number(s.currentWeight||1),minWeight,maxWeight);
  if(outcomes>exposures||paid>outcomes){errors.push({index,profileKey,reason:'invalid-outcome-counts'});continue;}
  const enough=exposures>=minOutcomes&&paid>=minPaid&&Number.isFinite(clearedContributionCents)&&Number.isFinite(founderMinutes)&&founderMinutes>0;
  const posterior=(paid+1)/(exposures+2); const contributionPerFounderMinute=Number.isFinite(clearedContributionCents)&&Number.isFinite(founderMinutes)&&founderMinutes>0?clearedContributionCents/founderMinutes:null;
  results.push({profileKey,dimensions,exposures,qualifiedOutcomes:outcomes,paidAcceptedOutcomes:paid,posteriorPaidAcceptedRate:Number(posterior.toFixed(6)),clearedContributionCents:Number.isFinite(clearedContributionCents)?clearedContributionCents:null,founderMinutes:Number.isFinite(founderMinutes)?founderMinutes:null,contributionCentsPerFounderMinute:contributionPerFounderMinute==null?null:Number(contributionPerFounderMinute.toFixed(4)),currentWeight,enoughEconomicEvidence:enough});
 }
 if(errors.length)return fail(['invalid-segment-observation'],{errors});
 const eligible=results.filter(r=>r.enoughEconomicEvidence); const baseline=eligible.length?eligible.reduce((a,r)=>a+r.contributionCentsPerFounderMinute,0)/eligible.length:null;
 const updates=results.map(r=>{
  if(!r.enoughEconomicEvidence||baseline==null||baseline<=0)return {...r,proposedWeight:r.currentWeight,weightDelta:0,allocationState:'HOLD_FOR_MORE_EVIDENCE'};
  const relative=clamp(r.contributionCentsPerFounderMinute/baseline,0.25,4); const signal=(relative-1)*r.posteriorPaidAcceptedRate; const delta=clamp(signal,-maxDelta,maxDelta); const proposed=clamp(r.currentWeight*(1+delta),Math.max(minWeight,explorationFloor),maxWeight); return {...r,proposedWeight:Number(proposed.toFixed(6)),weightDelta:Number((proposed-r.currentWeight).toFixed(6)),allocationState:'BOUNDED_REALLOCATION_PROPOSED'};
 });
 const proposal={schemaVersion:'economic-feedback-allocation-proposal-1.0.0',proposalId:`alloc_${sha({updates,policy:{minOutcomes,minPaid,explorationFloor,maxDelta,minWeight,maxWeight}}).slice(0,28)}`,policy:{minOutcomes,minPaidOutcomes:minPaid,explorationFloor,maxWeightDeltaPerCycle:maxDelta,minWeight,maxWeight},updates,law:'WEIGHTS_ONLY; NO CODE_CHANGE; NO AUTHORITY_CHANGE; NO PROTECTED_TRAITS; EXPLORATION_FLOOR_PRESERVED; CLEARED_CONTRIBUTION_AND_ACCEPTED_PAID_OUTCOME_REQUIRED_FOR_REALLOCATION'};
 return {ok:true,policyVersion:ECONOMIC_FEEDBACK_ALLOCATOR_POLICY_VERSION,status:eligible.length?'ALLOCATION_PROPOSAL_READY':'INSUFFICIENT_ECONOMIC_EVIDENCE',proposal,businessEffectAuthority:'NONE'};
}

export function economicProfileWeightsSchemaSql(){
 return `CREATE TABLE IF NOT EXISTS economic_profile_weights (\n  profile_key TEXT PRIMARY KEY,\n  dimensions JSONB NOT NULL DEFAULT '{}'::jsonb,\n  weight DOUBLE PRECISION NOT NULL DEFAULT 1.0 CHECK(weight>0),\n  exposures INTEGER NOT NULL DEFAULT 0 CHECK(exposures>=0),\n  qualified_outcomes INTEGER NOT NULL DEFAULT 0 CHECK(qualified_outcomes>=0),\n  paid_accepted_outcomes INTEGER NOT NULL DEFAULT 0 CHECK(paid_accepted_outcomes>=0),\n  cleared_contribution_cents BIGINT,\n  founder_minutes DOUBLE PRECISION,\n  policy_version TEXT NOT NULL,\n  proposal_id TEXT,\n  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()\n);`;
}

export async function applyWeightProposal(pool,proposal){
 if(!pool?.query) throw new Error('PostgreSQL pool with query() required');
 if(!proposal?.proposalId || proposal.schemaVersion!=='economic-feedback-allocation-proposal-1.0.0') throw new Error('valid allocation proposal required');
 const applied=[]; const conflicts=[];
 for(const u of proposal.updates||[]){
   if(u.allocationState!=='BOUNDED_REALLOCATION_PROPOSED') continue;
   const r=await pool.query(`INSERT INTO economic_profile_weights(profile_key,dimensions,weight,exposures,qualified_outcomes,paid_accepted_outcomes,cleared_contribution_cents,founder_minutes,policy_version,proposal_id,updated_at) VALUES($1,$2::jsonb,$3,$4,$5,$6,$7,$8,$9,$10,now()) ON CONFLICT(profile_key) DO UPDATE SET dimensions=EXCLUDED.dimensions,weight=EXCLUDED.weight,exposures=EXCLUDED.exposures,qualified_outcomes=EXCLUDED.qualified_outcomes,paid_accepted_outcomes=EXCLUDED.paid_accepted_outcomes,cleared_contribution_cents=EXCLUDED.cleared_contribution_cents,founder_minutes=EXCLUDED.founder_minutes,policy_version=EXCLUDED.policy_version,proposal_id=EXCLUDED.proposal_id,updated_at=now() WHERE abs(economic_profile_weights.weight-$11) < 0.0000001 RETURNING profile_key,weight`,[u.profileKey,JSON.stringify(u.dimensions||{}),u.proposedWeight,u.exposures,u.qualifiedOutcomes,u.paidAcceptedOutcomes,u.clearedContributionCents,u.founderMinutes,ECONOMIC_FEEDBACK_ALLOCATOR_POLICY_VERSION,proposal.proposalId,u.currentWeight]);
   if(r.rows?.length) applied.push(r.rows[0]); else conflicts.push({profileKey:u.profileKey,reason:'concurrent-weight-change-requires-recompute'});
 }
 return {ok:conflicts.length===0,status:conflicts.length?'PARTIAL_CONCURRENT_CONFLICT':'WEIGHTS_APPLIED',proposalId:proposal.proposalId,applied,conflicts,businessEffectAuthority:'NONE'};
}
