import { UBERDOSO_ROOTS } from './uberdoso-kernel.mjs';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const UBERDOSO_DNS_CONTRACT_VERSION='uberbond.uberdoso-dns-contract.v1';
const zero=()=>structuredClone(ZERO_EXTERNAL_EFFECTS);
const fail=reasonCodes=>({ok:false,status:'UBERDOSO_DNS_CONTRACT_REFUSED',reasonCodes:[...new Set(reasonCodes.filter(Boolean))],externalEffectAuthority:'NONE',externalEffectLedger:zero()});

export function compileUberDosoVerifierContracts({dnsPlan}={}){
  if(!dnsPlan||dnsPlan.schemaVersion!=='uberdoso.dns-plan.v1')return fail(['valid-uberdoso-dns-plan-required']);
  if(dnsPlan.status!=='UBERDOSO_DNS_PLAN_READY')return fail(['dns-plan-must-be-ready-before-verifier-contract']);
  const records=Array.isArray(dnsPlan.records)?dnsPlan.records:[];
  const contracts={};
  for(const root of UBERDOSO_ROOTS){
    const mx=records.find(row=>row.host===root&&row.type==='MX');
    const spf=records.find(row=>row.host===root&&row.type==='TXT'&&/^v=spf1/i.test(String(row.value||'')));
    const dkim=records.find(row=>row.type==='TXT'&&String(row.host||'').endsWith(`._domainkey.${root}`));
    const dmarc=records.find(row=>row.host===`_dmarc.${root}`&&row.type==='TXT');
    const reasons=[];
    if(!mx)reasons.push(`mx-record-required:${root}`);
    if(!spf)reasons.push(`spf-record-required:${root}`);
    if(!dkim)reasons.push(`dkim-record-required:${root}`);
    if(!dmarc)reasons.push(`dmarc-record-required:${root}`);
    if(reasons.length)return fail(reasons);
    const mxTarget=String(mx.value||'').trim().split(/\s+/).at(-1)?.replace(/\.$/,'').toLowerCase();
    const includeMatches=[...String(spf.value||'').matchAll(/include:([^\s]+)/ig)].map(match=>match[1].replace(/\.$/,'').toLowerCase());
    const selector=String(dkim.host).slice(0,-(`._domainkey.${root}`.length));
    const dmarcPolicy=/\bp=(none|quarantine|reject)\b/i.exec(String(dmarc.value||''))?.[1]?.toLowerCase();
    if(!mxTarget||!selector||!dmarcPolicy)return fail([`unable-to-compile-verifier-contract:${root}`]);
    contracts[root]={
      mxHostSuffixes:[mxTarget],
      spfIncludes:includeMatches,
      dkimSelector:selector,
      dmarcMinPolicy:dmarcPolicy
    };
  }
  return{
    ok:true,
    status:'UBERDOSO_VERIFIER_CONTRACTS_READY',
    contracts,
    externalEffectAuthority:'NONE',
    externalEffectLedger:zero(),
    truthBoundary:'These contracts translate an already-ready UberDoso DNS publication packet into the canonical read-only DNS verifier format. They do not publish or mutate DNS.'
  };
}
