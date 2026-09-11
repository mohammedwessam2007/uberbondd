import { compileUberSkillAtomPlan, executeUberSkillAtom } from './uberskills-core.mjs';
export const MODEL_ROUTE_REQUEST_ATOM_ID='model.route-request';
export const compileModelRouteRequest=input=>compileUberSkillAtomPlan({...input,atomId:MODEL_ROUTE_REQUEST_ATOM_ID});
export const executeModelRouteRequest=input=>executeUberSkillAtom(input);
