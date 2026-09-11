import { compileUberSkillAtomPlan, executeUberSkillAtom } from './uberskills-core.mjs';
export const INVOICE_PARSE_ATOM_ID='invoice.parse';
export const compileInvoiceParse=input=>compileUberSkillAtomPlan({...input,atomId:INVOICE_PARSE_ATOM_ID});
export const executeInvoiceParse=input=>executeUberSkillAtom(input);
