import { compileUberSkillAtomPlan, executeUberSkillAtom } from './uberskills-core.mjs';
export const CLOUD_INSPECT_DEPLOYMENT_ATOM_ID='cloud.inspect-deployment';
export const compileCloudInspectDeployment=input=>compileUberSkillAtomPlan({...input,atomId:CLOUD_INSPECT_DEPLOYMENT_ATOM_ID});
export const executeCloudInspectDeployment=input=>executeUberSkillAtom(input);
