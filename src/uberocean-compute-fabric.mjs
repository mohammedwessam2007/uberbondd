import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const UBEROCEAN_COMPUTE_FABRIC_VERSION = 'uberbond.uberocean-compute-fabric.v1';

const HOST_CLASSES = new Set(['OWNER_LINUX','ORACLE_ALWAYS_FREE','DIGITALOCEAN','GENERIC_LINUX','OTHER_REPLACEABLE']);
const zero = () => structuredClone(ZERO_EXTERNAL_EFFECTS);
const text = (v, m = 1000) => { const s = String(v ?? '').trim(); return s && s.length <= m ? s : null; };
const integer = (v, a = 0, b = 1e12) => { const n = Number(v); return Number.isSafeInteger(n) && n >= a && n <= b ? n : null; };
const finite = (v, a = 0, b = 1) => { const n = Number(v); return Number.isFinite(n) && n >= a && n <= b ? n : null; };
const digest = v => `sha256:${crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex')}`;
const fail = (reasonCodes, extra = {}) => ({
  ok:false,status:'UBEROCEAN_SUBSTRATE_BLOCKED',reasonCodes:[...new Set(reasonCodes.filter(Boolean))],
  computeAuthority:'NONE',deploymentAuthority:'NONE',spendAuthority:'NONE',businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zero(),...extra
});

/**
 * UberOcean is the sovereign machine-supply fabric below UberCel.
 * It clean-room reproduces the useful control-plane shape of cloud compute:
 * discover -> admit -> score -> expose replaceable Linux cells.
 * It never creates accounts, buys servers, spends, deploys, or invents a host.
 */
export function normalizeUberOceanHost(raw = {}, { now = new Date(), freshnessMs = 15 * 60 * 1000 } = {}) {
  const hostId = text(raw.hostId, 160)?.toLowerCase();
  const provider = text(raw.provider, 120)?.toLowerCase();
  const hostClass = text(raw.hostClass, 80)?.toUpperCase();
  const sourceRef = text(raw.sourceRef, 1000);
  const observedAt = text(raw.observedAt, 100);
  const failureDomain = text(raw.failureDomain, 160)?.toLowerCase();
  const failureDomainEvidenceRef = text(raw.failureDomainEvidenceRef, 1000);
  const architecture = text(raw.architecture, 40)?.toLowerCase();
  const os = text(raw.os, 80)?.toLowerCase();
  const vcpus = integer(raw.vcpus, 1, 4096);
  const memoryMb = integer(raw.memoryMb, 128, 16_000_000);
  const diskGb = integer(raw.diskGb, 1, 1_000_000);
  const monthlyCostCents = integer(raw.monthlyCostCents ?? 0, 0, 1e9);
  const reliability = finite(raw.reliability ?? 0.5);
  const latencyScore = finite(raw.latencyScore ?? 0.5);
  const privacyScore = finite(raw.privacyScore ?? 0.5);
  const trustScore = finite(raw.trustScore ?? 0.5);
  const reversibilityScore = finite(raw.reversibilityScore ?? 0.8);
  const reasons = [];
  if (!hostId || !provider || !HOST_CLASSES.has(hostClass)) reasons.push('host-identity-required');
  if (!sourceRef || !observedAt || !Number.isFinite(Date.parse(observedAt))) reasons.push('observed-host-provenance-required');
  if (!failureDomain || !failureDomainEvidenceRef) reasons.push('failure-domain-evidence-required');
  if (!architecture || !os || !os.includes('linux')) reasons.push('linux-host-observation-required');
  if ([vcpus,memoryMb,diskGb,monthlyCostCents,reliability,latencyScore,privacyScore,trustScore,reversibilityScore].some(v => v == null)) reasons.push('bounded-host-capacity-required');
  if (raw.networkReachable !== true) reasons.push('observed-network-reachability-required');
  if (raw.sshOrConsoleReachable !== true) reasons.push('operator-reachability-required');
  const observedMs = Date.parse(observedAt || '');
  const ageMs = Number.isFinite(observedMs) ? now.getTime() - observedMs : Infinity;
  if (ageMs < 0 || ageMs > freshnessMs) reasons.push('fresh-host-observation-required');
  if (raw.providerOwnedPolicy === true || raw.providerOwnedDeploymentAuthority === true) reasons.push('provider-must-not-own-uberbond-authority');
  if (reasons.length) return fail(reasons, { hostId: hostId || null, provider: provider || null });
  return {
    ok:true,status:'UBEROCEAN_HOST_ADMITTED',host:{hostId,provider,hostClass,sourceRef,observedAt:new Date(observedAt).toISOString(),failureDomain,failureDomainEvidenceRef,architecture,os,vcpus,memoryMb,diskGb,monthlyCostCents,reliability,latencyScore,privacyScore,trustScore,reversibilityScore,networkReachable:true,sshOrConsoleReachable:true},
    computeAuthority:'NONE',deploymentAuthority:'NONE',spendAuthority:'NONE',businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zero()
  };
}

function hostToCell(host, requirement = {}) {
  const units = Math.max(1, Math.min(host.vcpus, integer(requirement.units ?? 1, 1, host.vcpus) || 1));
  const allowedDataClasses = host.hostClass === 'OWNER_LINUX'
    ? ['PUBLIC','INTERNAL_NON_SECRET','SOURCE_CODE','FOUNDER_PRIVATE']
    : ['PUBLIC','INTERNAL_NON_SECRET','SOURCE_CODE'];
  return {
    cellId:`uberocean-${host.hostId}`,
    resourceType:'COMPUTE',provider:host.provider,sourceRef:host.sourceRef,verifiedAt:host.observedAt,
    capabilityTags:['linux','deploy','ubercel','uberlit','persistent-runtime'],allowedDataClasses,
    availableUnits:host.vcpus,costCents:host.monthlyCostCents,
    reliability:host.reliability,latencyScore:host.latencyScore,privacyScore:host.privacyScore,trustScore:host.trustScore,reversibilityScore:host.reversibilityScore,
    ownershipClass:host.hostClass === 'OWNER_LINUX' ? 'OWNER_OWNED' : 'THIRD_PARTY_REPLACEABLE',
    networkMode:host.hostClass === 'OWNER_LINUX' ? 'LOCAL_ONLY' : 'UBERMESH',credentialCustody:'OWNER',
    failureDomain:host.failureDomain,failureDomainEvidenceRef:host.failureDomainEvidenceRef,
    uberocean:{hostId:host.hostId,hostClass:host.hostClass,architecture:host.architecture,os:host.os,memoryMb:host.memoryMb,diskGb:host.diskGb,requestedUnits:units}
  };
}

function hostToAdapter(host) {
  return {
    adapterId:`uberocean-${host.hostId}`,
    adapterType:'OWNED_LINUX',
    provider:host.provider,
    sourceRef:host.sourceRef,
    verifiedAt:host.observedAt,
    capabilityTags:['deploy','uberlit','linux'],
    deploymentAuthority:false,
    policyAuthority:false
  };
}

export function compileUberOceanSubstrate({
  serviceId='ubercel-runtime',hosts=[],requirement={},meshReceipt={},maxMonthlyCostCents=0,requireZeroNewSpend=true,requireIndependentFallback=false,now=new Date()
} = {}) {
  const id = text(serviceId, 160);
  if (!id) return fail(['service-id-required']);
  if (!Array.isArray(hosts) || hosts.length === 0 || hosts.length > 128) return fail(['bounded-host-observations-required']);
  const normalized = hosts.map(host => normalizeUberOceanHost(host,{now}));
  const rejected = normalized.filter(x => !x.ok);
  let admitted = normalized.filter(x => x.ok).map(x => x.host);
  if (!admitted.length) return fail(['no-observed-reachable-linux-hosts'],{rejected:rejected.map(x=>x.reasonCodes)});
  if (requireZeroNewSpend) admitted = admitted.filter(host => host.monthlyCostCents === 0);
  else admitted = admitted.filter(host => host.monthlyCostCents <= maxMonthlyCostCents);
  if (!admitted.length) return fail([requireZeroNewSpend?'no-zero-new-spend-host-available':'no-host-within-cost-ceiling']);
  admitted.sort((a,b)=>b.reliability-a.reliability||b.trustScore-a.trustScore||a.monthlyCostCents-b.monthlyCostCents||a.hostId.localeCompare(b.hostId));
  const primary = admitted[0];
  const fallback = admitted.find(host => host.provider !== primary.provider && host.failureDomain !== primary.failureDomain) || null;
  if (requireIndependentFallback && !fallback) return fail(['independent-fallback-host-required']);
  const selected = [primary,...(fallback?[fallback]:[])];
  const resourceCells = selected.map(host => hostToCell(host,requirement));
  const adapters = selected.map(hostToAdapter);
  const cloudRequirements = [{
    requirementId:text(requirement.requirementId,160)||'ubercel-runtime-compute',resourceType:'COMPUTE',dataClass:text(requirement.dataClass,80)?.toUpperCase()||'SOURCE_CODE',requiredTags:['linux','deploy','ubercel','uberlit','persistent-runtime'],units:integer(requirement.units??1,1,1e6)||1,
    minimumReliability:finite(requirement.minimumReliability??0.5)??0.5,minimumPrivacy:finite(requirement.minimumPrivacy??0.5)??0.5,minimumTrust:finite(requirement.minimumTrust??0.5)??0.5,minimumReversibility:finite(requirement.minimumReversibility??0.7)??0.7
  }];
  const plan = {
    schemaVersion:'uberbond.uberocean-substrate-plan.v1',serviceId:id,primaryHostId:primary.hostId,fallbackHostId:fallback?.hostId||null,
    resourceCells,adapters,cloudRequirements,meshReceipt,maxTotalCostCents:requireZeroNewSpend?0:maxMonthlyCostCents,
    laws:['PHYSICAL_COMPUTE_MUST_BE_OBSERVED_NOT_IMAGINED','PROVIDERS_ARE_REPLACEABLE_SUPPLIERS','UBEROCEAN_NEVER_CREATES_SPEND_OR_DEPLOYMENT_AUTHORITY','UBERCEL_REMAINS_DEPLOYMENT_CONTROL_PLANE','UBERLIT_REMAINS_RESIDENT_RUNTIME'],
    computeAuthority:'NONE',deploymentAuthority:'NONE',spendAuthority:'NONE'
  };
  return {ok:true,status:'UBEROCEAN_SUBSTRATE_READY',plan,planDigest:digest(plan),computeAuthority:'NONE',deploymentAuthority:'NONE',spendAuthority:'NONE',businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zero()};
}

export const UBEROCEAN_HOST_CLASSES = Object.freeze([...HOST_CLASSES]);
