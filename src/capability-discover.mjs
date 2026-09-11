import { compileUberSkillAtomPlan, executeUberSkillAtom } from './uberskills-core.mjs';
export const CAPABILITY_DISCOVER_ATOM_ID='capability.discover';
export const compileCapabilityDiscover=input=>compileUberSkillAtomPlan({...input,atomId:CAPABILITY_DISCOVER_ATOM_ID});
export const executeCapabilityDiscover=input=>executeUberSkillAtom(input);
