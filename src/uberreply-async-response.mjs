import {
  compileUberReplyAsyncCloseDecision,
  getUberReplyOffer
} from './uberreply-four-offer-genome.mjs';

export const UBERREPLY_ASYNC_RESPONSE_VERSION='uberbond.uberreply-async-response.v1';

const clean=(v,n=4000)=>String(v??'').trim().replace(/\s+/g,' ').slice(0,n);

const SCOPE_BY_OFFER=Object.freeze({
  LEAD_TO_BOOKING_LEAK_AUDIT:Object.freeze({
    turnaround:'72 hours after required URLs/access are supplied',
    scope:'3 client sites, one highest-value lead journey per site, evidence screenshots, severity/confidence, and repair order',
    acceptance:'promised journeys tested and every reported finding linked to reproducible evidence'
  }),
  AI_AGENT_RELEASE_GATE:Object.freeze({
    turnaround:'agreed sprint window after authorized workflow access and test inputs are supplied',
    scope:'one authorized workflow, 40–60 representative cases, tool-call checks, edge/adversarial cases, failure taxonomy, release verdict, and one post-fix retest',
    acceptance:'agreed case count executed and every PASS / CONDITIONAL PASS / FAIL verdict linked to evidence'
  }),
  CLIENT_ROI_PROOF_SPRINT:Object.freeze({
    turnaround:'agreed sprint window after authorized source exports/access are supplied',
    scope:'one client, up to 3 authorized source systems, reconciliation table, discrepancy map, proven/probable/unknown ledger, and renewal-ready evidence pack',
    acceptance:'all stated claims trace to source evidence and discrepancies are reproducible'
  }),
  BILINGUAL_BOOKING_LEAK_AUDIT:Object.freeze({
    turnaround:'agreed sprint window after the target location and booking journey are confirmed',
    scope:'one location, Arabic + English booking journey, mobile-first and desktop confirmation, paired evidence, parity matrix, and repair order',
    acceptance:'every reported parity break is reproducible and Arabic/English evidence is paired'
  })
});


export function classifyUberReplyState({ classification={}, body='' }={}){
  const label=clean(classification?.label||classification,120).toLowerCase();
  const text=clean(body,8000).toLowerCase();
  if(['negative','optout','unsubscribe'].includes(label)) return 'NO';
  if(['automatic','out_of_office'].includes(label)) return 'AUTO_REPLY';
  if(label==='wrong_person'||label==='referral') return 'WRONG_PERSON';
  if(/\b(not now|later|next month|next quarter)\b/.test(text)) return 'NOT_NOW';
  if(/\b(price|pricing|cost|how much)\b/.test(text)) return 'PRICE';
  if(/\b(call|zoom|meet|meeting)\b/.test(text)) return 'CALL';
  if(label==='positive'||label==='interested') return 'YES';
  return 'UNKNOWN';
}

function artifactSummary(artifact={}){
  const findings=Array.isArray(artifact?.findings)?artifact.findings.slice(0,3):[];
  if(!findings.length)return'';
  return findings.map((row,index)=>`${index+1}. ${clean(row.title,240)}${row.evidenceExcerpt?` — evidence: “${clean(row.evidenceExcerpt,220)}”`:''}`).join('\n');
}


export function classifyUberReplyQualification({ classification={}, body='', replyState }={}){
  const label=clean(classification?.label||classification,120).toLowerCase();
  const state=String(replyState||classifyUberReplyState({classification,body})).toUpperCase();
  const text=clean(body,8000).toLowerCase();
  if(['NO','AUTO_REPLY','WRONG_PERSON','NOT_NOW','UNKNOWN'].includes(state)){
    return{qualified:false,state:'NOT_QUALIFIED',reasonCodes:[`reply-state-${state.toLowerCase()}`]};
  }
  const signals=[];
  if(/\b(price|pricing|cost|how much|budget)\b/.test(text))signals.push('commercial-price-question');
  if(/\b(scope|included|what do you include|deliverables?)\b/.test(text))signals.push('commercial-scope-question');
  if(/\b(timeline|turnaround|how long|when can|start date|availability)\b/.test(text))signals.push('commercial-timing-question');
  if(/\b(invoice|payment|pay|checkout|purchase|buy)\b/.test(text))signals.push('commercial-payment-intent');
  if(/\b(proposal|contract|agreement|statement of work|sow)\b/.test(text))signals.push('commercial-proposal-intent');
  if(/\b(move ahead|move forward|proceed|go ahead|let'?s do it|we need this|can you fix|can you handle|can you do)\b/.test(text))signals.push('explicit-project-intent');
  if(state==='CALL'&&['positive','interested','neutral','objection'].includes(label))signals.push('buyer-requested-conversation');
  return{
    qualified:signals.length>0,
    state:signals.length?'QUALIFIED_POSITIVE_EVIDENCE':'POSITIVE_NOT_YET_QUALIFIED',
    reasonCodes:signals,
    truthBoundary:'Qualification requires explicit commercial/project intent in the reply. Generic positivity or permission to send an artifact is not automatically treated as a qualified opportunity.'
  };
}

export function compileUberReplyAsyncResponseDraft({
  offerId,
  replyState,
  qualification={},
  artifact=null,
  senderName='Mohamed'
}={}){
  const offer=getUberReplyOffer(offerId);
  if(!offer)return{
    ok:false,
    state:'UNKNOWN_OFFER',
    reasonCodes:['known-offer-required'],
    draft:'',
    externalEffectAuthority:'NONE',
    businessEffectAuthority:'NONE'
  };
  const decision=compileUberReplyAsyncCloseDecision({offerId:offer.offerId,replyState,qualification});
  const scope=SCOPE_BY_OFFER[offer.offerId];
  const name=clean(senderName,120)||'Mohamed';
  let draft='';

  if(decision.state==='SUPPRESS_AND_STOP'){
    draft='';
  }else if(decision.state==='ASK_FOR_OWNER_OF_PROBLEM'){
    draft='Thanks. Who owns this workflow/problem on your side? I’ll keep it concise.';
  }else if(decision.state==='CLOSE_LOOP_OR_DEFER'){
    draft='Understood. I’ll close the loop here. If this becomes a priority later, happy to send the evidence then.';
  }else if(decision.state==='SEND_ARTIFACT_THEN_OFFER_ASYNC_SCOPE'){
    const summary=artifactSummary(artifact);
    draft=[
      'Absolutely. Here’s the evidence I mapped:',
      summary,
      `If useful, I can send the exact ${offer.publicName} scope, turnaround, and fixed price here. No call needed unless you’d prefer one.`,
      name
    ].filter(Boolean).join('\n\n');
  }else if(decision.state==='SEND_FIXED_PRICE_AND_SCOPE'){
    draft=[
      `${offer.publicName}: $${decision.priceUsd.toLocaleString('en-US')} fixed.`,
      `Scope: ${scope.scope}.`,
      `Turnaround: ${scope.turnaround}.`,
      `Acceptance: ${scope.acceptance}.`,
      'If that works, I can send the payment/onboarding step here. No call needed unless you’d prefer one.',
      name
    ].join('\n\n');
  }else if(decision.state==='BUYER_REQUESTED_CALL'){
    draft=[
      'Happy to.',
      'If easier, I can send the exact scope and fixed price here first so the call is optional. If you still prefer a call after that, that works too.',
      name
    ].join('\n\n');
  }

  return{
    ok:true,
    version:UBERREPLY_ASYNC_RESPONSE_VERSION,
    offerId:offer.offerId,
    publicName:offer.publicName,
    decision,
    draft,
    draftReady:Boolean(draft),
    automaticSendAuthorized:false,
    externalEffectAuthority:'NONE',
    businessEffectAuthority:'NONE',
    truthBoundary:'This compiles a truthful founder-review draft from the reply state, current offer object, and supplied artifact. It never sends, schedules, charges, or represents a payment as completed.'
  };
}
