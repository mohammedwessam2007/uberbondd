import { compileUberSkillAtomPlan, executeUberSkillAtom } from './uberskills-core.mjs';
export const CONTACT_VALIDATE_EMAIL_ATOM_ID='contact.validate-email';
export const compileContactValidateEmail=input=>compileUberSkillAtomPlan({...input,atomId:CONTACT_VALIDATE_EMAIL_ATOM_ID});
export const executeContactValidateEmail=input=>executeUberSkillAtom(input);
