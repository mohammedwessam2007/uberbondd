import {
  compileUberOutboundLearningPacket,
  compileUberOutboundOutcomeReceipt
} from './uberoutbound-genome.mjs';

export const UBERREPLY_LEARNING_LOOP_VERSION='uberbond.uberreply-learning-loop.v1';

const arr=v=>Array.isArray(v)?v:[];
const lower=v=>String(v??'').trim().toLowerCase();
const num=v=>Number.isFinite(Number(v))?Number(v):null;
const ts=v=>{const n=Date.parse(v||'');return Number.isFinite(n)?n:null;};

function clearedEconomicEvidenceForProspect(prospectId,orders=[],revenueEvents=[]){
  let clearedRevenueCents=0;
  let clearedContributionCents=0;
  let hasRevenue=false;
  let hasContribution=false;
  for(const row of [...arr(orders),...arr(revenueEvents)]){
    if(row?.prospectId!==prospectId)continue;
    const status=lower(row.status||row.eventName);
    if(!/(paid|settled|cleared|completed)/.test(status))continue;
    const amount=num(row.amountCents??row.clearedRevenueCents);
    if(amount!=null){clearedRevenueCents+=amount;hasRevenue=true;}
    const contribution=num(row.clearedContributionCents??row.contributionCents);
    if(contribution!=null){clearedContributionCents+=contribution;hasContribution=true;}
  }
  return{
    clearedRevenueCents:hasRevenue?clearedRevenueCents:null,
    clearedContributionCents:hasContribution?clearedContributionCents:null
  };
}

function stageAtLeast(stage,targets){
  return targets.includes(lower(stage));
}

export function compileUberReplyObservedLearning({
  campaignId='',
  prospects=[],
  messages=[],
  replies=[],
  orders=[],
  revenueEvents=[],
  outboundEvents=[],
  policy={}
}={}){
  const candidateMessages=arr(messages)
    .filter(message=>message?.uberReplyCandidateId&&message?.uberReplyGenotypeId&&message?.uberReplyRenderedMessageId)
    .filter(message=>!campaignId||String(message.campaignId||'')===String(campaignId));
  const prospectById=new Map(arr(prospects).map(row=>[row.id,row]));
  const replyByMessage=new Map();
  for(const reply of arr(replies)){
    if(reply?.sourceMessageId)replyByMessage.set(reply.sourceMessageId,reply);
  }
  const eventsByProspect=new Map();
  for(const event of arr(outboundEvents)){
    if(!event?.prospectId)continue;
    eventsByProspect.set(event.prospectId,[...(eventsByProspect.get(event.prospectId)||[]),event]);
  }
  const latestCandidateByProspect=new Map();
  for(const message of candidateMessages){
    const existing=latestCandidateByProspect.get(message.prospectId);
    const currentTime=ts(message.sentAt)||0;
    if(!existing||(ts(existing.sentAt)||0)<=currentTime)latestCandidateByProspect.set(message.prospectId,message);
  }

  const outcomes=candidateMessages.map(message=>{
    const prospect=prospectById.get(message.prospectId)||{};
    const reply=replyByMessage.get(message.id)||null;
    const events=eventsByProspect.get(message.prospectId)||[];
    const replyLabel=lower(reply?.classification?.label||reply?.label||'');
    const economics=latestCandidateByProspect.get(message.prospectId)?.id===message.id
      ? clearedEconomicEvidenceForProspect(message.prospectId,orders,revenueEvents)
      : {clearedRevenueCents:null,clearedContributionCents:null};
    const complaint=events.some(event=>['complaint','spam_complaint'].includes(lower(event.eventType)));
    const hardBounce=events.some(event=>['hard_bounce','bounce_hard'].includes(lower(event.eventType)));
    const unsubscribed=replyLabel==='optout'||replyLabel==='unsubscribe'||events.some(event=>['unsubscribe','suppression'].includes(lower(event.eventType)));
    const stage=prospect.opportunityStage;
    return compileUberOutboundOutcomeReceipt({
      decisionId:`uberreply:${message.id}`,
      genotypeId:message.uberReplyGenotypeId,
      renderedMessageId:message.uberReplyRenderedMessageId,
      experimentAssignment:{
        experimentId:`uberreply-v5:${campaignId||message.campaignId||'campaign'}:touch-${Number(message.followup||0)+1}`,
        primaryMetric:'QUALIFIED_POSITIVE_REPLY_THEN_CLEARED_CONTRIBUTION',
        treatmentDimension:'MESSAGE_CANDIDATE',
        unit:'ACCOUNT_OR_RECIPIENT_KEY',
        accountKey:message.prospectId,
        arm:message.uberReplyCandidateId,
        holdout:false,
        deterministic:true,
        treatmentAuthorityCreated:false
      },
      outcome:{
        deliveryAccepted:true,
        hardBounce,
        complaint,
        unsubscribed,
        replyClass:replyLabel||null,
        positiveReply:replyLabel==='positive'||replyLabel==='interested',
        qualifiedPositiveReply:reply?.qualifiedPositiveEvidence?.qualified===true,
        referral:replyLabel==='referral',
        meetingBooked:stageAtLeast(stage,['meeting','offer','invoice','paid','delivery','accepted','recurring']),
        meetingShowed:Boolean(prospect.meetingShowedAt),
        qualifiedOpportunity:stageAtLeast(stage,['opportunity','meeting','offer','invoice','paid','delivery','accepted','recurring']),
        proposal:stageAtLeast(stage,['offer','invoice','paid','delivery','accepted','recurring']),
        closedWon:stageAtLeast(stage,['paid','delivery','accepted','recurring']),
        retained:stageAtLeast(stage,['recurring']),
        expanded:Boolean(prospect.expandedAt),
        clearedRevenueCents:economics.clearedRevenueCents
      },
      economics:{
        clearedContributionCents:economics.clearedContributionCents,
        reputationDamageCents:null,
        complianceRiskCostCents:null,
        opportunityCostCents:null
      },
      observedAt:reply?.receivedAt||message.sentAt||new Date()
    });
  });

  const learningPacket=compileUberOutboundLearningPacket({
    outcomes,
    policy:{
      maxComplaintRate:num(policy.maxComplaintRate)??0.001,
      minSamplesPerArm:Math.max(1,Math.floor(num(policy.minSamplesPerArm)??100))
    }
  });

  return{
    version:UBERREPLY_LEARNING_LOOP_VERSION,
    campaignId:campaignId||null,
    treatmentCount:candidateMessages.length,
    outcomes,
    learningPacket,
    attributionMode:'EXACT_MESSAGE_FOR_REPLIES_LAST_TOUCH_OBSERVATIONAL_FOR_CLEARED_ECONOMICS',
    automaticWinner:null,
    automaticPromotionAuthorized:false,
    externalEffectAuthority:'NONE',
    businessEffectAuthority:'NONE',
    truthBoundary:'Replies are linked only through exact sourceMessageId when available. Cleared economics are last-touch observational and never treated as causal incrementality. Missing contribution/reputation/compliance/opportunity-cost terms remain unknown. Promotion requires independent causal analysis, validation traffic and guardrail survival.'
  };
}
