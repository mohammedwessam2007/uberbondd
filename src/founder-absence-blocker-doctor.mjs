import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const FOUNDER_ABSENCE_BLOCKER_DOCTOR_VERSION = 'uberbond.founder-absence-blocker-doctor-1.0.1';
export const FOUNDER_ABSENCE_CLASSES = Object.freeze([
  'CODE_READY','CREDENTIAL_BLOCKED','ACCOUNT_BLOCKED','PAYMENT_BLOCKED','DISTRIBUTION_BLOCKED','DELIVERABILITY_BLOCKED','ELAPSED_EVIDENCE_PENDING'
]);

const ORDER = [
  ['credentials','CREDENTIAL_BLOCKED'],
  ['accounts','ACCOUNT_BLOCKED'],
  ['payment','PAYMENT_BLOCKED'],
  ['distribution','DISTRIBUTION_BLOCKED'],
  ['deliverability','DELIVERABILITY_BLOCKED'],
  ['elapsedEvidence','ELAPSED_EVIDENCE_PENDING']
];

function normalizeBlockers(input) {
  return Array.isArray(input) ? input.filter(Boolean).map(String) : [];
}
function action(item) {
  return {
    action:String(item?.action || '').slice(0,300),
    screen:String(item?.screen || '').slice(0,300),
    minutes:Number.isFinite(Number(item?.minutes)) ? Math.max(0,Math.min(120,Number(item.minutes))) : 5,
    cost:Number.isFinite(Number(item?.cost)) ? Math.max(0,Number(item.cost)) : 0,
    evidence:String(item?.evidence || '').slice(0,500)
  };
}

export function classifyFounderAbsenceBlockers({
  credentials = [], accounts = [], payment = [], distribution = [], deliverability = [],
  elapsedEvidence = [], softwareGaps = [], ownerActions = [], observationProof = null
} = {}) {
  const groups = {
    credentials:normalizeBlockers(credentials), accounts:normalizeBlockers(accounts), payment:normalizeBlockers(payment),
    distribution:normalizeBlockers(distribution), deliverability:normalizeBlockers(deliverability), elapsedEvidence:normalizeBlockers(elapsedEvidence)
  };
  const removable = normalizeBlockers(softwareGaps);
  let overall = 'CODE_READY';
  for (const [key,state] of ORDER) {
    if (groups[key].length) { overall = state; break; }
  }
  if (removable.length) overall = 'DISTRIBUTION_BLOCKED';

  if (overall === 'CODE_READY') {
    const gaps = Array.isArray(observationProof?.reasonCodes) ? observationProof.reasonCodes : ['observation-proof-missing'];
    const proven = observationProof?.ok === true
      && gaps.length === 0
      && Boolean(observationProof?.observationProof?.sourceCommit);
    overall = proven && gaps.length === 0 ? 'CODE_READY' : 'ELAPSED_EVIDENCE_PENDING';
  }

  const queue = (Array.isArray(ownerActions) ? ownerActions : []).slice(0,3).map(action);
  return {
    ok:removable.length === 0,
    policyVersion:FOUNDER_ABSENCE_BLOCKER_DOCTOR_VERSION,
    overall,
    blockerGroups:groups,
    softwareGaps:removable,
    ownerActionQueue:queue,
    businessEffectAuthority:'NONE',
    externalEffectLedger:{...ZERO_EXTERNAL_EFFECTS}
  };
}