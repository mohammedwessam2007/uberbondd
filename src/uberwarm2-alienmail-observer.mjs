// Documented AlienMail MCP, restricted to initialization and one read-only inventory tool.
import { extractHealthMetrics, compileMailboxHealth, mailboxDigest } from './uberwarm2-health-metrics.mjs';
const endpoint='https://app.alienmail.io/api/mcp';
const workspace='cmvi8sxyg000101pqtx2n1rpd';
const statuses=new Set(['NOT_CONFIGURED','READ_FAILED','RATE_LIMITED','SCHEMA_UNVERIFIED','IDENTITY_HOLD','INVENTORY_OBSERVED','ENROLLMENT_GAP']);
const empty=status=>({status,expected:32,enrolled:null,mailboxHealth:[],sendAuthority:'NONE',independentPlacementVerified:false});
export function compileAlienmailObservation(input) {
  const out=empty(statuses.has(input?.status)?input.status:'SCHEMA_UNVERIFIED');
  out.enrolled=Number.isSafeInteger(input?.enrolled)&&input.enrolled>=0&&input.enrolled<=32?input.enrolled:null;
  out.mailboxHealth=compileMailboxHealth(input?.mailboxHealth);
  out.healthStatus=out.mailboxHealth.some(m=>Object.keys(m.metrics).length)?'PROVIDER_METRICS_OBSERVED':'HEALTH_SCHEMA_UNVERIFIED';
  return out;
}
export async function observeAlienmail({apiKey,expectedMailboxDigests=[],fetchImpl=globalThis.fetch}={}) {
  if(!apiKey) return compileAlienmailObservation(empty('NOT_CONFIGURED'));
  // Explicit owner inventory binding required. Never accept arbitrary workspace accounts.
  if(expectedMailboxDigests.length!==32 || new Set(expectedMailboxDigests).size!==32 || expectedMailboxDigests.some(e=>!/^sha256:[a-f0-9]{64}$/.test(e))) return compileAlienmailObservation(empty('IDENTITY_HOLD'));
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),20000);
  let session; let protocol='2024-11-05';
  async function rpc(method,params,id) {
    const headers={Authorization:'Bearer '+apiKey,'Content-Type':'application/json',Accept:'application/json, text/event-stream'};
    if(session) headers['Mcp-Session-Id']=session;
    if(method!=='initialize') headers['MCP-Protocol-Version']=protocol;
    const response=await fetchImpl(endpoint,{method:'POST',redirect:'error',headers,signal:controller.signal,
      body:JSON.stringify({jsonrpc:'2.0',...(id===undefined?{}:{id}),method,...(params?{params}:{})})});
    if(response.status===429) throw Error('RATE_LIMITED');
    if(!response.ok) throw Error('READ_FAILED');
    if(method==='initialize') session=response.headers.get('mcp-session-id');
    if(id===undefined) {await response.body?.cancel();return;}
    const reader=response.body.getReader();let bytes=0;const chunks=[];
    try {for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>262144){await reader.cancel();throw Error('SCHEMA_UNVERIFIED');}chunks.push(Buffer.from(value));}}finally{reader.releaseLock();}
    const text=Buffer.concat(chunks).toString('utf8');
    const messages=response.headers.get('content-type')?.includes('text/event-stream')
      ? text.split(/\r?\n\r?\n/).flatMap(event=>{const data=event.split(/\r?\n/).filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trim()).join('\n');return data?[JSON.parse(data)]:[];}) : [JSON.parse(text)];
    const message=messages.find(m=>m.id===id);
    if(!message||message.error) throw Error('READ_FAILED');return message.result;
  }
  try {
    const init=await rpc('initialize',{protocolVersion:protocol,capabilities:{},clientInfo:{name:'uberwarm-read-monitor',version:'1.0.0'}},1);
    if(!['2024-11-05','2025-03-26','2025-06-18'].includes(init?.protocolVersion)) throw Error('SCHEMA_UNVERIFIED');
    protocol=init.protocolVersion;
    await rpc('notifications/initialized');
    const list=await rpc('tools/list',{},2);
    if(!list?.tools?.some(t=>t.name==='list_smtp_accounts')) throw Error('SCHEMA_UNVERIFIED');
    const result=await rpc('tools/call',{name:'list_smtp_accounts',arguments:{workspaceUID:workspace}},3);
    if(result?.isError) throw Error('READ_FAILED');
    let payload=result?.structuredContent;
    if(!payload){const texts=result?.content?.filter(c=>c.type==='text');if(texts?.length!==1)throw Error('SCHEMA_UNVERIFIED');payload=JSON.parse(texts[0].text);}
    const rows=Array.isArray(payload)?payload:payload?.accounts;
    if(!Array.isArray(rows)) throw Error('SCHEMA_UNVERIFIED');
    const owned=new Set(expectedMailboxDigests);const emails=rows.map(r=>r?.email);
    if(emails.some(e=>typeof e!=='string'||!owned.has(mailboxDigest(e)))||new Set(emails).size!==emails.length)throw Error('IDENTITY_HOLD');
    return compileAlienmailObservation({status:rows.length===32?'INVENTORY_OBSERVED':'ENROLLMENT_GAP',enrolled:rows.length,
      mailboxHealth:rows.map(r=>({mailboxDigest:mailboxDigest(r.email),metrics:extractHealthMetrics(r)}))});
  }catch(error){return compileAlienmailObservation(empty(statuses.has(error.message)?error.message:'READ_FAILED'));}
  finally{clearTimeout(timer);}
}
