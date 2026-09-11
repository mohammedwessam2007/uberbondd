import { compileUberSkillAtomPlan, executeUberSkillAtom } from './uberskills-core.mjs';
export const CODE_SEARCH_ATOM_ID='code.search';
export const compileCodeSearch=input=>compileUberSkillAtomPlan({...input,atomId:CODE_SEARCH_ATOM_ID});
export const executeCodeSearch=input=>executeUberSkillAtom(input);
