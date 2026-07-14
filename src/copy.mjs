export function routeInbox(prospect, audit=[]) {
  const hay = `${prospect.niche||''} ${prospect.company||''} ${audit.map(x=>`${x.title} ${x.service}`).join(' ')}`.toLowerCase();
  return /(medical|clinic|doctor|dent|health|research|scient|university|campus|pharma|hospital)/.test(hay) ? 'A' : 'B';
}
export function buildMessage({prospect, issue, contact, sender, followup=0, unsubscribeUrl=''}) {
  const first = contact?.firstName || prospect.contactName?.split(/\s+/)[0] || '';
  const greeting = first ? `Hi ${first},` : 'Hi there,';
  const evidence = issue?.evidenceExcerpt ? ` I found it on ${new URL(issue.evidenceUrl || prospect.website).pathname || 'the page'}: “${issue.evidenceExcerpt.slice(0,150)}”.` : '';
  const optout = unsubscribeUrl ? `\n\nStop future messages: ${unsubscribeUrl}` : '\n\nReply “no” and I will permanently close the record.';
  if (followup === 1) return `${greeting}\n\nOne extra thought on ${prospect.company}: ${issue.implication}\n\nI can send a compact before-and-after concept rather than a long proposal. Useful?${optout}\n\n${sender.name}\n${sender.company}\n${sender.address}`;
  if (followup === 2) return `${greeting}\n\nI’ll close the loop after this. If improving ${issue.service.toLowerCase()} is on the roadmap, I’m happy to send the specific concept I had in mind.${optout}\n\n${sender.name}\n${sender.company}\n${sender.address}`;
  return `${greeting}\n\nI noticed ${issue.title.toLowerCase()} on ${prospect.company}'s website.${evidence} ${issue.implication}\n\nI work on ${issue.service.toLowerCase()} for businesses in this space. I can send a concise three-point teardown showing what I would change, with no call required. Worth sending over?${optout}\n\n${sender.name}\n${sender.company}\n${sender.address}`;
}
export function buildSubject(prospect, issue, followup=0) {
  if (followup) return `Re: ${prospect.company} — ${issue.service.toLowerCase()}`;
  return `${prospect.company}: one ${issue.service.toLowerCase()} observation`;
}
