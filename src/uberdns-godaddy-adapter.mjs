import crypto from 'node:crypto';

export const UBERDNS_GODADDY_ADAPTER_VERSION='uberbond.uberdns-godaddy.v1';
const clean=(v,max=4000)=>String(v??'').trim().slice(0,max);
const allowed=new Set(['A','AAAA','CAA','CNAME','MX','SRV','TXT']);
const rid=()=>crypto.randomUUID();

function relativeName(fqdn,zone){
  const name=clean(fqdn,253).replace(/\.$/,'').toLowerCase();
  const z=clean(zone,253).replace(/\.$/,'').toLowerCase();
  if(name===z) return '@';
  if(name.endsWith(`.${z}`)) return name.slice(0,-(z.length+1));
  return name;
}

function normalizePlanRecord(record,zone){
  const type=clean(record?.type,16).toUpperCase();
  if(!allowed.has(type)) throw new Error(`unsupported-dns-record-type:${type||'empty'}`);
  const name=relativeName(record?.name,zone);
  const data=clean(record?.value??record?.data,8000);
  if(!name||!data) throw new Error('dns-record-name-and-data-required');
  const ttl=Math.max(600,Math.min(86400,Number(record?.ttl)||600));
  const body={name,type,data,ttl};
  if(type==='MX') body.priority=Math.max(0,Math.min(65535,Number(record?.priority)||0));
  return body;
}

// TXT is multi-valued: one name can carry SPF, a site-verification token and
// anything else at once. A record is only ever replaced by one with the same
// purpose, so publishing SPF can never delete an unrelated token.
export function txtRecordPurpose(data){
  const d=clean(data,8000).replace(/^"+|"+$/g,'').trim().toLowerCase();
  if(d.startsWith('v=spf1')) return 'SPF';
  if(d.startsWith('v=dmarc1')) return 'DMARC';
  if(d.startsWith('v=dkim1')) return 'DKIM';
  return 'OTHER';
}

export function reconcileDnsRecord({existing=[],desired,allowMxReplacement=false}={}){
  const sameNameType=(Array.isArray(existing)?existing:[]).filter(r=>clean(r?.name,253).toLowerCase()===desired.name.toLowerCase()&&clean(r?.type,16).toUpperCase()===desired.type);
  const sameData=r=>clean(r?.data,8000)===desired.data&&Number(r?.priority||0)===Number(desired.priority||0);
  const identical=r=>sameData(r)&&Number(r?.ttl)===desired.ttl;
  const settle=record=>identical(record)?{state:'ALREADY_PRESENT',recordId:record.recordId||null}:record?.recordId?{state:'REPLACE',recordId:record.recordId}:{refusal:'existing-record-without-provider-id'};

  let candidates=sameNameType;
  if(desired.type==='TXT'){
    const purpose=txtRecordPurpose(desired.data);
    if(purpose==='OTHER'){
      const same=sameNameType.find(r=>clean(r?.data,8000)===desired.data);
      return same?settle(same):{state:'CREATE'};
    }
    candidates=sameNameType.filter(r=>txtRecordPurpose(r?.data)===purpose);
    if(candidates.length>1) return {refusal:`multiple-existing-${purpose.toLowerCase()}-records`};
  }
  const sameRouting=candidates.find(sameData);
  if(sameRouting) return settle(sameRouting);
  if(desired.type==='MX'&&candidates.length&&!allowMxReplacement) return {refusal:'existing-mx-would-change-mail-routing'};
  if(candidates.length>1) return {refusal:`multiple-existing-${desired.type.toLowerCase()}-records`};
  if(candidates.length===1) return settle(candidates[0]);
  return {state:'CREATE'};
}

export function createGoDaddyDnsAdapter({pat,fetchFn=globalThis.fetch,baseUrl='https://api.godaddy.com',idempotencyKey=rid}={}){
  const token=clean(pat,5000);
  if(!token||typeof fetchFn!=='function') throw new Error('godaddy-pat-and-fetch-required');
  const headers=extra=>({authorization:`Bearer ${token}`,'content-type':'application/json',...extra});

  async function request(path,options={}){
    const response=await fetchFn(`${baseUrl}${path}`,options);
    let json=null;
    try{json=await response.json();}catch{}
    if(!response?.ok){
      const error=new Error(`godaddy-dns-http-${response?.status??'unknown'}`);
      error.status=response?.status??null;
      error.body=json;
      throw error;
    }
    return json;
  }

  return {
    provider:'GODADDY',
    version:UBERDNS_GODADDY_ADAPTER_VERSION,
    async listRecords(zone){
      const z=encodeURIComponent(clean(zone,253).toLowerCase());
      const json=await request(`/v3/domains/zones/${z}/dns-records`,{method:'GET',headers:headers()});
      return Array.isArray(json?.items)?json.items:Array.isArray(json)?json:[];
    },
    async applyChanges(plan){
      if(plan?.provider!=='GODADDY') return {ok:false,reasonCodes:['godaddy-plan-provider-required'],externalEffects:0};
      if(plan?.ownerAuthorized!==true) return {ok:false,reasonCodes:['owner-dns-mutation-authorization-required'],externalEffects:0};
      let providerCalls=0;
      // Phase 1 reads every zone and decides every action before any write, so
      // a refusal found in the last zone cannot leave earlier zones half-changed.
      const actions=[]; const refusals=[];
      for(const zone of plan.roots||[]){
        const z=clean(zone,253).toLowerCase();
        const existing=await this.listRecords(z); providerCalls+=1;
        for(const raw of (plan.changes||[]).filter(r=>{
          const n=clean(r?.name,253).toLowerCase();
          return n===z||n.endsWith(`.${z}`);
        })){
          const desired=normalizePlanRecord(raw,z);
          const decision=reconcileDnsRecord({existing,desired,allowMxReplacement:plan.allowMxReplacement===true});
          if(decision.refusal) refusals.push(`${decision.refusal}:${z}:${desired.name}`);
          else actions.push({zone:z,desired,...decision});
        }
      }
      if(refusals.length) return {ok:false,reasonCodes:refusals,providerCalls,externalEffects:0,truthBoundary:'Nothing was written: at least one requested record would have overwritten or duplicated live DNS that the plan does not own.'};
      let externalEffects=0; const receipts=[];
      for(const action of actions){
        const {zone,desired}=action;
        if(action.state==='ALREADY_PRESENT'){ receipts.push({zone,state:'ALREADY_PRESENT',recordId:action.recordId,name:desired.name,type:desired.type}); continue; }
        if(action.state==='REPLACE'){
          const recordId=encodeURIComponent(clean(action.recordId,240));
          await request(`/v3/domains/zones/${encodeURIComponent(zone)}/dns-records/${recordId}`,{method:'PUT',headers:headers({'Idempotency-Key':idempotencyKey()}),body:JSON.stringify(desired)});
          providerCalls+=1; externalEffects+=1; receipts.push({zone,state:'REPLACED',recordId:action.recordId,name:desired.name,type:desired.type});
        }else{
          await request(`/v3/domains/zones/${encodeURIComponent(zone)}/dns-records`,{method:'POST',headers:headers({'Idempotency-Key':idempotencyKey()}),body:JSON.stringify(desired)});
          providerCalls+=1; externalEffects+=1; receipts.push({zone,state:'CREATED',recordId:null,name:desired.name,type:desired.type});
        }
      }
      return {ok:true,evidenceRef:`godaddy:dns:${crypto.createHash('sha256').update(JSON.stringify(receipts)).digest('hex')}`,providerCalls,externalEffects,receipts,truthBoundary:'GoDaddy accepted the requested DNS mutations. Public resolver observation is still required before authentication is certified.'};
    }
  };
}
