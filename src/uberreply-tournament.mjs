import crypto from 'node:crypto';
import { assignUberOutboundExperiment } from './uberoutbound-genome.mjs';
import { proposeProfileWeightUpdates } from './economic-feedback-allocator.mjs';
import {
  UBERREPLY_OFFER_PORTFOLIO,
  compileUberReplyOfferLifecycle,
  compileUberReplyOutcomeFitness,
  compileUberReplyStrategyLifecycle,
  getUberReplyOffer
} from './uberreply-four-offer-genome.mjs';

export const UBERREPLY_TOURNAMENT_VERSION = 'uberbond.uberreply-tournament.v1';

const clean=(v,n=1000)=>String(v??'').trim().slice(0,n);
const upper=v=>clean(v,240).toUpperCase();
const finite=v=>Number.isFinite(Number(v))?Number(v):null;
const integer=v=>Math.max(0,Math.floor(finite(v)??0));
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const uniq=v=>[...new Set((v||[]).filter(Boolean))];
const hashUnit=value=>crypto.createHash('sha256').update(String(value??'')).digest().readUInt32BE(0)/0xffffffff;
const digest=(prefix,value)=>`${prefix}_${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;

export const UBERREPLY_EXPERIMENT_LIBRARY = Object.freeze([
  Object.freeze({
    id:'CTA_ASSET_VS_INTEREST',
    treatmentDimension:'CTA',
    causalQuestion:'Does offering a prepared evidence asset outperform a low-friction interest question on paid/down-funnel economics?',
    arms:Object.freeze(['SEND_ASSET','INTEREST']),
    primaryMetric:'INCREMENTAL_CLEARED_CONTRIBUTION_PROFIT'
  }),
  Object.freeze({
    id:'TENSION_QUESTION_VS_STATEMENT',
    treatmentDimension:'PROBLEM_FRAMING',
    causalQuestion:'Does an evidence-linked tension question outperform a concise tension statement on paid/down-funnel economics?',
    arms:Object.freeze(['TENSION_QUESTION','TENSION_STATEMENT']),
    primaryMetric:'INCREMENTAL_CLEARED_CONTRIBUTION_PROFIT'
  }),
  Object.freeze({
    id:'TRIGGER_MENTION_VS_SELECTION_ONLY',
    treatmentDimension:'TRIGGER_MENTION',
    causalQuestion:'Given the same selected trigger, does explicitly mentioning it improve paid/down-funnel economics?',
    arms:Object.freeze(['MENTION_TRIGGER','DO_NOT_MENTION_TRIGGER']),
    primaryMetric:'INCREMENTAL_CLEARED_CONTRIBUTION_PROFIT'
  }),
  Object.freeze({
    id:'ACCOUNT_SIGNAL_VS_PROBLEM_SUBJECT',
    treatmentDimension:'SUBJECT_ARCHITECTURE',
    causalQuestion:'Does a short account-signal subject outperform a short problem-noun subject on paid/down-funnel economics?',
    arms:Object.freeze(['ACCOUNT_SIGNAL','PROBLEM_NOUN']),
    primaryMetric:'INCREMENTAL_CLEARED_CONTRIBUTION_PROFIT'
  }),
  Object.freeze({
    id:'ARTIFACT_ONE_PAGE_VS_THREE_FINDINGS',
    treatmentDimension:'PERMISSIONLESS_VALUE_ARTIFACT',
    causalQuestion:'Does a one-page map outperform three concise findings as the first-touch offered artifact on paid/down-funnel economics?',
    arms:Object.freeze(['ONE_PAGE_MAP','THREE_FINDINGS']),
    primaryMetric:'INCREMENTAL_CLEARED_CONTRIBUTION_PROFIT'
  }),
  Object.freeze({
    id:'THREE_TOUCH_VS_ADAPTIVE_EXTENSION',
    treatmentDimension:'SEQUENCE_POLICY',
    causalQuestion:'Does a three-touch default outperform evidence-conditioned extension up to six touches after accounting for contribution and reputation cost?',
    arms:Object.freeze(['THREE_TOUCH_DEFAULT','ADAPTIVE_UP_TO_SIX']),
    primaryMetric:'INCREMENTAL_CLEARED_CONTRIBUTION_PROFIT'
  })
]);

export const UBERREPLY_RESEARCH_DONOR_LEDGER = Object.freeze([
  Object.freeze({id:'gong-30mpc-85m-2025',contribution:'short first touch, problem before product, CTA and personalization priors',evidenceClass:'LARGE_OBSERVATIONAL_VENDOR_DATASET',state:'PROBABLE'}),
  Object.freeze({id:'30mpc-offer-cta',contribution:'offer/asset CTA and problem-linked signal doctrine',evidenceClass:'PRACTITIONER_PLUS_DATA_SYNTHESIS',state:'PROBABLE'}),
  Object.freeze({id:'sam-mckenna-smykm',contribution:'recipient-specific contextual relevance',evidenceClass:'PRACTITIONER_DOCTRINE',state:'SPECULATIVE_UNTIL_SEGMENT_TESTED'}),
  Object.freeze({id:'josh-braun-illuminate',contribution:'resistance reduction and tension/problem illumination',evidenceClass:'PRACTITIONER_DOCTRINE',state:'SPECULATIVE_UNTIL_SEGMENT_TESTED'}),
  Object.freeze({id:'instantly-2026-benchmark',contribution:'micro-segmentation, problem-focused messaging, continuous testing',evidenceClass:'VENDOR_PLATFORM_BENCHMARK',state:'PROBABLE'}),
  Object.freeze({id:'woodpecker-2026-benchmark',contribution:'small coherent campaigns, mailbox-volume/reply-rate association, hygiene',evidenceClass:'VENDOR_PLATFORM_BENCHMARK',state:'PROBABLE'}),
  Object.freeze({id:'belkins-2026-research',contribution:'follow-up and recipient-behavior hypotheses',evidenceClass:'VENDOR_RESEARCH',state:'PROBABLE_OR_SPECULATIVE_BY_CLAIM'})
]);

export function selectUberReplyExperiment({offerId,experimentCellId='',segmentKey='',cycle=0}={}){
  const offer=getUberReplyOffer(offerId);
  if(!offer)return{ok:false,state:'UNKNOWN_OFFER',reasonCodes:['known-offer-required']};
  const key=[offer.offerId,clean(experimentCellId,300),clean(segmentKey,300),integer(cycle)].join('|');
  const index=Math.min(UBERREPLY_EXPERIMENT_LIBRARY.length-1,Math.floor(hashUnit(key)*UBERREPLY_EXPERIMENT_LIBRARY.length));
  const hypothesis=UBERREPLY_EXPERIMENT_LIBRARY[index];
  const experiment={
    experimentId:digest('ubrxp',{offerId:offer.offerId,hypothesisId:hypothesis.id,segmentKey:clean(segmentKey,300),cycle:integer(cycle)}),
    primaryMetric:hypothesis.primaryMetric,
    treatmentDimension:hypothesis.treatmentDimension,
    causalQuestion:hypothesis.causalQuestion,
    arms:[...hypothesis.arms],
    holdoutRate:0.05
  };
  return{
    ok:true,
    state:'UBERREPLY_EXPERIMENT_SELECTED',
    offerId:offer.offerId,
    hypothesis,
    experiment,
    externalEffectAuthority:'NONE',
    businessEffectAuthority:'NONE',
    truthBoundary:'Experiment selection is deterministic diversification across predeclared hypotheses. It does not assert any arm is superior.'
  };
}

export function assignUberReplyExperiment({prospect={},offerId,experimentCellId='',segmentKey='',cycle=0}={}){
  const selected=selectUberReplyExperiment({offerId,experimentCellId,segmentKey,cycle});
  if(!selected.ok)return selected;
  const assignment=assignUberOutboundExperiment({prospect,experiment:selected.experiment});
  return{
    ...selected,
    assignment,
    state:assignment?'UBERREPLY_EXPERIMENT_ASSIGNED':'UBERREPLY_EXPERIMENT_ASSIGNMENT_REFUSED',
    truthBoundary:'Assignment inherits the canonical deterministic account/recipient experiment allocator and persistent holdout behavior. It creates no send authority.'
  };
}

export function applyUberReplyArmToMessageCandidate(candidate={},assignment=null){
  const out={...candidate};
  const arm=upper(assignment?.arm);
  if(!arm||assignment?.holdout===true)return{candidate:out,arm:arm||null,holdout:assignment?.holdout===true};
  if(arm==='SEND_ASSET')out.ctaType='SEND_ASSET';
  if(arm==='INTEREST')out.ctaType='INTEREST';
  if(arm==='TENSION_QUESTION')out.problemArchitecture='TENSION_QUESTION';
  if(arm==='TENSION_STATEMENT')out.problemArchitecture='TENSION_STATEMENT';
  if(arm==='MENTION_TRIGGER')out.triggerMentioned=true;
  if(arm==='DO_NOT_MENTION_TRIGGER')out.triggerMentioned=false;
  if(arm==='ACCOUNT_SIGNAL')out.subjectArchitecture='SHORT_ACCOUNT_SIGNAL';
  if(arm==='PROBLEM_NOUN')out.subjectArchitecture='SHORT_PROBLEM_NOUN';
  if(arm==='ONE_PAGE_MAP')out.offerType='ONE_PAGE_MAP';
  if(arm==='THREE_FINDINGS')out.offerType='THREE_FINDINGS';
  if(arm==='THREE_TOUCH_DEFAULT')out.sequencePolicy='THREE_TOUCH_DEFAULT';
  if(arm==='ADAPTIVE_UP_TO_SIX')out.sequencePolicy='ADAPTIVE_UP_TO_SIX';
  return{candidate:out,arm,holdout:false};
}

export function compileUberReplyEconomicWeightProposal({observations=[],policy={}}={}){
  const segments=(Array.isArray(observations)?observations:[]).map(row=>({
    profileKey:clean(row.profileKey||`${upper(row.offerId)}:${clean(row.genotypeId,240)}`,300),
    dimensions:{
      offerId:upper(row.offerId),
      genotypeId:clean(row.genotypeId,240),
      experimentCellId:clean(row.experimentCellId,240),
      industry:upper(row.industry),
      seniority:upper(row.seniority),
      triggerClass:upper(row.triggerClass),
      researchDepth:upper(row.researchDepth)
    },
    exposures:integer(row.providerConfirmedSends??row.exposures),
    qualifiedOutcomes:integer(row.qualifiedConversations??row.qualifiedOutcomes),
    paidAcceptedOutcomes:integer(row.paidAcceptedOutcomes??Math.min(integer(row.paidSprints),integer(row.acceptedDeliveries))),
    clearedContributionCents:finite(row.clearedContributionCents),
    founderMinutes:finite(row.founderMinutes),
    currentWeight:finite(row.currentWeight)??1
  }));
  return proposeProfileWeightUpdates({
    segments,
    policy:{
      minOutcomes:policy.minOutcomes??10,
      minPaidOutcomes:policy.minPaidOutcomes??3,
      explorationFloor:policy.explorationFloor??0.1,
      maxWeightDeltaPerCycle:policy.maxWeightDeltaPerCycle??0.15,
      minWeight:policy.minWeight??0.25,
      maxWeight:policy.maxWeight??4
    }
  });
}

export function compileUberReplyTournament({candidates=[],allocatorPolicy={},promotionPolicy={}}={}){
  const rows=Array.isArray(candidates)?candidates:[];
  const observations=rows.map(row=>({
    profileKey:row.profileKey,
    offerId:row.offerId,
    genotypeId:row.genotypeId,
    experimentCellId:row.experimentCellId,
    industry:row.industry,
    seniority:row.seniority,
    triggerClass:row.triggerClass,
    researchDepth:row.researchDepth,
    providerConfirmedSends:row.outcome?.providerConfirmedSends,
    qualifiedConversations:row.outcome?.qualifiedConversations,
    paidSprints:row.outcome?.paidSprints,
    acceptedDeliveries:row.outcome?.acceptedDeliveries,
    paidAcceptedOutcomes:row.outcome?.paidAcceptedOutcomes,
    clearedContributionCents:row.outcome?.clearedContributionCents,
    founderMinutes:row.outcome?.founderMinutes,
    currentWeight:row.currentWeight
  }));
  const weightProposal=compileUberReplyEconomicWeightProposal({observations,policy:allocatorPolicy});
  const proposedByKey=new Map((weightProposal?.proposal?.updates||[]).map(row=>[row.profileKey,row]));
  const evaluations=rows.map(row=>{
    const key=clean(row.profileKey||`${upper(row.offerId)}:${clean(row.genotypeId,240)}`,300);
    const fitness=compileUberReplyOutcomeFitness(row.outcome||{});
    const offerLifecycle=compileUberReplyOfferLifecycle({offerId:row.offerId,outcome:row.outcome||{}});
    const strategyLifecycle=compileUberReplyStrategyLifecycle({
      genotype:{genotypeId:row.genotypeId},
      experimentEvidence:row.experimentEvidence||{},
      validationEvidence:row.validationEvidence||{},
      reputationEvidence:row.reputationEvidence||{},
      economicEvidence:row.economicEvidence||{},
      policy:promotionPolicy
    });
    const proposed=proposedByKey.get(key)||null;
    const revoked=strategyLifecycle.promotion?.state==='REVOKED'||strategyLifecycle.degradation?.nextState==='REVOKED';
    const degraded=strategyLifecycle.degradation?.nextState==='DEGRADED';
    const offerRethink=['RETHINK_OFFER','RETHINK_ECONOMICS','DEGRADE_OR_PAUSE_FOR_GUARDRAIL_REVIEW'].includes(offerLifecycle.state);
    let tournamentState='HOLD_FOR_MORE_EVIDENCE';
    let nextWeight=finite(row.currentWeight)??1;
    const reasons=[];
    if(revoked){tournamentState='REVOKED';nextWeight=0;reasons.push('canonical-promotion-or-degradation-gate-revoked');}
    else if(degraded||offerRethink){tournamentState='DEGRADED';nextWeight=Math.max(0.05,(finite(row.currentWeight)??1)*0.5);reasons.push('degradation-or-offer-rethink');}
    else if(proposed?.allocationState==='BOUNDED_REALLOCATION_PROPOSED'){
      tournamentState='ECONOMIC_WEIGHT_UPDATE_PROPOSED';nextWeight=proposed.proposedWeight;reasons.push('paid-accepted-cleared-contribution-evidence');
    }
    return{
      profileKey:key,
      offerId:upper(row.offerId),
      genotypeId:clean(row.genotypeId,240)||null,
      fitness,
      offerLifecycle,
      strategyLifecycle,
      tournamentState,
      currentWeight:finite(row.currentWeight)??1,
      proposedWeight:Number(nextWeight.toFixed(6)),
      reasonCodes:uniq(reasons),
      selectableNextCycle:nextWeight>0&&!revoked
    };
  });
  const selectable=evaluations.filter(row=>row.selectableNextCycle).sort((a,b)=>b.proposedWeight-a.proposedWeight||b.fitness.contributionPer1000Cents-a.fitness.contributionPer1000Cents||a.profileKey.localeCompare(b.profileKey));
  return{
    version:UBERREPLY_TOURNAMENT_VERSION,
    state:evaluations.length?'TOURNAMENT_POLICY_UPDATE_READY':'NO_CANDIDATES',
    weightProposal,
    evaluations,
    selectableOrder:selectable.map(row=>row.profileKey),
    revoked:evaluations.filter(row=>row.tournamentState==='REVOKED').map(row=>row.profileKey),
    automaticExternalEffectAuthority:false,
    automaticSpendIncreaseAuthorized:false,
    externalEffectAuthority:'NONE',
    businessEffectAuthority:'NONE',
    truthBoundary:'The tournament may automatically compute next-cycle internal selection weights and revocation recommendations from supplied causal/economic evidence. It cannot create contact, spend, provider, legal, or deployment authority.'
  };
}

export function compileUberReplyOfferPortfolioState({offerOutcomes={}}={}){
  const offers=UBERREPLY_OFFER_PORTFOLIO.map(offer=>compileUberReplyOfferLifecycle({offerId:offer.offerId,outcome:offerOutcomes?.[offer.offerId]||{}}));
  return{
    version:UBERREPLY_TOURNAMENT_VERSION,
    offers,
    rethinkOffers:offers.filter(row=>row.state.startsWith('RETHINK')||row.state.startsWith('DEGRADE')).map(row=>row.offerId),
    scaleReviewCandidates:offers.filter(row=>row.state==='SCALE_REVIEW_CANDIDATE').map(row=>row.offerId),
    externalEffectAuthority:'NONE',
    businessEffectAuthority:'NONE'
  };
}
