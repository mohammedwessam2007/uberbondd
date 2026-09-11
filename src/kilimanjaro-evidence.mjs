import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const KILIMANJARO_EVIDENCE_VERSION='uberbond.kilimanjaro-evidence.v1';
const zero=()=>structuredClone(ZERO_EXTERNAL_EFFECTS);

export function compileKilimanjaroEvidence({tests,pass,fail,skipped=0,sourceRef=null}={}){
  const values=[tests,pass,fail,skipped].map(Number);
  const valid=values.every(Number.isSafeInteger)&&values.every(v=>v>=0)&&pass+fail+skipped===tests&&typeof sourceRef==='string'&&sourceRef.trim().length>0;
  if(!valid)return {ok:false,status:'KILIMANJARO_EVIDENCE_INVALID',reasonCodes:['consistent-bounded-suite-counts-and-source-ref-required'],businessEffectAuthority:'NONE',externalEffectLedger:zero()};
  return {
    ok:fail===0,
    status:fail===0?'KILIMANJARO_SUITE_EVIDENCE_PASS':'KILIMANJARO_SUITE_EVIDENCE_FAIL',
    suite:{tests,pass,fail,skipped,sourceRef:sourceRef.trim()},
    runtimeClaim:'NONE',
    externalOutcomeClaim:'NONE',
    businessEffectAuthority:'NONE',
    externalEffectLedger:zero()
  };
}
