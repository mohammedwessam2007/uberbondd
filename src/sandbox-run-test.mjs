import { compileUberSkillAtomPlan, executeUberSkillAtom } from './uberskills-core.mjs';
export const SANDBOX_RUN_TEST_ATOM_ID='sandbox.run-test';
export const compileSandboxRunTest=input=>compileUberSkillAtomPlan({...input,atomId:SANDBOX_RUN_TEST_ATOM_ID});
export const executeSandboxRunTest=input=>executeUberSkillAtom(input);
