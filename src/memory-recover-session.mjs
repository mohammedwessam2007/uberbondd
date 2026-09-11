import { compileUberSkillAtomPlan, executeUberSkillAtom } from './uberskills-core.mjs';
export const MEMORY_RECOVER_SESSION_ATOM_ID='memory.recover-session';
export const compileMemoryRecoverSession=input=>compileUberSkillAtomPlan({...input,atomId:MEMORY_RECOVER_SESSION_ATOM_ID});
export const executeMemoryRecoverSession=input=>executeUberSkillAtom(input);
