import { compileUberSkillAtomPlan, executeUberSkillAtom } from './uberskills-core.mjs';
export const DATA_EXTRACT_STRUCTURED_ATOM_ID='data.extract-structured';
export const compileDataExtractStructured=input=>compileUberSkillAtomPlan({...input,atomId:DATA_EXTRACT_STRUCTURED_ATOM_ID});
export const executeDataExtractStructured=input=>executeUberSkillAtom(input);
