import { compileUberSkillAtomPlan, executeUberSkillAtom } from './uberskills-core.mjs';
export const CODE_EVALUATE_GENERATED_ATOM_ID='code.evaluate-generated';
export const compileCodeEvaluateGenerated=input=>compileUberSkillAtomPlan({...input,atomId:CODE_EVALUATE_GENERATED_ATOM_ID});
export const executeCodeEvaluateGenerated=input=>executeUberSkillAtom(input);
