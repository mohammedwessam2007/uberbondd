export const PROSPECT_QUALIFICATION_GATE_VERSION = 'uberbond.prospect-qualification-gate.v1';

const REVIEW_STATUSES = new Set([
  'NEEDS_REVIEW',
  'NEEDS_VERIFICATION',
  'REVERIFY_REQUIRED',
  'DEFER_TEMPORARY_FAILURE'
]);

const BLOCKED_PREFIX = 'BLOCKED_';

function text(value, max = 240) {
  return String(value ?? '').trim().slice(0, max);
}

function unique(values, max = 40) {
  return [...new Set((Array.isArray(values) ? values : []).map(value => text(value, 160)).filter(Boolean))].slice(0, max);
}

function normalizeRoutes(bundle = {}) {
  return (Array.isArray(bundle?.routes) ? bundle.routes : []).map(route => ({
    route: text(route?.route, 320).toLowerCase(),
    status: text(route?.status, 80).toUpperCase(),
    usableForHandoff: route?.usableForHandoff === true,
    reasonCodes: unique(route?.reasonCodes, 20)
  }));
}

function normalizePeople(bundle = {}) {
  return (Array.isArray(bundle?.people) ? bundle.people : []).map(person => ({
    personId: text(person?.personId, 160),
    exactIdentity: person?.exactIdentity === true,
    inferred: person?.inferred === true,
    evidenceClass: text(person?.evidenceClass, 80).toUpperCase()
  }));
}

export function evaluateProspectQualification({
  score = {},
  evidenceBundle = {},
  requireContact = true,
  requireExactPerson = false,
  allowResearchOnly = false
} = {}) {
  const routes = normalizeRoutes(evidenceBundle);
  const people = normalizePeople(evidenceBundle);
  const conflicts = unique(evidenceBundle?.summary?.conflicts, 30);
  const scoreBlocks = unique(score?.blocks, 40);
  const blocks = [...scoreBlocks];
  const reasons = [];

  if (score?.eligible === false && !blocks.length) blocks.push('upstream-score-ineligible');

  const verifiedRoutes = routes.filter(route => route.status === 'VERIFIED_ROUTE' && route.usableForHandoff);
  const blockedRoutes = routes.filter(route => route.status.startsWith(BLOCKED_PREFIX));
  const reviewRoutes = routes.filter(route => REVIEW_STATUSES.has(route.status));

  if (requireContact) {
    if (blockedRoutes.length && !verifiedRoutes.length) blocks.push('contact-route-blocked');
    else if (reviewRoutes.length && !verifiedRoutes.length) blocks.push('contact-route-not-verified');
    else if (!verifiedRoutes.length) blocks.push('no-verified-contact-route');
  }

  if (requireExactPerson) {
    const exact = people.some(person => person.exactIdentity && !person.inferred);
    if (!exact) blocks.push('exact-person-identity-required');
  }

  if (conflicts.length) blocks.push('prospect-evidence-conflict');

  if (verifiedRoutes.length) reasons.push('at least one verified route is suitable for qualification handoff');
  if (reviewRoutes.length) reasons.push('one or more routes still require review or reverification');
  if (blockedRoutes.length) reasons.push('one or more routes are blocked by contact evidence');
  if (conflicts.length) reasons.push(`unresolved evidence conflicts: ${conflicts.join(', ')}`);

  const dedupedBlocks = unique(blocks, 50);
  const eligible = dedupedBlocks.length === 0;
  const tier = eligible ? 'COMMERCIAL_HANDOFF_READY' : allowResearchOnly ? 'RESEARCH_ONLY' : 'BLOCKED';

  return {
    version: PROSPECT_QUALIFICATION_GATE_VERSION,
    eligible,
    tier,
    blocks: dedupedBlocks,
    reasons,
    contact: {
      verifiedRoutes: verifiedRoutes.length,
      blockedRoutes: blockedRoutes.length,
      reviewRoutes: reviewRoutes.length,
      statuses: routes.map(route => route.status)
    },
    identity: {
      exactPeople: people.filter(person => person.exactIdentity && !person.inferred).length,
      inferredPeople: people.filter(person => person.inferred).length
    },
    evidenceConflicts: conflicts,
    businessEffectAuthority: 'NONE',
    externalEffects: 0,
    providerCalls: 0,
    note: 'Qualification readiness is advisory state only. Outreach still requires suppression, deliverability, authorization, and OMNIA V9 consequence gates.'
  };
}
