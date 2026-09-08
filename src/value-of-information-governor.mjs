export const VALUE_OF_INFORMATION_GOVERNOR_VERSION='uberbond.value-of-information-governor.v1';
const ZERO=Object.freeze({customerMessages:0,providerCalls:0,spendCents:0,deployments:0,dnsChanges:0,credentialChanges:0,paymentMutations:0,productionMutations:0});
const text=(v,max=1000)=>{const s=String(v??'').trim();return s&&s.length<=max?s:null;};
const num=(v)=>{const n=Number(v);return Number.isFinite(n)&&n>=0?n:null;};
const fail=(status,reasons,extra={})=>({ok:false,status,reasonCodes:[...new Set(reasons.filter(Boolean))],businessEffectAuthority:'NONE',externalEffectLedger:{...ZERO},...extra});

export function evaluateValueOfInformation({decision=null,unit=null,budgetUnits=null,currentEvidenceSufficient=false,observe=null,defer=null}={}){
 const d=text(decision,1200);const u=text(unit,80);const budget=num(budgetUnits);
 if(!d||!u||budget===null)return fail('VOI_PROTOCOL_INVALID',['decision-unit-and-budget-required']);
 const obs={canChangeDecision:observe?.canChangeDecision===true,discriminating:observe?.discriminating===true,informationValueUnits:num(observe?.informationValueUnits),costUnits:num(observe?.costUnits),delayCostUnits:num(observe?.delayCostUnits),optionDecayUnits:num(observe?.optionDecayUnits),requiresExternalEffect:observe?.requiresExternalEffect===true};
 const def={informationGainUnits:num(defer?.informationGainUnits),delayCostUnits:num(defer?.delayCostUnits),optionDecayUnits:num(defer?.optionDecayUnits),windowRemainsOpen:defer?.windowRemainsOpen===true};
 if(Object.values(obs).slice(2,6).some(v=>v===null)||[def.informationGainUnits,def.delayCostUnits,def.optionDecayUnits].some(v=>v===null))return fail('VOI_PROTOCOL_INVALID',['nonnegative-commensurable-values-required']);
 const observationCost=obs.costUnits+obs.delayCostUnits+obs.optionDecayUnits;
 const observationNet=obs.informationValueUnits-observationCost;
 const deferCost=def.delayCostUnits+def.optionDecayUnits;
 const deferNet=def.informationGainUnits-deferCost;
 let status='ABSTAIN__NO_INFORMATION_ACTION_DOMINATES';
 if(obs.canChangeDecision&&obs.discriminating&&observationCost<=budget&&observationNet>Math.max(0,deferNet))status='OBSERVE_ONE_JUSTIFIED';
 else if(def.windowRemainsOpen&&deferNet>Math.max(0,observationNet))status='DEFER_JUSTIFIED';
 else if(currentEvidenceSufficient)status='ACT_NOW_INFORMATIONALLY_SUFFICIENT';
 return{ok:true,status,decision:d,unit:u,budgetUnits:budget,observe:{...obs,totalCostUnits:observationCost,netInformationValueUnits:observationNet,eligible:obs.canChangeDecision&&obs.discriminating&&observationCost<=budget},defer:{...def,totalCostUnits:deferCost,netInformationValueUnits:deferNet},currentEvidenceSufficient:Boolean(currentEvidenceSufficient),executionBoundary:obs.requiresExternalEffect?'OBSERVATION_REQUIRES_SEPARATE_BOUNDED_EXPERIMENT_AND_AUTHORITY_ADMISSION':'THIS_GOVERNOR_ONLY_VALUES_INFORMATION__IT_DOES_NOT_EXECUTE_THE_OBSERVATION',valueBoundary:'UNITS_MUST_BE_DECLARED_COMMENSURABLE_FOR_THIS_DECISION__THEY_ARE_NOT_A_SCALAR_UTILITY_OF_A_HUMAN_LIFE',businessEffectAuthority:'NONE',externalEffectLedger:{...ZERO}};
}
