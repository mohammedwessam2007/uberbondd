import { compileUberSkillAtomPlan, executeUberSkillAtom } from './uberskills-core.mjs';
export const DOCUMENT_GENERATE_SPREADSHEET_ATOM_ID='document.generate-spreadsheet';
export const compileDocumentGenerateSpreadsheet=input=>compileUberSkillAtomPlan({...input,atomId:DOCUMENT_GENERATE_SPREADSHEET_ATOM_ID});
export const executeDocumentGenerateSpreadsheet=input=>executeUberSkillAtom(input);
