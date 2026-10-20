import {createHash} from 'node:crypto';
import {ZERO_EXTERNAL_EFFECTS} from './effect-ledgers.mjs';

export const PHOENIX_BIBLIOGRAPHIC_IDENTITY_VERSION='phoenix.bibliographic-identity.v1';
const sha=s=>'sha256:'+createHash('sha256').update(s).digest('hex');
const envelope=extra=>({
  externalEffectAuthority:'NONE',businessEffectAuthority:'NONE',
  externalEffectLedger:structuredClone(ZERO_EXTERNAL_EFFECTS),...extra
});
const refuse=reason=>envelope({ok:false,status:'BIBLIOGRAPHIC_IDENTITY_REFUSED',reason});
function normDOI(s){
  if(s==null||s==='')return null;
  if(typeof s!=='string')return false;
  const t=s.trim().toLowerCase().replace(/^https?:\/\/(?:dx\.)?doi\.org\//,'').replace(/^doi:\s*/,'');
  return /^10\.\d{4,9}\/[a-z0-9._;():/-]{1,200}$/.test(t)?t:false;
}
function normArxiv(s){
  if(s==null||s==='')return null;
  if(typeof s!=='string')return false;
  const t=s.trim().toLowerCase().replace(/^https?:\/\/arxiv\.org\/(?:abs|pdf)\//,'').replace(/^arxiv:/,'').replace(/v\d+$/,'');
  return /^(?:\d{4}\.\d{4,5}|[a-z][a-z.-]+\/\d{7})$/.test(t)?t:false;
}
function normTitle(s){
  if(typeof s!=='string'||s.length<3||s.length>500)return null;
  const normalized=s.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
  return normalized.length>=3?normalized:null;
}
export function reconcileBibliographicIdentities({sources=[]}={}){
  if(!Array.isArray(sources)||sources.length<1||sources.length>100)
    return refuse('BOUNDED_BIBLIOGRAPHIC_SOURCE_ARRAY_REQUIRED');
  const seen=new Set(),rows=[];
  for(const raw of sources){
    const sourceId=raw?.sourceId,doi=normDOI(raw?.doi),arxiv=normArxiv(raw?.arxiv),title=normTitle(raw?.title);
    if(typeof sourceId!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,100}$/.test(sourceId)
      ||seen.has(sourceId)||doi===false||arxiv===false||!title)
      return refuse('UNIQUE_SOURCE_IDS_AND_VALID_CITATION_FIELDS_REQUIRED');
    seen.add(sourceId);
    rows.push({sourceId,doi,arxiv,title,sourceRef:typeof raw.sourceRef==='string'&&raw.sourceRef.length<=400?raw.sourceRef:null});
  }
  const parent=rows.map((_,i)=>i);
  const root=i=>parent[i]===i?i:(parent[i]=root(parent[i]));
  const members=i=>rows.filter((_,j)=>root(j)===root(i));
  function compatible(i,j){
    const records=[...members(i),...members(j)];
    return new Set(records.map(x=>x.doi).filter(Boolean)).size<=1
      &&new Set(records.map(x=>x.arxiv).filter(Boolean)).size<=1;
  }
  for(let i=0;i<rows.length;i++)for(let j=i+1;j<rows.length;j++){
    if(root(i)===root(j))continue;
    const a=rows[i],b=rows[j];
    const sameStrong=Boolean((a.doi&&a.doi===b.doi)||(a.arxiv&&a.arxiv===b.arxiv));
    const titleBridge=a.title===b.title;
    if(!(sameStrong||titleBridge)||!compatible(i,j))continue;
    parent[root(j)]=root(i);
  }
  const groups=new Map();
  rows.forEach((row,i)=>{const k=root(i);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(row);});
  const papers=[...groups.values()].map(group=>{
    const ids=[...new Set(group.map(x=>x.doi).filter(Boolean))];
    const arxivs=[...new Set(group.map(x=>x.arxiv).filter(Boolean))];
    const sharedTitle=[...new Set(group.map(x=>x.title))];
    const identity=ids.length?'doi:'+ids[0]:arxivs.length?'arxiv:'+arxivs[0]:'title:'+sha(sharedTitle[0]);
    return{paperId:sha(identity),doi:ids[0]||null,arxiv:arxivs[0]||null,
      identityClass:group.length>1 && sharedTitle.length===1 && (ids.length===0||arxivs.length===0)
        ? 'TITLE_BRIDGE_TENTATIVE'
        : ids.length||arxivs.length?'STRUCTURED_IDENTIFIER_OBSERVED':'TITLE_ONLY_TENTATIVE',
      sourceRecords:group.map(x=>({sourceId:x.sourceId,sourceRef:x.sourceRef,originalNormalizedTitle:x.title})).sort((a,b)=>a.sourceId.localeCompare(b.sourceId))};
  }).sort((a,b)=>a.paperId.localeCompare(b.paperId));
  return envelope({ok:true,status:'BIBLIOGRAPHIC_IDENTITIES_RECONCILED',
    originalSources:rows.length,distinctPaperCandidates:papers.length,papers,
    sourceProposalId:'phoenix-wave7-0002',
    truthBoundary:'IDENTIFIER_AND_TITLE_MATCHING_IS_NOT_EXTERNAL_DOI_ARXIV_CROSSREF_VERIFICATION__SOURCE_RECORDS_NEVER_DISCARDED'});
}
