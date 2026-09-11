import { compileUberSkillAtomPlan, executeUberSkillAtom } from './uberskills-core.mjs';
export const CONTEXT_COMPRESS_REVERSIBLE_ATOM_ID='context.compress-reversible';
export const compileContextCompressReversible=input=>compileUberSkillAtomPlan({...input,atomId:CONTEXT_COMPRESS_REVERSIBLE_ATOM_ID});
export const executeContextCompressReversible=input=>executeUberSkillAtom(input);
