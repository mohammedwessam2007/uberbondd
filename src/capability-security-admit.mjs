import { compileUberSkillAtomPlan, executeUberSkillAtom } from './uberskills-core.mjs';
export const CAPABILITY_SECURITY_ADMIT_ATOM_ID='capability.security-admit';
export const compileCapabilitySecurityAdmit=input=>compileUberSkillAtomPlan({...input,atomId:CAPABILITY_SECURITY_ADMIT_ATOM_ID});
export const executeCapabilitySecurityAdmit=input=>executeUberSkillAtom(input);
