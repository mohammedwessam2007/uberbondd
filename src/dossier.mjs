import { now } from './utils.mjs';

export function buildDossier({prospect,crawl,audit,contact,score,issue,inbox,subject,draft,aiMeta={}}){
  return {
    generatedAt:now(),
    company:{name:prospect.company,website:prospect.website,domain:crawl.domain,country:prospect.country||'',industry:prospect.niche||prospect.industry||''},
    qualification:{qualified:Boolean(issue&&score.total>=55),score:score.total,tier:score.tier,breakdown:score.breakdown,explanation:score.explanation},
    crawl:{engine:crawl.engine,pagesVisited:crawl.summary?.pagesVisited||crawl.pages?.length||0,errors:crawl.errors||[],completedAt:crawl.completedAt},
    primaryOpportunity:issue||null,
    observations:audit,
    contact:contact||null,
    routing:{inbox},
    outreach:{subject,draft},
    screenshots:(crawl.pages||[]).map(p=>({url:p.url,...p.screenshots})),
    riskFlags:[
      ...(crawl.errors?.length?[`${crawl.errors.length} crawl error(s)`]:[]),
      ...(!contact?.email?['No verified or public email selected']:[]),
      ...(!issue?['No outreach-safe finding met the confidence threshold']:[]),
      ...(audit.some(x=>x.confidence<0.72)?['Some findings require human review']:[])
    ],
    provenance:{rulesVersion:'nightshift-rules-1.0',aiProvider:aiMeta.provider||'rules',aiModel:aiMeta.model||'',promptVersion:'audit-v1'}
  };
}
