import { compileUberSkillAtomPlan, executeUberSkillAtom } from './uberskills-core.mjs';
export const BUYER_CLASSIFY_INTENT_ATOM_ID='buyer.classify-intent';
export const compileBuyerClassifyIntent=input=>compileUberSkillAtomPlan({...input,atomId:BUYER_CLASSIFY_INTENT_ATOM_ID});
export const executeBuyerClassifyIntent=input=>executeUberSkillAtom(input);
