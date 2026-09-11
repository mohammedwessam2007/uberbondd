import { compileUberSkillAtomPlan, executeUberSkillAtom } from './uberskills-core.mjs';
export const DOCUMENT_SUMMARIZE_ATOM_ID='document.summarize';
export const compileDocumentSummarize=input=>compileUberSkillAtomPlan({...input,atomId:DOCUMENT_SUMMARIZE_ATOM_ID});
export const executeDocumentSummarize=input=>executeUberSkillAtom(input);
