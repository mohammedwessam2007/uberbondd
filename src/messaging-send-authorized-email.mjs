import { compileUberSkillAtomPlan, executeUberSkillAtom } from './uberskills-core.mjs';
export const MESSAGING_SEND_AUTHORIZED_EMAIL_ATOM_ID='messaging.send-authorized-email';
export const compileMessagingSendAuthorizedEmail=input=>compileUberSkillAtomPlan({...input,atomId:MESSAGING_SEND_AUTHORIZED_EMAIL_ATOM_ID});
export const executeMessagingSendAuthorizedEmail=input=>executeUberSkillAtom(input);
