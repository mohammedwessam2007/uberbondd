// Sovereign relationship opportunity graph.
// Relationship quality is not a lead score: trust, reciprocity and consent remain first-class.
export const RELATIONSHIP_OPPORTUNITY_GRAPH_VERSION = 'uberbond.relationship-opportunity-graph.v1';

const clamp = n => Math.min(1, Math.max(0, Number(n) || 0));
const text = (v, max = 500) => {
  const s = String(v ?? '').trim();
  return s && s.length <= max ? s : null;
};
const list = v => Array.isArray(v) ? v : [];
const uniq = v => [...new Set(list(v).map(x => text(x)).filter(Boolean))];
const envelope = extra => ({ businessEffectAuthority: 'NONE', externalEffectAuthority: 'NONE', ...extra });

export function contactNode(input = {}) {
  const id = text(input.id);
  if (!id) return envelope({ ok: false, status: 'CONTACT_INVALID', reasonCodes: ['id-required'] });
  return envelope({
    ok: true,
    status: 'CONTACT_READY',
    contact: {
      id,
      displayName: text(input.displayName),
      domains: uniq(input.domains).sort(),
      capabilities: uniq(input.capabilities).sort(),
      goals: uniq(input.goals).sort(),
      consentToContact: input.consentToContact === true,
      trust: clamp(input.trust),
      reciprocity: clamp(input.reciprocity),
      lastMeaningfulInteractionAt: text(input.lastMeaningfulInteractionAt, 80),
      evidenceRefs: uniq(input.evidenceRefs).sort(),
      privateNotes: input.privateNotes === true
    }
  });
}

export function relationshipEdge(input = {}) {
  const from = text(input.from);
  const to = text(input.to);
  if (!from || !to || from === to) return envelope({ ok: false, status: 'RELATIONSHIP_EDGE_INVALID', reasonCodes: ['distinct-endpoints-required'] });
  return envelope({
    ok: true,
    status: 'RELATIONSHIP_EDGE_READY',
    edge: {
      from, to,
      strength: clamp(input.strength),
      trust: clamp(input.trust),
      reciprocity: clamp(input.reciprocity),
      contexts: uniq(input.contexts).sort(),
      evidenceRefs: uniq(input.evidenceRefs).sort()
    }
  });
}

export function bridgeCandidates({ contacts = [], edges = [], targetDomains = [] } = {}) {
  const nodes = contacts.map(contactNode).filter(x => x.ok).map(x => x.contact);
  const target = new Set(targetDomains.map(v => text(v)).filter(Boolean));
  const degree = new Map(nodes.map(n => [n.id, 0]));
  for (const edge of edges.map(relationshipEdge).filter(x => x.ok).map(x => x.edge)) {
    degree.set(edge.from, (degree.get(edge.from) || 0) + 1);
    degree.set(edge.to, (degree.get(edge.to) || 0) + 1);
  }
  const ranked = nodes.map(n => {
    const domainFit = target.size ? n.domains.filter(d => target.has(d)).length / target.size : 0.5;
    const lowRedundancy = 1 / (1 + (degree.get(n.id) || 0));
    const relationshipQuality = (n.trust + n.reciprocity) / 2;
    const score = 0.45 * domainFit + 0.25 * lowRedundancy + 0.30 * relationshipQuality;
    return { id: n.id, score, domainFit, lowRedundancy, relationshipQuality };
  }).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  return envelope({ ok: true, status: 'BRIDGE_CANDIDATES_READY', candidates: ranked });
}

export function mentorApprenticeshipCandidates({ contacts = [], capabilityGaps = [] } = {}) {
  const gaps = new Set(capabilityGaps.map(x => text(x.capability ?? x)).filter(Boolean));
  const ranked = contacts.map(contactNode).filter(x => x.ok).map(x => x.contact).map(c => {
    const overlap = c.capabilities.filter(x => gaps.has(x));
    const fit = gaps.size ? overlap.length / gaps.size : 0;
    const score = 0.55 * fit + 0.25 * c.trust + 0.20 * c.reciprocity;
    return { id: c.id, score, matchingCapabilities: overlap };
  }).filter(x => x.matchingCapabilities.length).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  return envelope({ ok: true, status: 'MENTOR_CANDIDATES_READY', candidates: ranked });
}

export function proposeRelationshipAction({ contact = {}, purpose, channel = 'UNKNOWN' } = {}) {
  const built = contactNode(contact);
  if (!built.ok) return built;
  const why = text(purpose, 800);
  if (!why) return envelope({ ok: false, status: 'RELATIONSHIP_ACTION_INVALID', reasonCodes: ['purpose-required'] });
  return envelope({
    ok: true,
    status: built.contact.consentToContact ? 'RELATIONSHIP_ACTION_DRAFT_READY' : 'RELATIONSHIP_ACTION_OWNER_REVIEW_REQUIRED',
    proposal: { contactId: built.contact.id, purpose: why, channel: text(channel, 80), manipulativeOptimization: false },
    requiresOwnerApproval: true,
    note: 'The graph can recommend contact. It never acquires authority to message a person.'
  });
}
