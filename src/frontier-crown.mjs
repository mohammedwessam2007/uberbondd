import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import { validatePreparedFreshApexCampaign } from './apex-fresh-campaign.mjs';
import { validateCompiledSealedArchitectureTrial } from './apex-sealed-tournament.mjs';
import {
  certifyCanonicalZeroLoss,
  validateCanonicalZeroLossCertificate
} from './canonical-zero-loss-certificate.mjs';
import { ABSOLUTE_FRONTIER_QUALITY_POLICY_DIGEST } from './absolute-frontier-quality-invariant.mjs';

export const FRONTIER_CROWN_VERSION = 'uberbond.frontier-crown.v1';
const canonicalCrowns = new WeakMap();

function zeroEffects(){ return structuredClone(ZERO_EXTERNAL_EFFECTS); }
function stable(value){
  if(Array.isArray(value)) return value.map(stable);
  if(!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])]));
}
function digest(value){ return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex'); }
function text(value,max=1000){ const out=String(value??'').trim(); return out && out.length<=max ? out : null; }
function envelope(extra={}){
  return {
    policyVersion: FRONTIER_CROWN_VERSION,
    businessEffectAuthority:'NONE',
    externalEffectAuthority:'NONE',
    externalEffectLedger:zeroEffects(),
    promotionAuthority:'NONE',
    executionAuthority:'NONE',
    ...extra
  };
}
function fail(status,reasonCodes,extra={}){
  return envelope({ok:false,status,reasonCodes:[...new Set((reasonCodes||[]).filter(Boolean))],...extra});
}
function exactArchitectureMatch(rosterEntry,trial){
  const identity=trial?.architectureIdentity;
  return Boolean(identity
    && identity.architectureId===rosterEntry.architectureId
    && identity.architectureClass===rosterEntry.architectureClass
    && identity.architectureDigest===rosterEntry.architectureDigest
    && identity.architectureRevision===rosterEntry.architectureRevision
    && identity.architectureSourceRef===rosterEntry.architectureSourceRef
    && identity.architectureFrozenAt===rosterEntry.architectureFrozenAt);
}

export function certifyCampaignFrontierCrown({ campaignPlan, trials = [] } = {}) {
  const planProof=validatePreparedFreshApexCampaign(campaignPlan);
  if(!planProof.ok) return fail('FRONTIER_CROWN_REFUSED',planProof.reasonCodes);

  if(!Array.isArray(trials) || trials.length!==campaignPlan.architectureRoster.length){
    return fail('FRONTIER_CROWN_REFUSED',['complete-precommitted-architecture-roster-trials-required']);
  }

  const rosterById=new Map(campaignPlan.architectureRoster.map(row=>[row.architectureId,row]));
  const requiredIds=[...rosterById.keys()].sort();
  const byId=new Map();
  const reasons=[];
  let suiteVersion=null, corpusDigest=null, manifestDigest=null, taskClass=null, taskCount=null, commitmentRef=null;

  for(const [index,trial] of trials.entries()){
    const proof=validateCompiledSealedArchitectureTrial(trial);
    if(!proof.ok){ reasons.push(`trial-${index}:canonical-untampered-sealed-trial-required`); continue; }
    const id=text(trial.architectureId,240)?.toLowerCase();
    if(!id || byId.has(id)){ reasons.push(`trial-${index}:unique-architecture-id-required`); continue; }
    const rosterEntry=rosterById.get(id);
    if(!rosterEntry) reasons.push(`trial-${index}:architecture-not-in-precommitted-roster`);
    else if(!exactArchitectureMatch(rosterEntry,trial)) reasons.push(`trial-${index}:sealed-architecture-does-not-match-precommitted-identity`);
    byId.set(id,trial);

    suiteVersion??=trial.suiteVersion;
    corpusDigest??=trial.corpusDigest;
    manifestDigest??=trial.manifestDigest;
    taskClass??=trial.taskClass;
    taskCount??=trial.statistics?.sampleSize;
    commitmentRef??=trial.holdoutCommitment?.commitmentRef;

    if(trial.suiteVersion!==suiteVersion) reasons.push(`trial-${index}:suite-version-mismatch`);
    if(trial.corpusDigest!==corpusDigest) reasons.push(`trial-${index}:corpus-digest-mismatch`);
    if(trial.manifestDigest!==manifestDigest) reasons.push(`trial-${index}:manifest-digest-mismatch`);
    if(trial.taskClass!==taskClass) reasons.push(`trial-${index}:task-class-mismatch`);
    if(trial.statistics?.sampleSize!==taskCount) reasons.push(`trial-${index}:sample-size-mismatch`);
    if(trial.holdoutCommitment?.commitmentRef!==commitmentRef) reasons.push(`trial-${index}:holdout-commitment-mismatch`);
    if(trial.statistics?.sampleSize<campaignPlan.minimumTaskCount) reasons.push(`trial-${index}:minimum-task-count-not-met`);
  }

  const observedIds=[...byId.keys()].sort();
  if(JSON.stringify(observedIds)!==JSON.stringify(requiredIds)) reasons.push('sealed-trials-must-exactly-cover-precommitted-architecture-roster');
  if(suiteVersion!==campaignPlan.suiteVersion) reasons.push('campaign-suite-mismatch');
  if(taskClass!==campaignPlan.taskClass) reasons.push('campaign-task-class-mismatch');
  if(reasons.length) return fail('FRONTIER_CROWN_REFUSED',reasons,{requiredArchitectureIds:requiredIds,observedArchitectureIds:observedIds});

  const dominators=[];
  const dominationEvidence=[];
  for(const candidate of trials){
    const pairwise=[];
    let dominatesAll=true;
    for(const other of trials){
      if(other.architectureId===candidate.architectureId) continue;
      const certified=certifyCanonicalZeroLoss({baselineTrial:other,candidateTrial:candidate});
      const valid=certified.ok
        ? validateCanonicalZeroLossCertificate(certified.certificate,{
            expectedCandidateArchitectureId:candidate.architectureId,
            minimumTaskCount:campaignPlan.minimumTaskCount
          })
        : null;
      const ok=certified.ok===true && valid?.ok===true;
      pairwise.push({
        baselineArchitectureId:other.architectureId,
        candidateArchitectureId:candidate.architectureId,
        ok,
        certificationDigest:ok?certified.certificationDigest:null,
        reasonCodes:ok?[]:(certified.reasonCodes||valid?.reasonCodes||['canonical-zero-loss-proof-required'])
      });
      if(!ok) dominatesAll=false;
    }
    dominationEvidence.push({candidateArchitectureId:candidate.architectureId,dominatesAll,pairwise});
    if(dominatesAll) dominators.push(candidate);
  }

  if(!dominators.length){
    return envelope({
      ok:false,
      status:'FRONTIER_CROWN_REQUIRES_COUNCIL_SYNTHESIS',
      reasonCodes:['no-single-reviewed-architecture-pairwise-dominates-entire-precommitted-roster'],
      campaignId:campaignPlan.campaignId,
      campaignDigest:campaignPlan.campaignDigest,
      architectureRosterDigest:campaignPlan.architectureRosterDigest,
      dominationEvidence,
      nextGate:'BUILD_OR_TEST_A_FRONTIER_COUNCIL_OR_SYNTHESIS_ARCHITECTURE_THAT_DOMINATES_THE_NONDOMINATED_SET',
      truthBoundary:'NO SINGLE CROWN IS ISSUED WHEN REVIEWED ARCHITECTURES TRADE OFF TASK-LEVEL FAILURES. COST CANNOT BREAK A QUALITY NON-DOMINANCE TIE.'
    });
  }

  dominators.sort((a,b)=>
    a.economics.meanCostUsd-b.economics.meanCostUsd ||
    a.economics.meanLatencyMs-b.economics.meanLatencyMs ||
    a.economics.meanFounderMinutes-b.economics.meanFounderMinutes ||
    a.architectureId.localeCompare(b.architectureId)
  );
  const crownTrial=dominators[0];
  const reviewedTrialReceipts=trials.map(t=>({
    architectureId:t.architectureId,
    architectureDigest:t.architectureIdentity.architectureDigest,
    receiptDigest:t.receiptDigest,
    taskOutcomeDigest:t.taskOutcomeDigest
  })).sort((a,b)=>a.architectureId.localeCompare(b.architectureId));
  const reviewSetDigest=digest(reviewedTrialReceipts);
  const body={
    schemaVersion:FRONTIER_CROWN_VERSION,
    certifiedAt:new Date().toISOString(),
    absoluteQualityPolicyDigest:ABSOLUTE_FRONTIER_QUALITY_POLICY_DIGEST,
    campaignId:campaignPlan.campaignId,
    campaignDigest:campaignPlan.campaignDigest,
    architectureRosterDigest:campaignPlan.architectureRosterDigest,
    suiteVersion,
    corpusDigest,
    manifestDigest,
    taskClass,
    taskCount,
    holdoutCommitmentRef:commitmentRef,
    reviewedArchitectureIds:requiredIds,
    reviewSetDigest,
    baselineArchitectureId:crownTrial.architectureId,
    baselineArchitectureDigest:crownTrial.architectureIdentity.architectureDigest,
    baselineTrialReceiptDigest:crownTrial.receiptDigest,
    baselineTaskOutcomeDigest:crownTrial.taskOutcomeDigest,
    baselineMeanCostUsd:crownTrial.economics.meanCostUsd,
    selectionLaw:'PAIRWISE_DOMINATE_EVERY_PRECOMMITTED_ARCHITECTURE_FIRST; ONLY_THEN_MAY_COST_LATENCY_AND_FOUNDER_MINUTES_BREAK_TIES',
    weakeningAuthority:'NONE'
  };
  const certificate=Object.freeze({...body,crownDigest:digest(body)});
  canonicalCrowns.set(certificate,certificate.crownDigest);
  return envelope({
    ok:true,
    status:'FRONTIER_CROWN_CERTIFIED',
    certificate,
    crownDigest:certificate.crownDigest,
    dominationEvidence,
    truthBoundary:'THIS CROWN PROVES PAIRWISE NON-REGRESSION AGAINST EVERY ARCHITECTURE IN THIS EXACT PRECOMMITTED FRESH CAMPAIGN ON THIS EXACT SEALED CORPUS. IT DOES NOT CLAIM METAPHYSICAL GLOBAL OPTIMALITY OR FUTURE-DISTRIBUTION EQUIVALENCE.'
  });
}

export function validateCampaignFrontierCrownCertificate(certificate={}, {
  expectedCampaignDigest=null,
  expectedBaselineArchitectureId=null,
  expectedBaselineTrialReceiptDigest=null,
  now=new Date(),
  maxAgeMs=24*60*60*1000
} = {}) {
  const reasons=[];
  const expected=certificate && typeof certificate==='object' ? canonicalCrowns.get(certificate) : null;
  const body=certificate && typeof certificate==='object'
    ? Object.fromEntries(Object.entries(certificate).filter(([key])=>key!=='crownDigest'))
    : null;
  const actual=body?digest(body):null;
  if(!expected || expected!==certificate?.crownDigest || actual!==certificate?.crownDigest){
    reasons.push('canonical-untampered-frontier-crown-certificate-required');
  }
  if(certificate?.schemaVersion!==FRONTIER_CROWN_VERSION) reasons.push('frontier-crown-schema-required');
  if(certificate?.absoluteQualityPolicyDigest!==ABSOLUTE_FRONTIER_QUALITY_POLICY_DIGEST) reasons.push('frontier-crown-quality-policy-digest-mismatch');
  const certifiedAtMs=Date.parse(certificate?.certifiedAt||'');
  const nowMs=now instanceof Date?now.getTime():Date.parse(now||'');
  if(!Number.isFinite(certifiedAtMs)||!Number.isFinite(nowMs)||certifiedAtMs>nowMs||nowMs-certifiedAtMs>maxAgeMs){
    reasons.push('frontier-crown-stale-or-invalid-time');
  }
  if(expectedCampaignDigest!=null && certificate?.campaignDigest!==expectedCampaignDigest) reasons.push('frontier-crown-campaign-digest-mismatch');
  if(expectedBaselineArchitectureId!=null && certificate?.baselineArchitectureId!==expectedBaselineArchitectureId) reasons.push('frontier-crown-baseline-architecture-mismatch');
  if(expectedBaselineTrialReceiptDigest!=null && certificate?.baselineTrialReceiptDigest!==expectedBaselineTrialReceiptDigest) reasons.push('frontier-crown-baseline-receipt-mismatch');
  return reasons.length
    ? fail('FRONTIER_CROWN_CERTIFICATE_REFUSED',reasons)
    : envelope({
        ok:true,
        status:'FRONTIER_CROWN_CERTIFICATE_VALID',
        crownDigest:certificate.crownDigest,
        campaignDigest:certificate.campaignDigest,
        baselineArchitectureId:certificate.baselineArchitectureId,
        baselineArchitectureDigest:certificate.baselineArchitectureDigest,
        baselineTrialReceiptDigest:certificate.baselineTrialReceiptDigest,
        reviewSetDigest:certificate.reviewSetDigest
      });
}
