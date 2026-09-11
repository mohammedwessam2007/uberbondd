import { compileUberSkillAtomPlan, executeUberSkillAtom } from './uberskills-core.mjs';
export const CAPABILITY_RETRIEVE_ATOM_ID='capability.retrieve';
export const compileCapabilityRetrieve=input=>compileUberSkillAtomPlan({...input,atomId:CAPABILITY_RETRIEVE_ATOM_ID});
export const executeCapabilityRetrieve=input=>executeUberSkillAtom(input);
