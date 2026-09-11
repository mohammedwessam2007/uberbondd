import { compileUberSkillAtomPlan, executeUberSkillAtom } from './uberskills-core.mjs';
export const CAPABILITY_REVOKE_ATOM_ID='capability.revoke';
export const compileCapabilityRevoke=input=>compileUberSkillAtomPlan({...input,atomId:CAPABILITY_REVOKE_ATOM_ID});
export const executeCapabilityRevoke=input=>executeUberSkillAtom(input);
