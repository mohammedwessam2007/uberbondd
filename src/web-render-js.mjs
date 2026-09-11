import { compileUberSkillAtomPlan, executeUberSkillAtom } from './uberskills-core.mjs';
export const WEB_RENDER_JS_ATOM_ID='web.render-js';
export const compileWebRenderJs=input=>compileUberSkillAtomPlan({...input,atomId:WEB_RENDER_JS_ATOM_ID});
export const executeWebRenderJs=input=>executeUberSkillAtom(input);
