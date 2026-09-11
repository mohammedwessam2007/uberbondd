import { compileUberSkillAtomPlan, executeUberSkillAtom } from './uberskills-core.mjs';
export const CAPABILITY_DEDUPE_ATOM_ID='capability.dedupe';
export const compileCapabilityDedupe=input=>compileUberSkillAtomPlan({...input,atomId:CAPABILITY_DEDUPE_ATOM_ID});
export const executeCapabilityDedupe=input=>executeUberSkillAtom(input);
