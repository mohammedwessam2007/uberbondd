export const UBERREPLY_TAXONOMY_VERSION='uberbond.uberreply-taxonomy.v1';
export const UBERREPLY_LABELS=Object.freeze(['optout','positive','negative','objection','referral','wrong_person','out_of_office','automatic','neutral']);
const clean=(v,n=10000)=>String(v??'').trim().slice(0,n);
function result(label,confidence,reason,extra={}){
  const stop=!['automatic','out_of_office','neutral'].includes(label);
  const pause=['automatic','out_of_office'].includes(label);
  return Object.freeze({
    version:UBERREPLY_TAXONOMY_VERSION,label,confidence,reason,
    sequenceAction:pause?'PAUSE':stop?'STOP':'REVIEW',
    suppressionRecommended:['optout','negative'].includes(label),
    opportunitySignal:label==='positive',
    ownerActionRequired:['positive','objection','referral','wrong_person','neutral'].includes(label),
    ...extra
  });
}
export function classifyUberReply(input=''){
  const text=clean(typeof input==='string'?input:input?.body||input?.text||'').toLowerCase();
  if(!text)return result('neutral',0.1,'Empty or unavailable reply body');
  if(/\b(unsubscribe|remove me|take me off|stop emailing|stop contacting|do not contact|don't contact|no more emails)\b/.test(text))return result('optout',0.99,'Explicit opt-out language');
  if(/\b(out of office|out of the office|automatic reply|auto[- ]?reply|vacation reply|away from (the )?office|on leave|annual leave|returning on|back in the office)\b/.test(text))return result('out_of_office',0.96,'Out-of-office or automatic absence language');
  if(/\b(wrong person|not the right person|you have the wrong|no longer work|doesn't work here|does not work here|left the company|not responsible for)\b/.test(text))return result('wrong_person',0.94,'Recipient says the route/person is wrong');
  if(/\b(reach out to|contact|speak (with|to)|email)\s+[a-z][a-z .'-]{1,60}\b.*\b(instead|for this|about this)\b/.test(text)||/\b(cc'?ing|looping in|introducing)\b/.test(text))return result('referral',0.82,'Recipient redirects to another person');
  if(/\b(too expensive|not in (the )?budget|already (have|using|work with)|we use|not a priority|bad timing|not now|send (me )?more (details|information)|how (does|would) this work|what does this cost|price|pricing)\b/.test(text))return result('objection',0.8,'Commercial question or objection needs a contextual response');
  if(/\b(yes|interested|sounds good|send it|send (me )?(the )?(details|outline|info|information)|tell me more|let'?s talk|book|schedule|call me|meeting|proposal|how do we start|next steps)\b/.test(text))return result('positive',0.84,'Positive buying/conversation intent');
  if(/\b(no thanks|not interested|not relevant|pass for now|we'?re good|we are good|not a fit)\b/.test(text))return result('negative',0.92,'Clear negative response without a separate opt-out phrase');
  if(/\b(delivery status notification|undeliverable|mailer-daemon|postmaster|message delayed|automated message|automated response)\b/.test(text))return result('automatic',0.92,'Automated non-human response');
  return result('neutral',0.45,'No deterministic high-confidence class matched');
}
export function normalizeAiReplyClassification(raw={}){
  const label=String(raw?.label||'neutral').trim().toLowerCase().replaceAll('-','_').replaceAll(' ','_');
  const normalized=UBERREPLY_LABELS.includes(label)?label:'neutral';
  const confidence=Number.isFinite(Number(raw?.confidence))?Math.max(0,Math.min(1,Number(raw.confidence))):0.3;
  return result(normalized,confidence,String(raw?.reason||'AI classification'),{source:'ai'});
}
