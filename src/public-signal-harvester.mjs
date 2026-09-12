import crypto from 'node:crypto';

export const PUBLIC_SIGNAL_HARVESTER_VERSION='uberbond.public-signal-harvester.v1';
export const SOURCE_PRIORITY=Object.freeze(['OFFICIAL_API_STREAM','OFFICIAL_API_SEARCH','PUBLIC_WEB_ALLOWED','SEARCH_ENGINE_DISCOVERY']);

const X_HOSTS=new Set(['x.com','twitter.com','www.x.com','www.twitter.com']);
const GITHUB_HOSTS=new Set(['github.com','www.github.com']);
const hash=v=>crypto.createHash('sha256').update(String(v)).digest('hex');
const clean=v=>String(v??'').trim();

export function compileXListeningPlan({accounts=[],topics=[],includeGithubLinks=true}={}){
 const uniq=a=>[...new Set((Array.isArray(a)?a:[]).map(clean).filter(Boolean))];
 const users=uniq(accounts).map(x=>x.replace(/^@/,''));
 const terms=uniq(topics);
 const rules=[];
 for(let i=0;i<users.length;i+=20){const chunk=users.slice(i,i+20);if(chunk.length)rules.push({kind:'ACCOUNT',value:`(${chunk.map(x=>`from:${x}`).join(' OR ')}) -is:retweet`});}
 for(let i=0;i<terms.length;i+=12){const chunk=terms.slice(i,i+12);if(chunk.length)rules.push({kind:'TOPIC',value:`(${chunk.map(x=>/\s/.test(x)?`"${x.replaceAll('"','')}"`:x).join(' OR ')}) -is:retweet`});}
 if(includeGithubLinks)rules.push({kind:'GITHUB_LINK',value:'url:github.com -is:retweet'});
 return {ok:true,status:'X_LISTENING_PLAN_COMPILED',rules,ruleCount:rules.length,sourcePriority:[...SOURCE_PRIORITY],authority:'PUBLIC_READ_RESEARCH_ONLY',truthBoundary:'SOCIAL_POSTS_ARE_SIGNALS_NOT_VERIFIED_FACTS'};
}

export function extractPublicLinks(text=''){
 const links=[];
 const re=/https:\/\/[^\s<>"')\]]+/g;
 for(const raw of String(text).match(re)||[]){try{const u=new URL(raw.replace(/[.,!?;:]+$/,''));links.push(u.toString());}catch{}}
 return [...new Set(links)];
}

export function normalizePublicPost(input={}){
 const id=clean(input.id),author=clean(input.author??input.username).replace(/^@/,''),text=clean(input.text),url=clean(input.url),createdAt=clean(input.createdAt??input.created_at),source=clean(input.source||'X');
 const reasons=[];
 if(!id)reasons.push('id-required');if(!author)reasons.push('author-required');if(!text)reasons.push('text-required');
 let canonicalUrl=null;
 try{const u=new URL(url||`https://x.com/${author}/status/${id}`);if(!X_HOSTS.has(u.hostname.toLowerCase()))reasons.push('x-public-url-required');else{u.search='';u.hash='';canonicalUrl=u.toString();}}catch{reasons.push('valid-url-required');}
 const links=[...new Set([...(Array.isArray(input.links)?input.links:[]),...extractPublicLinks(text)])];
 const githubRepos=[];
 for(const link of links){try{const u=new URL(link);if(GITHUB_HOSTS.has(u.hostname.toLowerCase())){const p=u.pathname.split('/').filter(Boolean);if(p.length>=2)githubRepos.push(`${p[0]}/${p[1].replace(/\.git$/,'')}`);}}catch{}}
 if(reasons.length)return {ok:false,status:'PUBLIC_POST_INVALID',reasonCodes:reasons};
 const fingerprint=hash([source.toLowerCase(),id,author.toLowerCase(),text.toLowerCase().replace(/\s+/g,' ')].join('|'));
 return {ok:true,status:'PUBLIC_POST_NORMALIZED',post:{id,author,text,url:canonicalUrl,createdAt:createdAt||null,source,links,githubRepos:[...new Set(githubRepos)],fingerprint,claimState:'UNVERIFIED_SOCIAL_SIGNAL',authority:'RESEARCH_ONLY'}};
}

export function dedupePublicPosts(posts=[]){
 const unique=new Map(),invalid=[];
 for(const raw of Array.isArray(posts)?posts:[]){const n=normalizePublicPost(raw);if(!n.ok){invalid.push(n);continue;}if(!unique.has(n.post.fingerprint))unique.set(n.post.fingerprint,n.post);}
 return {ok:true,status:'PUBLIC_POSTS_DEDUPED',inputCount:Array.isArray(posts)?posts.length:0,uniqueCount:unique.size,posts:[...unique.values()],invalid};
}

export function atomizePublicPost(input={}){
 const n=input.ok===true&&input.post?input:normalizePublicPost(input);if(!n.ok)return n;
 const p=n.post,lower=p.text.toLowerCase(),atoms=[];
 const add=(type,pattern,label)=>{if(pattern.test(lower))atoms.push({type,label,evidenceRef:p.url,sourceAuthor:p.author,claimState:p.claimState,authority:'NONE'});};
 add('ORCHESTRATION',/multi[- ]agent|swarm|specialist agent|director agent|risk agent|execution agent/,'multi-agent role separation');
 add('AUDITABILITY',/audit|structured log|trail|receipt|replay/,'structured auditable trail');
 add('LOW_LATENCY',/low latency|min(?:imum)? latency|real[- ]time/,'latency-sensitive event processing');
 add('RESEARCH',/research|thesis|analysis|quant|statistical/,'research-to-analysis pipeline');
 add('OPEN_SOURCE',/open source|github|repo/,'open-source mechanism supplier');
 for(const repo of p.githubRepos)atoms.push({type:'REPOSITORY_CANDIDATE',label:repo,evidenceRef:p.url,sourceAuthor:p.author,claimState:p.claimState,authority:'NONE'});
 return {ok:true,status:'PUBLIC_POST_ATOMIZED',fingerprint:p.fingerprint,atoms,destination:['GAMECHANGER_MESH','CAPABILITY_GENOME'],promotionAuthority:'NONE',requiresCorroboration:true};
}

export function buildGamechangerObservationFromPublicPost(input={}){
 const n=input.ok===true&&input.post?input:normalizePublicPost(input);if(!n.ok)return n;
 const p=n.post,atoms=atomizePublicPost(n),domains=['RESEARCH','AUTOMATION'];
 if(p.githubRepos.length)domains.push('OPEN_SOURCE','DEVTOOLS');
 if(/agent|model|llm|ai\b/i.test(p.text))domains.push('AGENT_RUNTIME');
 return {ok:true,status:'PUBLIC_POST_GAMECHANGER_OBSERVATION_READY',observation:{id:`social:${p.source.toLowerCase()}:${p.id}`,sourceId:`social:${p.source.toLowerCase()}:${p.author.toLowerCase()}`,sourceTier:'COMMUNITY_SIGNAL',sourceType:'SOCIAL_POST',url:p.url,title:`Signal from @${p.author}`,summary:p.text.slice(0,6000),observedAt:new Date().toISOString(),publishedAt:p.createdAt||null,domains:[...new Set(domains)],evidenceRefs:[p.url,...p.links].slice(0,128),claims:[p.claimState,...atoms.atoms.map(a=>a.label)].slice(0,128)},authority:'RESEARCH_ONLY'};
}
