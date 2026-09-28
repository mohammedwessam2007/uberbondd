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
  const ledgerRows=arr(revenueEvents).filter(row=>row?.prospectId===prospectId);
  const rows=ledgerRows.length
    ? ledgerRows.filter(row=>['sale','refund'].includes(lower(row.kind))||/(paid|settled|cleared|completed|refund)/.test(lower(row.status||row.eventName)))
    : arr(orders).filter(row=>row?.prospectId===prospectId&&/(paid|settled|cleared|completed)/.test(lower(row.status||row.eventName)));
  const seen=new Set();
  let clearedRevenueCents=0;
  let clearedContributionCents=0;
  let hasRevenue=false;
  let hasContribution=false;
  let observedAt=null;
  for(const row of rows){
    const key=String(row.providerEventId||row.eventId||row.providerReferenceId||row.id||'').trim();
    if(key&&seen.has(key))continue;
    if(key)seen.add(key);
    let amount=num(row.amountCents??row.clearedRevenueCents);
    if(amount!=null){
      if(lower(row.kind)==='refund'&&amount>0)amount=-amount;
      clearedRevenueCents+=amount;
      hasRevenue=true;
    }
    const rowTime=ts(row.createdAt||row.observedAt||row.timestamp||row.paidAt);
    if(rowTime!=null&&(observedAt==null||rowTime<observedAt))observedAt=rowTime;
    let contribution=num(row.clearedContributionCents??row.contributionCents);
    if(contribution!=null){
      if(lower(row.kind)==='refund'&&contribution>0)contribution=-contribution;
      clearedContributionCents+=contribution;
      hasContribution=true;
    }
  }
  return{
    clearedRevenueCents:hasRevenue?clearedRevenueCents:null,
    clearedContributionCents:hasContribution?clearedContributionCents:null,
    observedAt,
    source:ledgerRows.length?'VERIFIED_REVENUE_LEDGER':'SETTLED_ORDER_FALLBACK'
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
  const repliesByMessage=new Map();
  for(const reply of arr(replies)){
    if(!reply?.sourceMessageId)continue;
    repliesByMessage.set(reply.sourceMessageId,[...(repliesByMessage.get(reply.sourceMessageId)||[]),reply]);
  }
  const eventsByMessage=new Map();
  const legacyEventsByProspect=new Map();
  for(const event of arr(outboundEvents)){
    const sourceMessageId=event?.detail?.sourceMessageId||event?.sourceMessageId||'';
    if(sourceMessageId){
      eventsByMessage.set(sourceMessageId,[...(eventsByMessage.get(sourceMessageId)||[]),event]);
      continue;
    }
    if(!event?.prospectId)continue;
    legacyEventsByProspect.set(event.prospectId,[...(legacyEventsByProspect.get(event.prospectId)||[]),event]);
  }
  const latestCandidateByProspect=new Map();
  for(const message of candidateMessages){
    const existing=latestCandidateByProspect.get(message.prospectId);
    const currentTime=ts(message.sentAt)||0;
    if(!existing||(ts(existing.sentAt)||0)<=currentTime)latestCandidateByProspect.set(message.prospectId,message);
  }
  const economicsByProspect=new Map();
  const economicsMessageByProspect=new Map();
  for(const prospectId of latestCandidateByProspect.keys()){
    const evidence=clearedEconomicEvidenceForProspect(prospectId,orders,revenueEvents);
    economicsByProspect.set(prospectId,evidence);
    if(evidence.clearedRevenueCents==null&&evidence.clearedContributionCents==null)continue;
    const eligible=candidateMessages
      .filter(message=>message.prospectId===prospectId)
      .filter(message=>evidence.observedAt==null||(ts(message.sentAt)!=null&&ts(message.sentAt)<=evidence.observedAt))
      .sort((a,b)=>(ts(a.sentAt)||0)-(ts(b.sentAt)||0));
    const attributed=eligible.at(-1)||(evidence.observedAt==null?latestCandidateByProspect.get(prospectId):null);
    if(attributed)economicsMessageByProspect.set(prospectId,attributed.id);
  }

  const outcomes=candidateMessages.map(message=>{
    const prospect=prospectById.get(message.prospectId)||{};
    const messageReplies=repliesByMessage.get(message.id)||[];
    const reply=messageReplies.at(-1)||null;
    const events=eventsByMessage.get(message.id)||(
      latestCandidateByProspect.get(message.prospectId)?.id===message.id
        ? (legacyEventsByProspect.get(message.prospectId)||[])
        : []
    );
    const replyLabels=messageReplies.map(row=>lower(row?.classification?.label||row?.label||'')).filter(Boolean);
    const replyLabel=replyLabels.at(-1)||'';
    const positiveReply=replyLabels.some(label=>label==='positive'||label==='interested');
    const qualifiedPositiveReply=messageReplies.some(row=>row?.qualifiedPositiveEvidence?.qualified===true);
    const referral=replyLabels.includes('referral');
    const economics=economicsMessageByProspect.get(message.prospectId)===message.id
      ? (economicsByProspect.get(message.prospectId)||{clearedRevenueCents:null,clearedContributionCents:null})
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
        treatmentDimension:message?.uberReplyStrategyAtoms?.controlledDimension||'MESSAGE_STRATEGY_ARM',
        unit:'ACCOUNT_OR_RECIPIENT_KEY',
        accountKey:message.prospectId,
        arm:message.uberReplyStrategyArmId||message.uberReplyGenotypeId,
        exactCandidateId:message.uberReplyCandidateId,
        strategyArmId:message.uberReplyStrategyArmId||null,
        assignmentMode:message.uberReplyAssignmentMode||null,
        assignmentProbability:num(message.uberReplyAssignmentProbability),
        holdout:false,
        deterministic:true,
        treatmentAuthorityCreated:false
      },
      outcome:{
        deliveryAccepted:!hardBounce,
        hardBounce,
        complaint,
        unsubscribed,
        replyClass:replyLabel||null,
        positiveReply,
        qualifiedPositiveReply,
        referral,
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
      observedAt:messageReplies.map(row=>row?.receivedAt).filter(Boolean).sort().at(0)||message.sentAt||new Date()
    });
  });

  const analyzableOutcomes=outcomes.filter(row=>row?.delivery?.accepted===true&&row?.delivery?.hardBounce!==true);
  const learningPacket=compileUberOutboundLearningPacket({
    outcomes:analyzableOutcomes,
    policy:{
      maxComplaintRate:num(policy.maxComplaintRate)??0.001,
      minSamplesPerArm:Math.max(1,Math.floor(num(policy.minSamplesPerArm)??100))
    }
  });
  const firstTouchMessages=candidateMessages.filter(message=>Number(message.followup||0)===0);
  const firstTouchIds=new Set(firstTouchMessages.map(message=>message.id));
  const firstTouchOutcomes=outcomes.filter(row=>firstTouchIds.has(String(row.decisionId||'').replace(/^uberreply:/,'')));
  const humanReplyLabels=new Set(['positive','interested','neutral','objection','negative','wrong_person','referral','optout','unsubscribe']);
  const uniqueDeliveredProspects=new Set(firstTouchMessages.filter(message=>{
    const outcome=firstTouchOutcomes.find(row=>row.decisionId===`uberreply:${message.id}`);
    return outcome?.delivery?.accepted===true&&!outcome?.delivery?.hardBounce;
  }).map(message=>message.prospectId).filter(Boolean));
  const exactReplies=arr(replies).filter(reply=>reply?.sourceMessageId);
  const humanReplyProspects=new Set(exactReplies.filter(reply=>humanReplyLabels.has(lower(reply?.classification?.label||reply?.label))).map(reply=>reply.prospectId).filter(Boolean));
  const positiveReplyProspects=new Set(exactReplies.filter(reply=>['positive','interested'].includes(lower(reply?.classification?.label||reply?.label))).map(reply=>reply.prospectId).filter(Boolean));
  const qualifiedPositiveProspects=new Set(exactReplies.filter(reply=>reply?.qualifiedPositiveEvidence?.qualified===true).map(reply=>reply.prospectId).filter(Boolean));

  return{
    version:UBERREPLY_LEARNING_LOOP_VERSION,
    campaignId:campaignId||null,
    treatmentCount:candidateMessages.length,
    outcomes,
    analyzableTreatmentCount:analyzableOutcomes.length,
    deliveryAccounting:{
      providerAcceptedTreatmentCount:outcomes.filter(row=>row?.delivery?.accepted===true||row?.delivery?.hardBounce===true).length,
      hardBounceTreatmentCount:outcomes.filter(row=>row?.delivery?.hardBounce===true).length,
      analyzableDeliveredTreatmentCount:analyzableOutcomes.length
    },
    recordAttempt:{
      firstTouchCount:firstTouchMessages.length,
      deliveredUniqueProspects:uniqueDeliveredProspects.size,
      humanReplyUniqueProspects:[...humanReplyProspects].filter(id=>uniqueDeliveredProspects.has(id)).length,
      positiveReplyUniqueProspects:[...positiveReplyProspects].filter(id=>uniqueDeliveredProspects.has(id)).length,
      qualifiedPositiveReplyUniqueProspects:[...qualifiedPositiveProspects].filter(id=>uniqueDeliveredProspects.has(id)).length,
      denominatorPolicy:'UNIQUE_DELIVERED_PROSPECTS; AUTO_REPLY_OOO_BOUNCE_EXCLUDED_FROM_HUMAN_REPLY',
      cohortTruthRequirement:'Before any record-attempt claim, separately prove the cohort is eligible and truly cold; this compiler does not infer that status from a sent-message row.'
    },
    learningPacket,
    attributionMode:'EXACT_MESSAGE_FOR_REPLIES_STABLE_STRATEGY_ARM_FOR_EXPERIMENTS_LAST_TOUCH_OBSERVATIONAL_FOR_CLEARED_ECONOMICS',
    automaticWinner:null,
    automaticPromotionAuthorized:false,
    externalEffectAuthority:'NONE',
    businessEffectAuthority:'NONE',
    truthBoundary:'Replies are linked only through exact sourceMessageId when available. Copy experiments aggregate by stable strategy arm while exact candidate, genotype and rendered-message receipts remain preserved. Hard bounces are excluded from the delivered-analysis denominator. Cleared economics prefer the verified revenue ledger and fall back to settled orders without double-counting both; economics attach only to the latest observed treatment at or before the first economic receipt when timestamps permit, and remain observational rather than causal incrementality. Missing contribution/reputation/compliance/opportunity-cost terms remain unknown. Promotion requires independent causal analysis, validation traffic and guardrail survival.'
  };
}
