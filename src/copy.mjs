export function routeInbox(prospect, audit=[]) {
  const hay = `${prospect.niche||''} ${prospect.company||''} ${audit.map(x=>`${x.title} ${x.service}`).join(' ')}`.toLowerCase();
  return /(medical|clinic|doctor|dent|health|research|scient|university|campus|pharma|hospital)/.test(hay) ? 'A' : 'B';
}
export function buildMessage({prospect, issue, contact, sender, offerName='', followup=0, unsubscribeUrl=''}) {
  const first = contact?.firstName || prospect.contactName?.split(/\s+/)[0] || '';
  const greeting = first ? `Hi ${first},` : 'Hi there,';
  const evidence = issue?.evidenceExcerpt ? ` I found it on ${new URL(issue.evidenceUrl || prospect.website).pathname || 'the page'}: “${issue.evidenceExcerpt.slice(0,150)}”.` : '';
  const optout = unsubscribeUrl ? `\n\nStop future messages: ${unsubscribeUrl}` : '\n\nReply “no” and I will permanently close the record.';
  if (followup === 1) return `${greeting}\n\nOne extra thought on ${prospect.company}: ${issue.implication}\n\nI can send a compact before-and-after concept rather than a long proposal. Useful?${optout}\n\n${sender.name}\n${sender.company}\n${sender.address}`;
  if (followup === 2) return `${greeting}\n\nI’ll close the loop after this. If improving ${issue.service.toLowerCase()} is on the roadmap, I’m happy to send the specific concept I had in mind.${optout}\n\n${sender.name}\n${sender.company}\n${sender.address}`;
  const offerLine = offerName
    ? `I can send a concise, evidence-backed ${offerName.toLowerCase()} outline with no call required.`
    : 'I can send a concise three-point teardown showing what I would change, with no call required.';
  return `${greeting}\n\nI noticed ${issue.title.toLowerCase()} on ${prospect.company}'s website.${evidence} ${issue.implication}\n\nI work on ${issue.service.toLowerCase()} for businesses in this space. ${offerLine} Worth sending over?${optout}\n\n${sender.name}\n${sender.company}\n${sender.address}`;
}
export function buildSubject(prospect, issue, followup=0, offerName='') {
  if (followup) return `Re: ${prospect.company} — ${issue.service.toLowerCase()}`;
  if (offerName) return `${issue.service} observation`;
  return `${prospect.company}: one ${issue.service.toLowerCase()} observation`;
}


const V5_SUBJECTS = Object.freeze({
  LEAD_TO_BOOKING_LEAK_AUDIT: 'lead handoff',
  AI_AGENT_RELEASE_GATE: 'agent release gate',
  CLIENT_ROI_PROOF_SPRINT: 'revenue proof gap',
  BILINGUAL_BOOKING_LEAK_AUDIT: 'booking parity'
});

const cleanCopy = (v,n=1000) => String(v??'').trim().replace(/\s+/g,' ').slice(0,n);
const sentence = v => {
  const x=cleanCopy(v,600).replace(/[.!?]+$/,'');
  return x?x+'.':'';
};

export function buildUberReplyV5Subject({ offerId='', prospect={}, issue={}, followup=0 }={}) {
  if (followup && prospect?.subject) return String(prospect.subject).trim();
  const fixed=V5_SUBJECTS[String(offerId||'').toUpperCase()];
  if (fixed) return fixed;
  const raw=cleanCopy(issue?.service||issue?.category||'workflow gap',80).toLowerCase().split(/\s+/).filter(Boolean).slice(0,5);
  return raw.length>=2?raw.join(' '):'workflow gap';
}

export function buildUberReplyV5Message({
  offerId='',
  prospect={},
  issue={},
  audit=[],
  contact={},
  sender={},
  artifact=null,
  followup=0,
  unsubscribeUrl=''
}={}) {
  const first=cleanCopy(contact?.firstName||prospect?.contactName?.split(/\s+/)[0]||'',80);
  const greeting=first?`Hi ${first},`:'Hi there,';
  const company=cleanCopy(prospect?.company||'your team',160);
  const findings=Array.isArray(artifact?.findings)&&artifact.findings.length
    ? artifact.findings
    : [issue,...(Array.isArray(audit)?audit:[])].filter(Boolean);
  const finding=followup>0 ? findings[followup] : findings[0];
  const optout=unsubscribeUrl?`\n\nStop future messages: ${unsubscribeUrl}`:'\n\nReply “no” and I will permanently close the record.';
  const signature=`\n\n${cleanCopy(sender?.name,120)}\n${cleanCopy(sender?.company,120)}\n${cleanCopy(sender?.address,300)}`;

  if (followup>0 && !finding) return '';

  const title=cleanCopy(finding?.title||issue?.title||'a workflow gap',240).toLowerCase();
  const evidence=cleanCopy(finding?.evidenceExcerpt||issue?.evidenceExcerpt||'',240);
  const implication=cleanCopy(finding?.implication||issue?.implication||'',300);
  const artifactLabel=cleanCopy(artifact?.publicLabel||'one-page evidence map',160);

  if (followup>0) {
    const observation=sentence(`I found one more thing at ${company}: ${title}`);
    const proof=evidence?sentence(`The current page shows “${evidence}”`):'';
    const offer=sentence(`I added it to the ${artifactLabel}`);
    return [greeting,'',observation,proof,offer,'Want me to send it?'].filter(Boolean).join('\n\n')+optout+signature;
  }

  const observed=sentence(`I checked ${company} and found ${title}`);
  const effect=implication?sentence(`That can mean ${implication.charAt(0).toLowerCase()+implication.slice(1)}`):sentence('That creates a visible handoff or decision gap worth checking');
  const work=sentence(`I mapped the evidence into a ${artifactLabel} with the supporting evidence and repair order`);
  return [greeting,'',observed,effect,work,'Want me to send it?'].join('\n\n')+optout+signature;
}
