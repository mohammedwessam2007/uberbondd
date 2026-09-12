import { compileUberDosoTopology, compileUberDosoDnsPlan } from './uberdoso-kernel.mjs';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const UBERDOSO_ACTIVATION_VERSION='uberbond.uberdoso-activation.v1';
export const UBERDOSO_POSTAL_GIT_COMMIT='d038eaa8c763d3cafa797ccd6f773d53470bd336';
export const UBERDOSO_INSTALL_HELPER_COMMIT='451926cc78a1056e9f16dad6ec5c62d4f76d2445';
export const UBERDOSO_MIN_HOST=Object.freeze({cpuCores:2,ramBytes:4*1024**3,diskBytes:25*1024**3,mariaDbMinimum:'10.6'});
const zero=()=>structuredClone(ZERO_EXTERNAL_EFFECTS);
const IPV4=/^(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
const DIGEST_IMAGE=/^[a-z0-9./:_-]+@sha256:[a-f0-9]{64}$/i;
const text=(v,m=500)=>String(v??'').trim().slice(0,m);
const finite=(v)=>Number.isFinite(Number(v))?Number(v):null;
const fail=(codes,extra={})=>({ok:false,status:'UBERDOSO_ACTIVATION_BLOCKED',reasonCodes:[...new Set(codes.filter(Boolean))],businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zero(),...extra});

export function compileUberDosoActivation({
  postalImage='',
  mariaDbImage='',
  hostEvidence={},
  dkimRecordsByDomain={},
  date=new Date()
}={}){
  const reasons=[];
  if(!DIGEST_IMAGE.test(text(postalImage,500)))reasons.push('digest-pinned-postal-image-required');
  if(!DIGEST_IMAGE.test(text(mariaDbImage,500)))reasons.push('digest-pinned-mariadb-image-required');
  const ip=text(hostEvidence.publicIpv4,64);
  const ptr=text(hostEvidence.ptrHostname,253).toLowerCase().replace(/\.$/,'');
  const cpu=finite(hostEvidence.cpuCores);const ram=finite(hostEvidence.ramBytes);const disk=finite(hostEvidence.diskBytes);
  if(!IPV4.test(ip))reasons.push('static-public-ipv4-required');
  if(ptr!=='mta.uberbond.cloud')reasons.push('ptr-must-match-mta.uberbond.cloud');
  if(hostEvidence.outboundPort25Observed!==true)reasons.push('outbound-port-25-proof-required');
  if(hostEvidence.inboundPort25Observed!==true)reasons.push('inbound-port-25-proof-required');
  if(hostEvidence.dockerAvailable!==true)reasons.push('docker-runtime-proof-required');
  if(hostEvidence.persistentStorage!==true)reasons.push('persistent-storage-proof-required');
  if(cpu==null||cpu<UBERDOSO_MIN_HOST.cpuCores)reasons.push('minimum-2-cpu-cores-required');
  if(ram==null||ram<UBERDOSO_MIN_HOST.ramBytes)reasons.push('minimum-4gib-ram-required');
  if(disk==null||disk<UBERDOSO_MIN_HOST.diskBytes)reasons.push('minimum-25gib-disk-required');
  const evidenceRefs=Array.isArray(hostEvidence.evidenceRefs)?hostEvidence.evidenceRefs.map(v=>text(v,1000)).filter(Boolean):[];
  if(!evidenceRefs.length)reasons.push('physical-host-evidence-reference-required');
  if(reasons.length)return fail(reasons,{requiredHost:{...UBERDOSO_MIN_HOST,mtaHostname:'mta.uberbond.cloud',outboundPort25:true,inboundPort25:true,staticPublicIpv4:true,ptr:true}});

  const topologyResult=compileUberDosoTopology();
  if(!topologyResult.ok)return fail(['uberdoso-topology-required']);
  const dns=compileUberDosoDnsPlan({topology:topologyResult.topology,publicIpv4:ip,ptrHostname:ptr,dkimRecordsByDomain,date});
  const hostReceipt={
    schemaVersion:'uberdoso.host-evidence.v1',
    publicIpv4:ip,
    ptrHostname:ptr,
    cpuCores:cpu,
    ramBytes:ram,
    diskBytes:disk,
    outboundPort25Observed:true,
    inboundPort25Observed:true,
    dockerAvailable:true,
    persistentStorage:true,
    evidenceRefs,
    postalImage:text(postalImage,500),
    mariaDbImage:text(mariaDbImage,500),
    postalSourceCommit:UBERDOSO_POSTAL_GIT_COMMIT,
    postalInstallHelperCommit:UBERDOSO_INSTALL_HELPER_COMMIT
  };
  if(dns.status!=='UBERDOSO_DNS_PLAN_READY'){
    return{
      ok:true,
      status:'UBERDOSO_HOST_READY__POSTAL_BOOT_AND_DKIM_REQUIRED',
      hostReceipt,
      dnsPlan:dns.plan,
      nextActions:['boot-digest-pinned-postal-and-mariadb','initialize-postal','create-two-owned-sending-domains','observe-postal-dkim-records','recompile-dns-publication-packet'],
      businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zero(),
      truthBoundary:'Physical host prerequisites are evidenced, but DNS publication is not ready until the running Postal node produces observed DKIM material for both owned domains.'
    };
  }
  return{
    ok:true,
    status:'UBERDOSO_DNS_PUBLICATION_PACKET_READY',
    hostReceipt,
    dnsPlan:dns.plan,
    nextActions:['publish-exact-dns-records-through-authorized-dns-control','observe-public-dns','verify-authentication','begin-owned-warmup-evidence-loop'],
    businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zero(),
    truthBoundary:'This packet proves the exact configuration to publish; it does not publish DNS, send mail, or claim deliverability/reputation.'
  };
}
