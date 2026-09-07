// Universal Ignorance Map + Unknown-Unknown probe miner.
//
// A true unknown-unknown cannot be certified after the fact by a function that
// already has it in its input. This module therefore never claims to have
// "found the unknown unknown." It maps visible ignorance and generates bounded
// probes aimed at the edges of the current representation, where omitted
// questions are most likely to become discoverable.
export const UNIVERSAL_IGNORANCE_MAP_VERSION = 'uberbond.universal-ignorance-map.v1';

const text = (value, max = 600) => {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
};
const uniq = values => [...new Set((values || []).filter(Boolean))];
const fail = (reasonCodes, extra = {}) => ({
  ok: false,
  status: 'IGNORANCE_MAP_REFUSED',
  reasonCodes: uniq(reasonCodes),
  businessEffectAuthority: 'NONE',
  ...extra
});

function normalizeEvidence(rows = []) {
  return (Array.isArray(rows) ? rows : []).map((row, index) => ({
    id: text(row?.id, 160) || `evidence-${index + 1}`,
    lineage: text(row?.lineage, 240),
    domain: text(row?.domain, 160),
    direction: text(row?.direction, 40)?.toUpperCase() || 'UNKNOWN',
    counterevidenceSearched: row?.counterevidenceSearched === true
  }));
}

/**
 * Map what the current decision representation admits it does not know.
 */
export function buildIgnoranceMap({
  question,
  assumptions = [],
  knownUnknowns = [],
  evidence = [],
  representedDomains = [],
  expectedDomains = [],
  optionFamilies = [],
  expectedOptionFamilies = [],
  contradictions = []
} = {}) {
  const q = text(question, 1000);
  if (!q) return fail(['question-required']);
  const assumptionRows = (Array.isArray(assumptions) ? assumptions : []).map((row, index) => ({
    id: text(row?.id, 160) || `assumption-${index + 1}`,
    claim: text(row?.claim || row, 600),
    tested: row?.tested === true,
    falsifier: text(row?.falsifier, 600)
  })).filter(row => row.claim);
  const unknownRows = uniq((Array.isArray(knownUnknowns) ? knownUnknowns : []).map(item => text(item, 600)));
  const evidenceRows = normalizeEvidence(evidence);
  const represented = new Set(uniq((Array.isArray(representedDomains) ? representedDomains : []).map(item => text(item, 160))));
  const expected = uniq((Array.isArray(expectedDomains) ? expectedDomains : []).map(item => text(item, 160)));
  const presentFamilies = new Set(uniq((Array.isArray(optionFamilies) ? optionFamilies : []).map(item => text(item, 160)?.toUpperCase())));
  const expectedFamilies = uniq((Array.isArray(expectedOptionFamilies) ? expectedOptionFamilies : []).map(item => text(item, 160)?.toUpperCase()));
  const contradictionRows = (Array.isArray(contradictions) ? contradictions : []).map(item => text(item, 600)).filter(Boolean);

  const lineageSet = new Set(evidenceRows.map(row => row.lineage).filter(Boolean));
  const support = evidenceRows.filter(row => row.direction === 'SUPPORTS');
  const oppose = evidenceRows.filter(row => row.direction === 'OPPOSES');
  const entries = [];

  for (const row of assumptionRows) {
    if (!row.tested) entries.push({
      class: 'ASSUMPTION_EXPOSED',
      ref: row.id,
      detail: row.claim,
      nextProbe: row.falsifier || `What observation would make us reject the assumption: ${row.claim}?`
    });
  }
  for (const unknown of unknownRows) entries.push({
    class: 'KNOWN_UNKNOWN',
    detail: unknown,
    nextProbe: `What is the cheapest reality contact that would reduce uncertainty about: ${unknown}?`
  });
  for (const domain of expected) if (!represented.has(domain)) entries.push({
    class: 'COVERAGE_GAP',
    detail: `Expected domain is not represented: ${domain}`,
    nextProbe: `What would a knowledgeable observer from the ${domain} domain ask that this representation currently cannot express?`
  });
  for (const family of expectedFamilies) if (!presentFamilies.has(family)) entries.push({
    class: 'OPTION_SPACE_GAP',
    detail: `Expected option family absent: ${family}`,
    nextProbe: `Generate one materially distinct ${family} option without renaming an existing mechanism.`
  });
  if (evidenceRows.length && lineageSet.size <= 1) entries.push({
    class: 'EVIDENCE_ANCESTRY_GAP',
    detail: 'All supplied evidence resolves to one known lineage or no declared independent lineage.',
    nextProbe: 'What independently generated evidence could most strongly contradict the current conclusion?'
  });
  if (support.length && !support.some(row => row.counterevidenceSearched)) entries.push({
    class: 'COUNTEREVIDENCE_GAP',
    detail: 'Supporting evidence is present without a declared counterevidence search.',
    nextProbe: 'Search specifically for the strongest credible disconfirming evidence, not more support.'
  });
  if (support.length && oppose.length) entries.push({
    class: 'REGIME_OR_HIDDEN_VARIABLE_CANDIDATE',
    detail: 'Independent evidence points in opposing directions.',
    nextProbe: 'What hidden variable, subgroup, time regime, selection process, or causal interaction could make both observations true?'
  });
  for (const contradiction of contradictionRows) entries.push({
    class: 'CONTRADICTION',
    detail: contradiction,
    nextProbe: `Which shared assumption must fail, or which regime must differ, for this contradiction to dissolve: ${contradiction}?`
  });

  return {
    ok: true,
    status: entries.length ? 'IGNORANCE_VISIBLE' : 'NO_VISIBLE_GAPS__NOT_COMPLETE_KNOWLEDGE',
    question: q,
    visibleGapCount: entries.length,
    entries,
    evidenceLineages: lineageSet.size,
    representedDomainCount: represented.size,
    businessEffectAuthority: 'NONE',
    truthBoundary: 'NO_VISIBLE_GAPS_DOES_NOT_MEAN_NO_UNKNOWN_UNKNOWNS'
  };
}

/**
 * Generate probes at the current representation boundary.
 *
 * These are candidates for discovering omitted questions. They are not claims
 * that an unknown-unknown exists, nor evidence that a probe is valuable.
 */
export function mineUnknownUnknownProbes({ ignoranceMap, maxProbes = 12 } = {}) {
  if (!ignoranceMap?.ok || !Array.isArray(ignoranceMap.entries)) return fail(['valid-ignorance-map-required']);
  const cap = Number.isSafeInteger(Number(maxProbes)) ? Math.max(1, Math.min(50, Number(maxProbes))) : 12;
  const probes = ignoranceMap.entries
    .map((entry, index) => ({
      id: `probe-${index + 1}`,
      sourceClass: entry.class,
      question: text(entry.nextProbe, 1000),
      status: 'UNKNOWN_UNKNOWN_PROBE_CANDIDATE',
      authority: 'QUESTION_ONLY'
    }))
    .filter(row => row.question)
    .slice(0, cap);

  // Add representation-level probes even when the visible map is empty. These
  // attack the map itself rather than pretending an empty warning list proves
  // completeness.
  const meta = [
    'What important stakeholder, environment, timescale, failure mode, or value dimension is absent from the current representation?',
    'What assumption is so embedded in the framing that nobody wrote it down as an assumption?',
    'What option would become obvious if the current ontology used different categories?',
    'What evidence source would we never search because the current story makes it seem irrelevant?',
    'What observation would force us to invent a new concept rather than update an existing one?'
  ];
  for (const question of meta) {
    if (probes.length >= cap) break;
    probes.push({
      id: `meta-probe-${probes.length + 1}`,
      sourceClass: 'REPRESENTATION_BOUNDARY',
      question,
      status: 'UNKNOWN_UNKNOWN_PROBE_CANDIDATE',
      authority: 'QUESTION_ONLY'
    });
  }

  return {
    ok: true,
    status: 'UNKNOWN_UNKNOWN_PROBES_GENERATED',
    probes,
    claimAboutUnknownUnknownsFound: false,
    businessEffectAuthority: 'NONE',
    truthBoundary: 'A_PROBE_CAN_REVEAL_A_BLIND_SPOT_LATER__GENERATING_THE_PROBE_IS_NOT_DISCOVERING_THE_UNKNOWN_UNKNOWN'
  };
}

/**
 * Choose probes by information leverage without pretending to know their
 * answers. Caller supplies only coarse leverage flags; ties remain ties.
 */
export function prioritizeIgnoranceProbes({ probes = [], leverage = {} } = {}) {
  const rows = (Array.isArray(probes) ? probes : []).filter(row => row?.question);
  if (!rows.length) return fail(['probes-required']);
  const scored = rows.map(row => {
    const declared = leverage?.[row.id] || {};
    const opensOptions = declared.opensOptions === true;
    const couldRevealRuin = declared.couldRevealRuin === true;
    const couldFlipRecommendation = declared.couldFlipRecommendation === true;
    const cheapToTest = declared.cheapToTest === true;
    const dimensions = [opensOptions, couldRevealRuin, couldFlipRecommendation, cheapToTest].filter(Boolean).length;
    return { ...row, leverageDimensions: dimensions, leverage: { opensOptions, couldRevealRuin, couldFlipRecommendation, cheapToTest } };
  });
  return {
    ok: true,
    status: 'IGNORANCE_PROBES_PRIORITIZED',
    // Count of independent leverage dimensions, not a utility score. Equal
    // counts remain tied because no hidden weights decide whether ruin matters
    // more than option creation.
    tiers: [...new Set(scored.map(row => row.leverageDimensions))].sort((a, b) => b - a).map(count => ({
      leverageDimensions: count,
      probes: scored.filter(row => row.leverageDimensions === count)
    })),
    businessEffectAuthority: 'NONE'
  };
}
