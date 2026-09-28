import crypto from 'node:crypto';
import {
  compileUberReplyCandidateTournament,
  getUberReplyOffer
} from './uberreply-four-offer-genome.mjs';
import {
  buildUberReplyV5Message,
  buildUberReplyV5Subject
} from './copy.mjs';

export const UBERREPLY_V5_CANDIDATE_COMPILER_VERSION='uberbond.uberreply-v5-candidate-compiler.v1';

const clean=(v,n=1000)=>String(v??'').trim().replace(/\s+/g,' ').slice(0,n);
const clamp=v=>Math.max(0,Math.min(1,Number.isFinite(Number(v))?Number(v):0));
const hash=v=>crypto.createHash('sha256').update(String(v??'')).digest('hex');

const CTA_VARIANTS=Object.freeze([
  Object.freeze({id:'SEND_IT',text:'Want me to send it?',ctaEase:0.98}),
  Object.freeze({id:'WORTH_SENDING',text:'Worth sending over?',ctaEase:0.93}),
  Object.freeze({id:'WANT_SCREENSHOTS',text:'Want the screenshots?',ctaEase:0.95}),
  Object.freeze({id:'USEFUL_IF_SEND',text:'Useful if I send the one-pager?',ctaEase:0.90})
]);

const SUBJECT_VARIANTS=Object.freeze({
  LEAD_TO_BOOKING_LEAK_AUDIT:Object.freeze(['lead handoff','client lead path','booking handoff']),
  AI_AGENT_RELEASE_GATE:Object.freeze(['agent release gate','release evidence','agent failure gate']),
  CLIENT_ROI_PROOF_SPRINT:Object.freeze(['revenue proof gap','attribution evidence','renewal proof']),
  BILINGUAL_BOOKING_LEAK_AUDIT:Object.freeze(['booking parity','Arabic English booking','booking journey parity'])
});

function replaceFinalCta(body,cta){
  return String(body||'').replace(/Want me to send it\?/,'__CTA__').replace('__CTA__',cta);
}

function wordCount(value){
  return clean(value,10000).split(/\s+/).filter(Boolean).length;
}

function candidateFeatures({subject,body,artifact,prospect,ctaEase,index}){
  const evidenceCount=Array.isArray(artifact?.evidenceRefs)?artifact.evidenceRefs.length:0;
  const findingCount=Array.isArray(artifact?.findings)?artifact.findings.length:0;
  const confidence=Array.isArray(artifact?.findings)&&artifact.findings.length
    ? artifact.findings.reduce((sum,row)=>sum+clamp(row.confidence),0)/artifact.findings.length
    : 0;
  const bodyWords=wordCount(body);
  const subjectWords=wordCount(subject);
  const company=clean(prospect?.company,160).toLowerCase();
  const lower=clean(body,10000).toLowerCase();
  const companyMention=company&&lower.includes(company)?1:0;
  const evidencePhrase=/found|checked|mapped|evidence|screenshot|shows/.test(lower)?1:0;
  const askCost=/calendar|book a call|30 min|meeting/.test(lower)?1:0;
  const hype=/guarantee|skyrocket|revolutionary|game[- ]?changer|10x/.test(lower)?1:0;
  const cognitivePenalty=bodyWords>100?Math.min(1,(bodyWords-100)/100):0;
  const subjectFit=subjectWords>=2&&subjectWords<=5?1:0.35;
  return{
    relevanceSpecificity:clamp(0.7+0.15*companyMention+0.15*Math.min(1,findingCount/2)),
    problemClarity:clamp(0.72+0.18*Math.min(1,findingCount/2)),
    evidenceStrength:clamp(0.5+0.25*Math.min(1,evidenceCount/2)+0.25*confidence),
    offerUtility:clamp(artifact?.prepared===true?0.9:0.45),
    proofSimilarity:clamp(0.65+0.25*Math.min(1,findingCount/2)),
    ctaEase:clamp(ctaEase),
    credibility:clamp(0.55+0.2*evidencePhrase+0.25*confidence),
    consequenceFit:clamp(0.78),
    cognitiveEase:clamp(1-cognitivePenalty),
    subjectFit,
    toneFit:0.9,
    novelty:clamp(0.35+(index*0.04)),
    unsupportedClaimPenalty:0,
    hypePenalty:hype,
    creepyPersonalizationPenalty:0,
    askCostPenalty:askCost,
    cognitiveLoadPenalty:cognitivePenalty,
    genericnessPenalty:companyMention?0.05:0.25
  };
}


function deterministicUnit(seed){
  const hex=hash(seed).slice(0,13);
  return parseInt(hex,16)/0xfffffffffffff;
}

export function compileUberReplyExperimentalAssignment({
  tournament,
  prospectKey='',
  explorationRate
}={}){
  if(!tournament?.ok||!tournament?.champion?.candidate)return{
    ok:false,
    state:'UBERREPLY_ASSIGNMENT_REFUSED',
    reasonCodes:['valid-tournament-required'],
    externalEffectAuthority:'NONE',
    businessEffectAuthority:'NONE'
  };
  const challengers=Array.isArray(tournament.challengers)?tournament.challengers.filter(row=>row?.candidate):[];
  const rate=Math.max(0,Math.min(0.5,Number.isFinite(Number(explorationRate))?Number(explorationRate):Number(tournament.explorationRate||0)));
  const baseKey=clean(prospectKey,1000)||'unknown-prospect';
  const key=`${baseKey}|${tournament.champion.candidateId}`;
  const explore=challengers.length>0&&deterministicUnit(`${key}|explore`)<rate;
  let assigned=tournament.champion;
  let mode='EXPLOIT_CHAMPION';
  if(explore){
    const pool=challengers.slice(0,Math.min(3,challengers.length));
    const index=Math.min(pool.length-1,Math.floor(deterministicUnit(`${key}|challenger`)*pool.length));
    assigned=pool[index];
    mode='EXPLORE_CHALLENGER';
  }
  return{
    ok:true,
    state:'UBERREPLY_EXPERIMENT_ASSIGNMENT_READY',
    mode,
    assignedCandidateId:assigned.candidateId,
    assignedCandidate:assigned.candidate,
    assignedSeedScore:assigned.score,
    explorationRate:rate,
    assignmentKeyDigest:`sha256:${hash(key)}`,
    automaticDispatchAuthorized:false,
    externalEffectAuthority:'NONE',
    businessEffectAuthority:'NONE',
    truthBoundary:'Assignment is deterministic exploration/exploitation over seed-scored candidates. It does not estimate causal lift by itself; downstream randomized outcome accounting is required.'
  };
}

export function compileUberReplyV5CandidateSet({
  offerId,
  prospect={},
  issue={},
  audit=[],
  contact={},
  sender={},
  artifact=null,
  unsubscribeUrl='',
  research={},
  maxCandidates=12
}={}){
  const offer=getUberReplyOffer(offerId);
  if(!offer)return{
    ok:false,
    state:'UBERREPLY_V5_CANDIDATE_SET_REFUSED',
    reasonCodes:['known-offer-required'],
    externalEffectAuthority:'NONE',
    businessEffectAuthority:'NONE'
  };
  if(artifact?.prepared!==true)return{
    ok:false,
    state:'UBERREPLY_V5_CANDIDATE_SET_REFUSED',
    reasonCodes:['prepared-artifact-required'],
    externalEffectAuthority:'NONE',
    businessEffectAuthority:'NONE'
  };

  const baseBody=buildUberReplyV5Message({
    offerId:offer.offerId,
    prospect,
    issue,
    audit,
    contact,
    sender,
    artifact,
    unsubscribeUrl
  });
  const baseSubject=buildUberReplyV5Subject({offerId:offer.offerId,prospect,issue});
  const subjects=[baseSubject,...(SUBJECT_VARIANTS[offer.offerId]||[])].filter((v,i,a)=>v&&a.indexOf(v)===i);

  const candidates=[];
  for(const subject of subjects){
    for(const cta of CTA_VARIANTS){
      const body=replaceFinalCta(baseBody,cta.text);
      const features=candidateFeatures({subject,body,artifact,prospect,ctaEase:cta.ctaEase,index:candidates.length});
      candidates.push({
        candidateId:`ubv5_${hash([offer.offerId,subject,cta.id,body].join('|')).slice(0,16)}`,
        offerId:offer.offerId,
        subject,
        body,
        strategyAtoms:{
          structure:'EVIDENCE_EFFECT_EVIDENCE_OF_WORK_MICRO_ASK',
          subject,
          ctaId:cta.id,
          artifactType:artifact.artifactType,
          evidenceRefCount:artifact.evidenceRefs?.length||0,
          findingCount:artifact.findings?.length||0
        },
        ...features
      });
      if(candidates.length>=Math.max(1,Math.min(24,Number(maxCandidates)||12)))break;
    }
    if(candidates.length>=Math.max(1,Math.min(24,Number(maxCandidates)||12)))break;
  }

  const tournament=compileUberReplyCandidateTournament({
    offerId:offer.offerId,
    prospect,
    research,
    candidates,
    explorationRate:0.15
  });
  if(!tournament.ok)return{
    ...tournament,
    state:'UBERREPLY_V5_CANDIDATE_SET_REFUSED',
    candidates,
    externalEffectAuthority:'NONE',
    businessEffectAuthority:'NONE'
  };

  const assignment=compileUberReplyExperimentalAssignment({
    tournament,
    prospectKey:prospect.id||prospect.website||prospect.company||offer.offerId,
    explorationRate:tournament.explorationRate
  });
  return{
    ok:true,
    version:UBERREPLY_V5_CANDIDATE_COMPILER_VERSION,
    state:'UBERREPLY_V5_CANDIDATE_SET_READY',
    offerId:offer.offerId,
    publicName:offer.publicName,
    candidateCount:candidates.length,
    candidates,
    tournament,
    selectedCandidate:tournament.champion.candidate,
    selectedCandidateId:tournament.champion.candidateId,
    selectionScore:tournament.champion.score,
    assignment,
    assignedCandidate:assignment.assignedCandidate,
    assignedCandidateId:assignment.assignedCandidateId,
    assignmentMode:assignment.mode,
    externalEffectAuthority:'NONE',
    businessEffectAuthority:'NONE',
    truthBoundary:'Champion selection maximizes the deterministic seed score, while a bounded deterministic exploration slice assigns challengers for real-world learning. Neither score nor assignment is a calibrated reply probability.'
  };
}
