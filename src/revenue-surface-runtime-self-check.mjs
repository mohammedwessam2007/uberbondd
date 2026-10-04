const boundedText=async(response,max=200000)=>{
  try{return String(await response.text()).slice(0,max);}catch{return '';}
};

async function probe(fetchFn,url){
  try{
    const response=await fetchFn(url,{method:'GET',cache:'no-store',redirect:'manual',signal:AbortSignal.timeout(5000)});
    return {ok:true,response,status:Number(response.status||0),text:await boundedText(response)};
  }catch(error){
    return {ok:false,response:null,status:0,text:'',errorClass:String(error?.code||error?.name||'FETCH_FAILED').slice(0,80)};
  }
}

/**
 * One-shot loopback runtime proof for the Revenue Constellation surface.
 * No credentials, provider calls, writes, authorization or dispatch are used.
 */
export async function inspectRevenueSurfaceRuntime({baseUrl,fetchFn=globalThis.fetch}={}){
  const base=String(baseUrl||'').replace(/\/$/,'');
  if(!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(base)){
    return {ok:false,status:'REVENUE_SURFACE_SELFCHECK_REFUSED',reasonCodes:['loopback-base-url-required'],externalEffects:0,providerCalls:0,businessEffectAuthority:'NONE'};
  }
  if(typeof fetchFn!=='function'){
    return {ok:false,status:'REVENUE_SURFACE_SELFCHECK_REFUSED',reasonCodes:['fetch-function-required'],externalEffects:0,providerCalls:0,businessEffectAuthority:'NONE'};
  }

  const [page,controller,protectedRoute]=await Promise.all([
    probe(fetchFn,`${base}/constellation.html`),
    probe(fetchFn,`${base}/constellation-gspot.js`),
    probe(fetchFn,`${base}/api/revenue/money-queue`)
  ]);

  const pageServed=page.ok&&page.status===200&&/REVENUE CONSTELLATION/i.test(page.text)&&/constellation-gspot\.js/.test(page.text);
  const controllerServed=controller.ok&&controller.status===200;
  const controllerSafe=controllerServed
    &&controller.text.includes('/api/revenue/gspot/plan')
    &&controller.text.includes('/api/revenue/gspot/prepare-batch')
    &&!controller.text.includes('/api/revenue/gspot/authorize')
    &&!controller.text.includes('/api/revenue/gspot/dispatch');
  const protectedRevenueRefused=protectedRoute.ok&&(protectedRoute.status===401||protectedRoute.status===403);
  const ok=pageServed&&controllerSafe&&protectedRevenueRefused;

  return {
    ok,
    status:ok?'REVENUE_SURFACE_LIVE_SELF_CHECK_CONFIRMED':'REVENUE_SURFACE_LIVE_SELF_CHECK_FAILED',
    constellationStatus:page.status,
    controllerStatus:controller.status,
    protectedRevenueStatus:protectedRoute.status,
    pageServed,
    controllerSafe,
    protectedRevenueRefused,
    credentialMaterialUsed:false,
    providerCalls:0,
    externalEffects:0,
    businessEffectAuthority:'NONE',
    reasonCodes:[
      ...(pageServed?[]:['constellation-not-served']),
      ...(controllerSafe?[]:['one-button-controller-boundary-not-proven']),
      ...(protectedRevenueRefused?[]:['unauthenticated-revenue-route-not-refused'])
    ]
  };
}
