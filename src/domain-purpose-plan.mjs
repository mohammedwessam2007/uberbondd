import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const DOMAIN_PURPOSE_PLAN_VERSION = 'uberbond.domain-purpose-plan-1.0.1';
export const OWNED_ROOT_DOMAINS = Object.freeze(['uberbond.agency','uberbond.cloud']);
export const DOMAIN_PURPOSES = Object.freeze(['APP_PRODUCT','OUTBOUND','INBOUND_REPLIES','TRACKING','TRANSACTIONAL','TESTING']);
export const DOMAIN_STATES = Object.freeze(['CONFIGURED','DNS_PROPAGATING','VERIFIED','MISCONFIGURED','UNKNOWN','BLOCKED_PROVIDER_REQUIREMENTS_UNKNOWN']);

function rootOf(host) {
  const value = String(host || '').trim().toLowerCase().replace(/\.$/,'');
  return OWNED_ROOT_DOMAINS.find(root => value === root || value.endsWith(`.${root}`)) || null;
}

export function compileDomainPurposePlan({ rootDomain, assignments = {}, providerRequirements = {} } = {}) {
  const root = rootOf(rootDomain);
  if (!root || root !== String(rootDomain || '').trim().toLowerCase()) {
    return {ok:false,policyVersion:DOMAIN_PURPOSE_PLAN_VERSION,status:'BLOCKED',reasonCodes:['domain-not-owned'],businessEffectAuthority:'NONE',externalEffectLedger:{...ZERO_EXTERNAL_EFFECTS}};
  }
  const rows=[];
  for (const purpose of DOMAIN_PURPOSES) {
    const host = String(assignments?.[purpose] || '').trim().toLowerCase();
    if (!host || rootOf(host) !== root) {
      rows.push({purpose,host:host||null,state:'UNKNOWN',reasonCodes:['purpose-host-required-or-not-owned']});
      continue;
    }
    const req = providerRequirements?.[purpose] || null;
    const needsProvider = ['OUTBOUND','TRACKING','TRANSACTIONAL'].includes(purpose);
    if (needsProvider && !req) {
      rows.push({purpose,host,state:'BLOCKED_PROVIDER_REQUIREMENTS_UNKNOWN',reasonCodes:['provider-requirements-unknown'],expected:null});
      continue;
    }
    rows.push({
      purpose,host,state:'CONFIGURED',reasonCodes:[],
      expected:req?{
        spfIncludes:Array.isArray(req.spfIncludes)?req.spfIncludes:[],
        dkimSelectors:Array.isArray(req.dkimSelectors)?req.dkimSelectors:[],
        trackingCnameTarget:req.trackingCnameTarget||null,
        requiresPtr:req.requiresPtr===true,
        requiresTls:req.requiresTls!==false
      }:null
    });
  }
  return {ok:true,policyVersion:DOMAIN_PURPOSE_PLAN_VERSION,rootDomain:root,rows,businessEffectAuthority:'NONE',externalEffectLedger:{...ZERO_EXTERNAL_EFFECTS}};
}

export function evaluateDomainObservation({ planRow, observation = null, now = new Date().toISOString() } = {}) {
  if (!planRow?.host || !rootOf(planRow.host)) return {state:'UNKNOWN',reasonCodes:['valid-owned-plan-row-required']};
  if (planRow.state === 'BLOCKED_PROVIDER_REQUIREMENTS_UNKNOWN') return {state:planRow.state,reasonCodes:planRow.reasonCodes};
  if (!observation) return {state:'UNKNOWN',reasonCodes:['dns-observation-required']};

  const maxObservationAgeHours = 24;
  const observedMs = Date.parse(observation.observedAt || '');
  const nowMs = Date.parse(now || '');
  if (!Number.isFinite(observedMs) || !Number.isFinite(nowMs) || nowMs < observedMs) return {state:'UNKNOWN',reasonCodes:['dns-observation-time-invalid']};
  const ageHours = (nowMs - observedMs) / (60 * 60 * 1000);
  if (ageHours > maxObservationAgeHours) {
    return {state:'UNKNOWN',reasonCodes:['dns-observation-stale']};
  }

  const expectedProvenance = 'EXTERNAL_DNS_OBSERVATION';
  const obs = { provenance: String(observation.provenance || expectedProvenance).trim().toUpperCase() };
  if (obs.provenance !== expectedProvenance) {
    return {state:'CONFIGURED',reasonCodes:['dns-observation-provenance-not-independent']};
  }

  if (observation.status === 'RED') return {state:'MISCONFIGURED',reasonCodes:observation.reasonCodes||['dns-verification-red']};
  if (observation.status === 'YELLOW') return {state:'DNS_PROPAGATING',reasonCodes:observation.reasonCodes||['dns-propagating']};
  if (observation.status !== 'GREEN') return {state:'UNKNOWN',reasonCodes:observation.reasonCodes||['dns-state-unknown']};
  if (planRow.expected?.requiresPtr && observation.ptrVerified !== true) return {state:'MISCONFIGURED',reasonCodes:['ptr-rdns-not-verified']};
  if (planRow.expected?.requiresTls !== false && observation.tlsVerified !== true) return {state:'MISCONFIGURED',reasonCodes:['tls-not-verified']};

  const observedProvenance = obs.provenance === expectedProvenance;
  const generated = observation.generatedExpectedRecords === true;
  const reasonCodes = generated ? ['generated-expectations-are-not-observed-proof'] : [];
  const blocked = reasonCodes.length > 0;
  const verifiable = observedProvenance && !generated && reasonCodes.length === 0 && !blocked;
  if (!verifiable) return {state:'CONFIGURED',reasonCodes};
  return {state:'VERIFIED',reasonCodes:[]};
}