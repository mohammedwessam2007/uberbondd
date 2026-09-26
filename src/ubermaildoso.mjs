import crypto from 'node:crypto';

export const UBERMAILDOSO_VERSION = 'uberbond.ubermaildoso.v1';

const clean=(v,n=2000)=>String(v??'').trim().slice(0,n);
const digest=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const READ_ROUTES=Object.freeze({
  user:'/v1/user/me',
  userData:'/v1/user/data',
  settings:'/v1/user/settings',
  stats:'/v1/user/stats',
  domains:'/v1/user/domains',
  domainProviderAvailability:'/v1/user/domains/provider-availability',
  accountsLookup:'/v1/user/accounts-lookup',
  forwardingAccounts:'/v1/user/accounts/forwarding',
  forwardingLookup:'/v1/user/forwarding-lookup',
  warmups:'/v1/user/services/warmups',
  sequencers:'/v1/sequencers',
  pricing:'/v1/billing/pricing',
  subscriptions:'/v1/billing/subscriptions'
});
const MUTATION_ROUTES=Object.freeze({
  createDomains:['POST','/v1/user/domains'],
  searchDomains:['POST','/v1/user/domains/search'],
  connectExternalDomains:['POST','/v1/user/domains/external'],
  restartDomainSetup:['POST','/v1/user/domains/restart-setup'],
  updateDomains:['PUT','/v1/user/domains'],
  updateTracking:['PUT','/v1/user/domains/tracking'],
  createAccounts:['POST','/v1/user/accounts'],
  updateAccount:['PUT','/v1/user/accounts/{account_id}'],
  deleteAccounts:['DELETE','/v1/user/accounts'],
  setAccountForwarding:['PUT','/v1/user/accounts/forwarding'],
  createForwarding:['POST','/v1/user/forwarding'],
  resetForwardingPassword:['POST','/v1/user/forwarding/password'],
  deleteForwarding:['DELETE','/v1/user/forwarding'],
  createWarmup:['POST','/v1/user/services/warmups'],
  updateWarmup:['PUT','/v1/user/services/warmups'],
  deleteWarmup:['DELETE','/v1/user/services/warmups/{id}'],
  addSequencer:['POST','/v1/sequencers'],
  updateSequencer:['PUT','/v1/sequencers'],
  exportSequencer:['POST','/v1/sequencers/export']
});
function approvalReasons(approval={}, action=''){
  const r=[];
  if(approval.authorized!==true)r.push('explicit-owner-authorization-required');
  if(!clean(approval.receiptId,240))r.push('authorization-receipt-required');
  if(!clean(approval.authorizedBy,240))r.push('authorization-principal-required');
  const scopes=Array.isArray(approval.scopes)?approval.scopes.map(x=>clean(x,120)):[];
  if(!scopes.includes(action)&&!scopes.includes('*'))r.push('authorization-scope-required');
  if(!approval.expiresAt||!Number.isFinite(Date.parse(approval.expiresAt))||Date.parse(approval.expiresAt)<=Date.now())r.push('authorization-expired-or-missing');
  return r;
}
function pathFor(template, params={}){
  return template.replace(/\{([^}]+)\}/g,(_,key)=>{
    const value=clean(params[key],240);
    if(!value)throw new Error(`missing-path-param:${key}`);
    return encodeURIComponent(value);
  });
}
function publicReceipt({action,method,path,status,ok,requestId,body}){
  return Object.freeze({
    version:UBERMAILDOSO_VERSION,
    action,method,path,status,ok,
    requestId:requestId||null,
    responseDigest:`sha256:${digest(body??null)}`,
    provider:'maildoso',
    tokenExposed:false
  });
}
export function createUberMaildosoAdapter({
  token='',
  baseUrl='https://api.maildoso.com',
  fetchImpl=globalThis.fetch,
  timeoutMs=30000
}={}){
  const secret=String(token||'');
  const root=clean(baseUrl,500).replace(/\/+$/,'');
  const configured=Boolean(secret&&root&&typeof fetchImpl==='function');
  async function call(method,path,{query,body,mutation=false,action='',approval}={}){
    if(!configured)return {ok:false,status:'UBERMAILDOSO_NOT_CONFIGURED',reasonCodes:['maildoso-token-required'],providerCalls:0};
    if(mutation){
      const reasons=approvalReasons(approval,action);
      if(reasons.length)return {ok:false,status:'UBERMAILDOSO_MUTATION_REFUSED',reasonCodes:reasons,providerCalls:0,externalEffects:0};
    }
    const url=new URL(root+path);
    for(const [k,v] of Object.entries(query||{}))if(v!==undefined&&v!==null&&String(v)!=='')url.searchParams.set(k,String(v));
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),Math.max(1000,Number(timeoutMs)||30000));
    let response;
    try{
      response=await fetchImpl(url,{
        method,
        headers:{authorization:`Bearer ${secret}`,accept:'application/json',...(body===undefined?{}:{'content-type':'application/json'})},
        body:body===undefined?undefined:JSON.stringify(body),
        signal:controller.signal
      });
    }catch(error){
      return {
        ok:false,
        status:mutation?'UBERMAILDOSO_MUTATION_OUTCOME_UNCERTAIN':'UBERMAILDOSO_READ_FAILED',
        reasonCodes:[mutation?'provider-call-threw-after-mutation-boundary':'provider-read-failed'],
        providerCalls:1,
        automaticRetryAuthorized:false,
        error:clean(error?.message||error,500).replace(secret,'[REDACTED]')
      };
    }finally{clearTimeout(timer);}
    let parsed=null;
    const text=await response.text();
    if(text){try{parsed=JSON.parse(text);}catch{parsed={raw:clean(text,4000)};}}
    const requestId=response.headers?.get?.('x-request-id')||response.headers?.get?.('request-id')||null;
    const receipt=publicReceipt({action:action||'read',method,path,status:response.status,ok:response.ok,requestId,body:parsed});
    if(!response.ok)return {ok:false,status:'UBERMAILDOSO_PROVIDER_REJECTED',reasonCodes:[`maildoso-http-${response.status}`],providerCalls:1,automaticRetryAuthorized:false,receipt,response:parsed};
    return {ok:true,status:mutation?'UBERMAILDOSO_MUTATION_CONFIRMED':'UBERMAILDOSO_READ_CONFIRMED',providerCalls:1,externalEffects:mutation?1:0,receipt,data:parsed};
  }
  const api={
    configured,
    version:UBERMAILDOSO_VERSION,
    read:async(name,options={})=>{
      const path=READ_ROUTES[name];
      if(!path)return {ok:false,status:'UBERMAILDOSO_READ_REFUSED',reasonCodes:['unsupported-read-route'],providerCalls:0};
      return call('GET',path,{query:options.query,action:name});
    },
    mutate:async(action,{body,params,query,approval}={})=>{
      const spec=MUTATION_ROUTES[action];
      if(!spec)return {ok:false,status:'UBERMAILDOSO_MUTATION_REFUSED',reasonCodes:['unsupported-mutation-route'],providerCalls:0,externalEffects:0};
      let path;
      try{path=pathFor(spec[1],params);}catch(error){return {ok:false,status:'UBERMAILDOSO_MUTATION_REFUSED',reasonCodes:[clean(error.message,200)],providerCalls:0,externalEffects:0};}
      return call(spec[0],path,{body,query,mutation:true,action,approval});
    },
    truthBoundary:'UberMaildoso is an authorized provider adapter. It can operate only the provider account the founder connects; it does not manufacture provider permission, mailbox reputation, deliverability, recipient eligibility, send authority, or cleared revenue.'
  };
  return Object.freeze(api);
}

export { READ_ROUTES as UBERMAILDOSO_READ_ROUTES, MUTATION_ROUTES as UBERMAILDOSO_MUTATION_ROUTES };
