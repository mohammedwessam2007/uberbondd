/**
 * Source-indexed Machiavelli cognitive donor for UberMind / the Ω46 EQ Crown.
 * Full primary translations are NOT bundled; source pointers and original
 * historical paraphrases are evidence-qualified. There are no provider calls.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { brotliDecompressSync } from 'node:zlib';
const sourceUrl = new URL('../artifacts/strategy/machiavelli-principles.v1.json.br.b64', import.meta.url);
const bytes = brotliDecompressSync(Buffer.from(readFileSync(fileURLToPath(sourceUrl), 'utf8').trim(), 'base64'));
const data = Object.freeze(JSON.parse(bytes.toString('utf8')));
const digest = 'sha256:' + createHash('sha256').update(bytes).digest('hex');
const normalize = x => String(x ?? '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
const synonyms = Object.freeze({
  negotiation:['reputation','alliances','incentives','choice','promises','gratitude','trust','interests'],
  sales:['reputation','buyer','benefits','customers','marketing','trust'],
  hiring:['advisers','succession','competence','merit','rewards','trust'],
  competition:['enemy','power','rival','alliances','advantage','counter'],
  persuasion:['reputation','public','trust','words','understand','judgment'],
  emotional:['love','fear','hatred','gratitude','trust','humane','reputation'],
  leadership:['command','institutional','ruler','team','judgment','trust'],
  partnership:['alliance','dependence','partner','trust','incentives'],
  price:['generosity','margin','discount','buyer','value','profit']
});
function contractLimit(n,min,max){return Number.isInteger(n)&&n>=min&&n<=max;}
function fail(reason){return {ok:false,status:'SOURCE_RETRIEVAL_REFUSED',reasonCodes:[reason],businessEffectAuthority:'NONE',modelCalls:0};}
export function machiavelliCorpusStatus(){return {
  ok:true,status:'SOURCE_POINTER_AND_ORIGINAL_PARAPHRASE_INDEX',schema:data.schema,
  sourceDigest:digest,sourceWorks:Object.fromEntries(Object.entries(data.works).map(([id,w])=>[id,{title:w.title,source:w.source,units:w.units,coverage:w.certainty}])),
  sourceAddresses:data.addresses.length,curatedPrinciples:data.principles.length,
  limitations:data.coverageClaim,founderInheritance:data.founderInheritance,
  externalEffectAuthority:'NONE',modelCalls:0
};}
/** Return a source-addressed observation, not authority to operate on people. */
export function getMachiavelliPrinciple(id){
  if(typeof id!=='string'||!/^MACH-[0-9]{4}$/.test(id))return fail('PRINCIPLE_ID_REQUIRED');
  const p=data.principles.find(x=>x.id===id);
  if(!p)return fail('PRINCIPLE_NOT_FOUND');
  return {ok:true,status:'INTERPRETIVE_SOURCE_PARAPHRASE',principle:structuredClone(p),
    workUrl:data.works[p.sectionKey.split(':')[0]].source,sourceDigest:digest,
    guarantee:'INTERPRETIVE_PARAPHRASE_NOT_MACHIAVELLI_QUOTE_OR_MODERN_EMPIRICAL_PROOF',
    businessEffectAuthority:'NONE',modelCalls:0};
}
export function searchMachiavelliPrinciples({query,limit=8,work=null}={}){
  if(typeof query!=='string'||query.length<2||query.length>240||!contractLimit(limit,1,20))return fail('BOUNDED_QUERY_REQUIRED');
  if(work!==null&&!Object.hasOwn(data.works,work))return fail('UNKNOWN_SOURCE_WORK');
  const q=normalize(query);if(q.length<2)return fail('NONEMPTY_NORMALIZED_QUERY_REQUIRED');
  const terms=[...new Set(q.split(' ').filter(x=>x.length>=3))].slice(0,24);
  for(const word of [...terms])if(Object.hasOwn(synonyms,word))terms.push(...synonyms[word]);
  const ranked=data.principles.filter(p=>work===null||p.sectionKey.startsWith(work+':'))
   .map(p=>{
     const title=normalize(p.title),body=normalize([p.historicalParaphrase,p.businessTranslation,p.sectionKey,...p.tags].join(' '));
     const score=terms.reduce((s,t)=>s+(title.includes(t)?4:0)+(body.includes(t)?1:0),0);
     return {p,score};
   }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score||a.p.id.localeCompare(b.p.id)).slice(0,limit);
  return {ok:true,status:ranked.length?'SOURCE_INDEX_MATCHES':'NO_SOURCE_INDEX_MATCHES',query,sourceDigest:digest,
   matches:ranked.map(({p,score})=>({id:p.id,title:p.title,sectionKey:p.sectionKey,
    historicalParaphrase:p.historicalParaphrase,businessTranslation:p.businessTranslation,
    riskTreatment:p.riskTreatment,score,workUrl:data.works[p.sectionKey.split(':')[0]].source})),
   evidenceBoundary:'SOURCE-HEADING-ALIGNED_ORIGINAL_PARAPHRASE; NOT_FULL_PRIMARY_TEXT_OR_REAL_CUSTOMER_OUTCOME',
   businessEffectAuthority:'NONE',modelCalls:0};
}
export function machiavelliChapter({work,book=null,chapter=null}={}){
 if(typeof work!=='string'||!Object.hasOwn(data.works,work))return fail('KNOWN_WORK_REQUIRED');
 let key;
 if(work==='DISCOURSES'){
  if(!contractLimit(book,1,3)||!contractLimit(chapter,1,[60,33,49][book-1]))return fail('VALID_BOOK_AND_CHAPTER_REQUIRED');
  key=`DISCOURSES:${book}.${chapter}`;
 }else if(work==='PRINCE'){
  if(!contractLimit(chapter,1,26))return fail('VALID_PRINCE_CHAPTER_REQUIRED');
  key=`PRINCE:${chapter}`;
 }else{
  if(!contractLimit(book,1,data.works[work].units))return fail('VALID_BOOK_REQUIRED');
  key=`${work}:${book}`;
 }
 const a=data.addresses.find(x=>x.key===key);
 return a?{ok:true,status:'SOURCE_ADDRESS_FOUND',address:structuredClone(a),
   linkedPrinciples:data.principles.filter(x=>x.sectionKey===key).map(x=>x.id),
   originalTextLoaded:false,sourceUrl:data.works[work].source,sourceDigest:digest,
   businessEffectAuthority:'NONE'}:fail('ADDRESS_NOT_INDEXED');
}
