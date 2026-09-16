import crypto from 'node:crypto';

export const UBERDNS_VERSION = 'uberbond.uberdns.v1';
const clean=(v,max=2000)=>String(v??'').trim().slice(0,max);
const sha=v=>crypto.createHash('sha256').update(String(v)).digest('hex');
const uniq=a=>[...new Set((a||[]).filter(Boolean))];

export function compileUberDnsPlan({roots=[],mailHost='mta.uberbond.cloud',mailHostIpv4='',dkimRecords=[],provider='GODADDY',providerAccountRef='',ownerAuthorized=false,now=new Date()}={}){
  const blockers=[];
  const domains=uniq(roots.map(x=>clean(x,253).toLowerCase()));
  if(!domains.length) blockers.push('owned-root-domains-required');
  if(!clean(mailHost,253)) blockers.push('mail-host-required');
  if(!clean(mailHostIpv4,64)) blockers.push('mail-host-static-ipv4-required');
  if(!ownerAuthorized) blockers.push('owner-dns-mutation-authorization-required');
  if(!clean(providerAccountRef,1000)) blockers.push('dns-provider-account-evidence-required');
  if(!Array.isArray(dkimRecords)||dkimRecords.length<domains.length) blockers.push('per-domain-dkim-records-required');

  const changes=[];
  if(clean(mailHostIpv4,64)) changes.push({name:mailHost,type:'A',value:clean(mailHostIpv4,64),ttl:600});
  for(const root of domains){
    changes.push({name:root,type:'MX',priority:10,value:clean(mailHost,253),ttl:600});
    changes.push({name:root,type:'TXT',value:'v=spf1 mx -all',ttl:600,purpose:'SPF'});
    const dkim=dkimRecords.find(r=>clean(r?.domain,253).toLowerCase()===root);
    if(dkim?.name&&dkim?.value) changes.push({name:clean(dkim.name,253),type:'TXT',value:clean(dkim.value,8000),ttl:600,purpose:'DKIM'});
    changes.push({name:`_dmarc.${root}`,type:'TXT',value:'v=DMARC1; p=quarantine; adkim=r; aspf=r',ttl:600,purpose:'DMARC'});
  }
  const plan={version:UBERDNS_VERSION,provider:clean(provider,120).toUpperCase(),providerAccountRef:clean(providerAccountRef,1000)||null,roots:domains,mailHost:clean(mailHost,253),mailHostIpv4:clean(mailHostIpv4,64)||null,changes,ownerAuthorized:ownerAuthorized===true,compiledAt:new Date(now).toISOString(),externalEffectAuthority:'NONE_UNTIL_ADAPTER_EXECUTION'};
  return Object.freeze({ok:blockers.length===0,status:blockers.length?'UBERDNS_WAIT_EXTERNAL_EVIDENCE':'UBERDNS_PLAN_READY',blockers,plan,planDigest:sha(JSON.stringify(plan)),truthBoundary:'UberDNS independently compiles the exact DNS mutation packet. It does not fabricate provider credentials, static IPs, DKIM keys, or claim the public DNS changed until an authorized adapter returns observed receipts.'});
}

export async function applyUberDnsPlan({planResult,adapter,dryRun=true}={}){
  if(!planResult?.ok||planResult.status!=='UBERDNS_PLAN_READY') return {ok:false,status:'UBERDNS_APPLY_REFUSED',reasonCodes:['ready-uberdns-plan-required'],externalEffects:0};
  if(!adapter||typeof adapter.applyChanges!=='function') return {ok:false,status:'UBERDNS_APPLY_REFUSED',reasonCodes:['authorized-dns-adapter-required'],externalEffects:0};
  if(dryRun===true) return {ok:true,status:'UBERDNS_DRY_RUN_READY',planDigest:planResult.planDigest,changes:planResult.plan.changes,externalEffects:0};
  const result=await adapter.applyChanges(planResult.plan);
  if(!result?.ok||!clean(result.evidenceRef,1000)) return {ok:false,status:'UBERDNS_APPLY_UNCERTAIN',reasonCodes:['provider-confirmed-dns-receipt-required'],externalEffects:Number(result?.externalEffects||0)};
  return {ok:true,status:'UBERDNS_APPLIED_PROVIDER_CONFIRMED',planDigest:planResult.planDigest,evidenceRef:clean(result.evidenceRef,1000),externalEffects:Number(result.externalEffects||planResult.plan.changes.length),truthBoundary:'Provider-confirmed mutation is not public-DNS verification. Public resolvers must still observe the intended records before mail authentication can certify.'};
}
