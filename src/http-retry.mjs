import { compileUberSkillAtomPlan, executeUberSkillAtom } from './uberskills-core.mjs';
export const HTTP_RETRY_ATOM_ID='http.retry';
export const compileHttpRetry=input=>compileUberSkillAtomPlan({...input,atomId:HTTP_RETRY_ATOM_ID});
export const executeHttpRetry=input=>executeUberSkillAtom(input);
