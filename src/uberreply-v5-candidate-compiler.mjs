import crypto from 'node:crypto';
import {
  compileUberReplyCandidateTournament,
  getUberReplyOffer
} from './uberreply-four-offer-genome.mjs';
import {
  compileUberOutboundMessageGenotype,
  compileUberOutboundRenderedMessageReceipt,
  compileOutboundTriggerPrior,
  outboundPersonalizationPrior,
  outboundProblemAltitude
} from './uberoutbound-genome.mjs';
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

const BODY_VARIANTS=Object.freeze(['BASE','QUOTE','DOUBLE_EVIDENCE']);

const SUBJECT_VARIANTS=Object.freeze({
  LEAD_TO_BOOKING_LEAK_AUDIT:Object.freeze(['lead handoff','client lead path','booking handoff','lead path evidence']),
  AI_AGENT_RELEASE_GATE:Object.freeze(['agent release gate','release evidence','agent failure gate','release test evidence']),
  CLIENT_ROI_PROOF_SPRINT:Object.freeze(['revenue proof gap','attribution evidence','renewal proof','revenue evidence']),
  BILINGUAL_BOOKING_LEAK_AUDIT:Object.freeze(['booking parity','Arabic English booking','booking journey parity','bilingual booking evidence'])
});

function replaceFinalCta(body,cta){
  return String(body||'').replace(/Want me to send it\?/,'__CTA__').replace('__CTA__',cta);
}

function wordCount(value){
  return clean(value,10000).split(/\s+/).filter(Boolean).length;
}

function coreCopy(body){
  return String(body||'')
    .split(/\n\n(?:Stop future messages:|Reply [“"]no[”"])/)[0]
    .replace(/^Hi[^\n]*,\s*/i,'')
    .trim();
}

function sentenceCount(value){
  return coreCopy(value).split(/(?<=[.!?])\s+/).map(v=>v.trim()).filter(Boolean).length;
}

function candidateExperimentMessage({candidate,prospect,artifact,ctaId}){
  const body=coreCopy(candidate.body);
  const ctaType=['SEND_IT','WORTH_SENDING','WANT_SCREENSHOTS','USEFUL_IF_SEND'].includes(ctaId)?'SEND_ASSET':'LOW_FRICTION_REPLY';
  return{
    candidateId:candidate.candidateId,
    subject:candidate.subject,
    body:candidate.body,
    wordCount:wordCount(body),
    sentenceCount:sentenceCount(body),
    subjectWordCount:wordCount(candidate.subject),
    ctaType,
    personalizationClass:outboundPersonalizationPrior(prospect?.seniority)[0],
    problemAltitude:outboundProblemAltitude(prospect?.seniority),
    problemBeforeProduct:true,
    productHeavy:false,
    relevantProof:true,
    triggerMentioned:false,
    newInformation:false,
    sequencePosition:1,
    offerType:artifact?.artifactType||null,
    proofType:'PROSPECT_SPECIFIC_OBSERVATION',
    proofSimilarityDimension:'SAME_PROBLEM_OR_WORKFLOW',
    subjectArchitecture:'SHORT_PLAIN_RELEVANT',
    openingArchitecture:'EVIDENCE',
    problemArchitecture:'SPECIFIC_OBSERVED_PROBLEM',
    mechanismClass:'EVIDENCE_FIRST_MICRO_ARTIFACT',
    tone:'PLAIN_SPECIFIC_LOW_PRESSURE',
    researchDepth:'EVIDENCE_BOUND',
    sourceCount:artifact?.evidenceRefs?.length||0,
    sourceFreshness:1,
    evidenceSnapshotDigest:artifact?.artifactId||null
  };
}

function candidateFeatures({subject,body,artifact,prospect,ctaEase,research={}}){
  const evidenceCount=Array.isArray(artifact?.evidenceRefs)?artifact.evidenceRefs.length:0;
  const findingCount=Array.isArray(artifact?.findings)?artifact.findings.length:0;
  const confidence=Array.isArray(artifact?.findings)&&artifact.findings.length
    ? artifact.findings.reduce((sum,row)=>sum+clamp(row.confidence),0)/artifact.findings.length
    : 0;
  const bodyWords=wordCount(coreCopy(body));
  const subjectWords=wordCount(subject);
  const company=clean(prospect?.company,160).toLowerCase();
  const lower=clean(body,10000).toLowerCase();
  const companyMention=company&&lower.includes(company)?1:0;
  const evidencePhrase=/found|checked|mapped|evidence|screenshot|shows/.test(lower)?1:0;
  const askCost=/calendar|book a call|30 min|meeting/.test(lower)?1:0;
  const hype=/guarantee|skyrocket|revolutionary|game[- ]?changer|10x/.test(lower)?1:0;
  const cognitivePenalty=bodyWords>100?Math.min(1,(bodyWords-100)/100):0;
  const subjectFit=subjectWords>=2&&subjectWords<=5?1:0.35;
  const triggerPrior=compileOutboundTriggerPrior(prospect?.trigger||{});
  const coreSentences=sentenceCount(body);
  const messageClarity=clamp(
    (bodyWords>=51&&bodyWords<=100?0.55:bodyWords<=100?0.42:0.20)
    +(coreSentences>=3&&coreSentences<=4?0.35:0.15)
    +(subjectFit===1?0.10:0)
  );
  return{
    problemEvidence:clamp(prospect?.problemEvidenceScore??confidence),
    roleOwnership:clamp(prospect?.roleOwnershipScore),
    triggerStrengthFreshness:clamp(prospect?.triggerStrengthFreshness??triggerPrior.score??research?.signalStrength),
    relevanceSpecificity:clamp(0.7+0.15*companyMention+0.15*Math.min(1,findingCount/2)),
    offerUtility:clamp(artifact?.prepared===true?0.9:0.45),
    proofSimilarity:clamp(0.65+0.25*Math.min(1,findingCount/2)),
    ctaEase:clamp(ctaEase),
    credibility:clamp(0.55+0.2*evidencePhrase+0.25*confidence),
    messageClarity,
    subjectFit,
    toneFit:0.9,
    novelty:0.5,
    unsupportedClaimPenalty:0,
    hypePenalty:hype,
    creepyPersonalizationPenalty:0,
    askCostPenalty:askCost,
    cognitiveLoadPenalty:cognitivePenalty,
    unknownPriorComponents:[
      ...(prospect?.roleOwnershipScore==null?['roleOwnership']:[]),
      ...(prospect?.trigger==null&&prospect?.triggerStrengthFreshness==null?['triggerStrengthFreshness']:[])
    ]
  };
}


function deterministicUnit(seed){
  const hex=hash(seed).slice(0,13);
  return parseInt(hex,16)/0xfffffffffffff;
}


export function compileUberReplyTreatmentIdentity({
  offerId,
  subject='',
  body='',
  followup=0,
  candidateSet=null,
  prospect={},
  artifact=null
}={}){
  const position=Math.max(1,Number(followup||0)+1);
  const assigned=candidateSet?.assignedCandidate||candidateSet?.selectedCandidate||null;
  const assignedId=candidateSet?.assignedCandidateId||candidateSet?.selectedCandidateId||assigned?.candidateId||null;
  const payloadDigest=`sha256:${hash([offerId||'',position,subject||'',body||''].join('|'))}`;
  const firstTouch=position===1;
  const candidateId=firstTouch&&assignedId
    ? assignedId
    : `ubv5_touch_${hash([offerId||'',position,subject||'',body||''].join('|')).slice(0,16)}`;
  const strategyArmId=firstTouch&&(assigned?.strategyArmId||candidateSet?.assignedStrategyArmId)
    ? (assigned?.strategyArmId||candidateSet.assignedStrategyArmId)
    : `ubv5arm_${hash([offerId||'', 'FOLLOWUP', position].join('|')).slice(0,16)}`;
  const fallbackMessage={
    candidateId,
    subject,
    body,
    wordCount:wordCount(coreCopy(body)),
    sentenceCount:sentenceCount(body),
    subjectWordCount:wordCount(subject),
    ctaType:'SEND_ASSET',
    personalizationClass:outboundPersonalizationPrior(prospect?.seniority)[0],
    problemAltitude:outboundProblemAltitude(prospect?.seniority),
    problemBeforeProduct:true,
    productHeavy:false,
    relevantProof:true,
    triggerMentioned:false,
    newInformation:position>1,
    sequencePosition:position,
    offerType:artifact?.artifactType||null,
    proofType:'PROSPECT_SPECIFIC_OBSERVATION',
    proofSimilarityDimension:'SAME_PROBLEM_OR_WORKFLOW',
    subjectArchitecture:'SHORT_PLAIN_RELEVANT',
    openingArchitecture:position>1?'NEW_EVIDENCE':'EVIDENCE',
    problemArchitecture:'SPECIFIC_OBSERVED_PROBLEM',
    mechanismClass:'EVIDENCE_FIRST_MICRO_ARTIFACT',
    tone:'PLAIN_SPECIFIC_LOW_PRESSURE',
    evidenceSnapshotDigest:artifact?.artifactId||null
  };
  const genotype=firstTouch&&assigned?.genotypeId
    ? {genotypeId:assigned.genotypeId}
    : compileUberOutboundMessageGenotype(fallbackMessage,prospect);
  const rendered=firstTouch&&assigned?.renderedMessageId
    ? {renderedMessageId:assigned.renderedMessageId,contentReceipt:assigned.contentReceipt||null}
    : compileUberOutboundRenderedMessageReceipt(fallbackMessage,genotype);
  return{
    candidateId,
    strategyArmId,
    payloadDigest,
    genotypeId:genotype.genotypeId,
    renderedMessageId:rendered.renderedMessageId,
    contentReceipt:rendered.contentReceipt||null,
    sequencePosition:position,
    assignmentMode:firstTouch?(candidateSet?.assignmentMode||'EXPLOIT_CHAMPION'):'EVIDENCE_SEQUENCE',
    assignmentProbability:firstTouch&&Number.isFinite(Number(candidateSet?.assignmentProbability))?Number(candidateSet.assignmentProbability):null,
    strategyAtoms:firstTouch&&assigned?.strategyAtoms
      ? assigned.strategyAtoms
      : {
          structure:'NEW_EVIDENCE_EFFECT_PERMISSION_CTA',
          sequencePosition:position,
          offerId:String(offerId||'').toUpperCase()
        },
    externalEffectAuthority:'NONE',
    businessEffectAuthority:'NONE',
    truthBoundary:'Treatment identity binds the exact subject/body, reusable genotype, rendered-message receipt and sequence position for outcome attribution. It grants no send authority.'
  };
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
      const pool=challengers;
    const index=Math.min(pool.length-1,Math.floor(deterministicUnit(`${key}|challenger`)*pool.length));
    assigned=pool[index];
    mode='EXPLORE_CHALLENGER';
  }
  return{
    ok:true,
    state:'UBERREPLY_EXPERIMENT_ASSIGNMENT_READY',
    mode,
    assignedCandidateId:assigned.candidateId,
    assignedStrategyArmId:assigned.candidate?.strategyArmId||null,
    assignedCandidate:assigned.candidate,
    assignedSeedScore:assigned.score,
    explorationRate:rate,
    challengerCount:challengers.length,
    assignmentProbability:mode==='EXPLOIT_CHAMPION'?(1-rate):(challengers.length?rate/challengers.length:0),
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
  const activeBodyVariants=(artifact?.findings?.length||0)>1?BODY_VARIANTS:['BASE','QUOTE'];
  const limit=Math.max(1,Math.min(24,Number(maxCandidates)||12));
  const baseSubject=subjects[0]||buildUberReplyV5Subject({offerId:offer.offerId,prospect,issue});
  const baseCta=CTA_VARIANTS[0];
  const specs=[
    {controlledDimension:'BASELINE',variantKey:'BASELINE',subject:baseSubject,cta:baseCta,bodyMode:'BASE'},
    ...subjects.slice(1).map((subject,index)=>({controlledDimension:'SUBJECT',variantKey:`SUBJECT_${index+1}`,subject,cta:baseCta,bodyMode:'BASE'})),
    ...CTA_VARIANTS.slice(1).map(cta=>({controlledDimension:'CTA',variantKey:cta.id,subject:baseSubject,cta,bodyMode:'BASE'})),
    ...activeBodyVariants.filter(mode=>mode!=='BASE').map(bodyMode=>({controlledDimension:'PROOF_DENSITY',variantKey:bodyMode,subject:baseSubject,cta:baseCta,bodyMode}))
  ].slice(0,limit);

  for(const spec of specs){
    const {subject,cta,bodyMode,controlledDimension,variantKey}=spec;
    const variantBody=buildUberReplyV5Message({
      offerId:offer.offerId,
      prospect,
      issue,
      audit,
      contact,
      sender,
      artifact,
      unsubscribeUrl,
      variantMode:bodyMode
    });
    const body=replaceFinalCta(variantBody||baseBody,cta.text);
    const features=candidateFeatures({subject,body,artifact,prospect,ctaEase:cta.ctaEase,research});
    const strategyArmId=`ubv5arm_${hash([offer.offerId,controlledDimension,variantKey].join('|')).slice(0,16)}`;
    const seedCandidate={
      candidateId:`ubv5_${hash([offer.offerId,subject,cta.id,bodyMode,body].join('|')).slice(0,16)}`,
      strategyArmId,
      offerId:offer.offerId,
      subject,
      body,
      strategyAtoms:{
        structure:'EVIDENCE_EFFECT_EVIDENCE_OF_WORK_MICRO_ASK',
        controlledDimension,
        variantKey,
        subject,
        ctaId:cta.id,
        bodyMode,
        artifactType:artifact.artifactType,
        evidenceRefCount:artifact.evidenceRefs?.length||0,
        findingCount:artifact.findings?.length||0
      },
      ...features
    };
    const experimentMessage=candidateExperimentMessage({candidate:seedCandidate,prospect,artifact,ctaId:cta.id});
    const genotype=compileUberOutboundMessageGenotype(experimentMessage,prospect);
    const rendered=compileUberOutboundRenderedMessageReceipt(experimentMessage,genotype);
    candidates.push({
      ...seedCandidate,
      experimentMessage,
      genotypeId:genotype.genotypeId,
      renderedMessageId:rendered.renderedMessageId,
      contentReceipt:rendered.contentReceipt
    });
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
    assignedStrategyArmId:assignment.assignedStrategyArmId,
    assignmentMode:assignment.mode,
    assignmentProbability:assignment.assignmentProbability,
    externalEffectAuthority:'NONE',
    businessEffectAuthority:'NONE',
    truthBoundary:'Champion selection maximizes the deterministic seed score, while a bounded deterministic exploration slice assigns challengers for real-world learning. Neither score nor assignment is a calibrated reply probability.'
  };
}
