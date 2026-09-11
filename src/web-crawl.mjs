import { compileUberSkillAtomPlan, executeUberSkillAtom } from './uberskills-core.mjs';
export const WEB_CRAWL_ATOM_ID='web.crawl';
export const compileWebCrawl=input=>compileUberSkillAtomPlan({...input,atomId:WEB_CRAWL_ATOM_ID});
export const executeWebCrawl=input=>executeUberSkillAtom(input);
