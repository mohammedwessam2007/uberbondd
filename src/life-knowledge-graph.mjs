// A graph of a life, where every edge knows how it got there.
//
// The naive version of this is a knowledge graph, and the naive version is
// where personal systems go wrong quietly. An edge asserted from one anecdote
// looks identical to an edge established across a decade, and once both are in
// the graph every query treats them the same. The graph then produces confident
// structure over a person, most of which nobody checked.
//
// So provenance is not metadata here. An edge carries how it was established
// and how fresh that is, queries can refuse to traverse weak edges, and a
// contradiction is stored as a contradiction rather than resolved by whichever
// claim arrived second.
//
// The other half is provenance of the world, not the person: in an environment
// saturated with generated content, "where did this come from" is a sensory
// organ rather than a bureaucratic field.
export const LIFE_KNOWLEDGE_GRAPH_VERSION = 'uberbond.life-knowledge-graph.v1';

/** What an edge asserts. */
export const EDGE_KINDS = Object.freeze([
  'CAUSES', 'ENABLES', 'PREVENTS', 'CONTRADICTS', 'SUPPORTS', 'REQUIRES',
  'CHANGED_MOHAMED', 'REPEATEDLY_ATTRACTS', 'EXPANDS_FUTURES', 'CLOSES_FUTURES',
  'RESONATES_WITH', 'MAY_EXPLAIN', 'TRANSFERS_CAPABILITY_TO', 'REMAINS_UNEXPLAINED'
]);

/** How an edge was established, weakest first. */
export const EDGE_BASIS = Object.freeze([
  'SINGLE_ANECDOTE', 'INFERRED', 'SELF_REPORTED', 'REPEATED_OBSERVATION',
  'LONGITUDINAL', 'DIRECTLY_MEASURED'
]);

/** Where a claim about the world came from. */
export const CONTENT_ORIGINS = Object.freeze([
  'PRIMARY_OBSERVATION', 'NAMED_HUMAN_SOURCE', 'PUBLISHED_RECORD',
  'AGGREGATOR', 'UNATTRIBUTED', 'PLAUSIBLY_GENERATED'
]);

const text = (value, max = 2000) => {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
};

const fail = (status, reasonCodes, extra = {}) => ({
  ok: false, status, reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
  businessEffectAuthority: 'NONE', ...extra
});

/** Whether an edge is strong enough to reason across. */
export const traversable = edge =>
  Boolean(edge) && EDGE_BASIS.indexOf(edge.basis) >= EDGE_BASIS.indexOf('REPEATED_OBSERVATION');

/**
 * One edge, refused without a stated basis.
 *
 * An edge with no basis is the one that does the damage: it enters the graph
 * looking like every other edge and every later query inherits its confidence.
 */
export function edge(input = {}) {
  const from = text(input?.from, 240);
  const to = text(input?.to, 240);
  if (!from || !to) return fail('EDGE_INVALID', ['from-and-to-required']);
  if (!EDGE_KINDS.includes(input?.kind)) return fail('EDGE_INVALID', ['valid-edge-kind-required']);
  if (!EDGE_BASIS.includes(input?.basis)) {
    return fail('EDGE_INVALID', ['edge-basis-required'], {
      note: 'An edge with no stated basis enters the graph looking like every other edge, and every later query inherits its confidence.'
    });
  }

  return {
    ok: true,
    status: 'EDGE_RECORDED',
    edge: {
      from, to, kind: input.kind, basis: input.basis,
      observedAt: text(input?.observedAt, 60) || null,
      traversable: traversable({ basis: input.basis })
    },
    businessEffectAuthority: 'NONE'
  };
}

/**
 * Walks the graph, optionally refusing weak edges.
 *
 * `strictOnly` defaults on. A path that crossed one anecdote is an anecdote,
 * however many well-established edges surround it, and the default that lets
 * that through is the one nobody reviews.
 */
export function traverse({ edges = [], from = null, strictOnly = true, maxDepth = 4 } = {}) {
  const start = text(from, 240);
  if (!start) return fail('TRAVERSAL_INVALID', ['start-node-required']);

  const usable = (Array.isArray(edges) ? edges : [])
    .filter(row => row?.from && row?.to && (!strictOnly || traversable(row)));

  const out = new Map();
  for (const row of usable) out.set(row.from, [...(out.get(row.from) || []), row]);

  const reached = [];
  const seen = new Set([start]);
  const walk = (node, path) => {
    if (path.length >= maxDepth) return;
    for (const row of (out.get(node) || [])) {
      if (seen.has(row.to)) continue;
      seen.add(row.to);
      reached.push({ node: row.to, via: [...path, `${row.from}-[${row.kind}]->${row.to}`], weakestBasis: [...path, row].length ? row.basis : row.basis });
      walk(row.to, [...path, `${row.from}-[${row.kind}]->${row.to}`]);
    }
  };
  walk(start, []);

  return {
    ok: true,
    status: 'TRAVERSED',
    from: start,
    reached,
    edgesConsidered: usable.length,
    edgesSkipped: (Array.isArray(edges) ? edges : []).length - usable.length,
    strictOnly,
    law: 'A_PATH_THAT_CROSSED_ONE_ANECDOTE_IS_AN_ANECDOTE_HOWEVER_MANY_STRONG_EDGES_SURROUND_IT',
    businessEffectAuthority: 'NONE'
  };
}

/**
 * Contradictions held open rather than resolved by arrival order.
 *
 * The default behaviour of most stores is last-write-wins, which silently makes
 * recency the arbiter of truth about a person. Here both sides stay, and the
 * stronger basis is reported without deleting the weaker claim.
 */
export function contradictions(edges = []) {
  const rows = (Array.isArray(edges) ? edges : []).filter(row => row?.from && row?.to && row?.kind);
  const byPair = new Map();
  for (const row of rows) {
    const key = `${row.from}|${row.to}`;
    byPair.set(key, [...(byPair.get(key) || []), row]);
  }

  const conflicts = [];
  for (const [key, group] of byPair) {
    const kinds = new Set(group.map(row => row.kind));
    const opposed = (kinds.has('CAUSES') && kinds.has('PREVENTS'))
      || (kinds.has('EXPANDS_FUTURES') && kinds.has('CLOSES_FUTURES'))
      || kinds.has('CONTRADICTS');
    if (!opposed) continue;
    const [from, to] = key.split('|');
    const strongest = group.reduce((best, row) =>
      (EDGE_BASIS.indexOf(row.basis) > EDGE_BASIS.indexOf(best.basis) ? row : best), group[0]);
    conflicts.push({ from, to, claims: group.map(row => ({ kind: row.kind, basis: row.basis })), strongestBasis: strongest.basis });
  }

  return {
    ok: true,
    status: conflicts.length ? 'CONTRADICTIONS_HELD_OPEN' : 'NO_CONTRADICTIONS_FOUND',
    conflicts,
    // Both sides survive. Nothing is deleted for being older.
    law: 'LAST_WRITE_WINS_MAKES_RECENCY_THE_ARBITER_OF_TRUTH_ABOUT_A_PERSON. BOTH CLAIMS STAY.',
    businessEffectAuthority: 'NONE'
  };
}

/**
 * Whether a claim about the world can be traced to anything.
 *
 * Provenance is a sensory organ once generated content is everywhere: an
 * unattributed claim and a primary observation read identically as text, and
 * only the chain distinguishes them.
 */
export function authenticate({ claim = null, origin = null, corroboratedBy = [], syntheticRisk = null } = {}) {
  const body = text(claim, 2000);
  if (!body) return fail('AUTHENTICATION_INVALID', ['claim-required']);

  const source = CONTENT_ORIGINS.includes(origin) ? origin : 'UNATTRIBUTED';
  const corroboration = [...new Set((Array.isArray(corroboratedBy) ? corroboratedBy : []).map(i => text(i, 240)).filter(Boolean))];
  const weak = source === 'UNATTRIBUTED' || source === 'PLAUSIBLY_GENERATED';

  return {
    ok: true,
    status: weak && corroboration.length === 0 ? 'UNTRACEABLE' : 'PROVENANCE_RECORDED',
    claim: body,
    origin: source,
    independentCorroboration: corroboration.length,
    syntheticRisk: text(syntheticRisk, 240) || (source === 'PLAUSIBLY_GENERATED' ? 'ORIGIN_MAY_BE_GENERATED' : null),
    note: weak && corroboration.length === 0
      ? 'Nothing distinguishes this from generated text. It is not false; it is untraceable, which is a different problem.'
      : null,
    businessEffectAuthority: 'NONE'
  };
}

/**
 * Identities that coexist rather than collapsing into one label.
 *
 * Premature collapse is the same error as identity compression, one level up:
 * a person is asked which of their lives is the real one long before anything
 * has established that only one can be.
 */
export function identityBranches(branches = []) {
  const rows = (Array.isArray(branches) ? branches : [])
    .map(row => ({
      identity: text(row?.identity, 240),
      state: ['ACTIVE', 'DORMANT', 'MERGING', 'ENDED'].includes(row?.state) ? row.state : null,
      yearsHeld: Number.isFinite(Number(row?.yearsHeld)) ? Number(row.yearsHeld) : null
    }))
    .filter(row => row.identity && row.state);

  const active = rows.filter(row => row.state === 'ACTIVE');
  return {
    ok: true,
    status: 'BRANCHES_RECORDED',
    branches: rows,
    activeCount: active.length,
    // No primary. A field naming one would be the collapse this prevents.
    coexisting: active.length > 1,
    law: 'ASKING_WHICH_LIFE_IS_THE_REAL_ONE_IS_PREMATURE_UNTIL_SOMETHING_ESTABLISHES_ONLY_ONE_CAN_BE',
    businessEffectAuthority: 'NONE'
  };
}

/**
 * A story about a life, kept apart from a causal claim about it.
 *
 * Both are valuable and they are not the same object. A meaningful narrative
 * that gets treated as a mechanism produces confident predictions from a story
 * somebody told themselves.
 */
export function narrative({ story = null, claimedAsCausal = false, causalEvidence = null } = {}) {
  const told = text(story, 4000);
  if (!told) return fail('NARRATIVE_INVALID', ['story-required']);

  if (claimedAsCausal && !text(causalEvidence, 2000)) {
    return fail('NARRATIVE_CAUSAL_CLAIM_REFUSED', ['causal-claim-requires-evidence-beyond-the-story'], {
      story: told,
      note: 'A story that explains everything afterwards predicts nothing beforehand. Meaning and mechanism are different objects.'
    });
  }

  return {
    ok: true,
    status: claimedAsCausal ? 'CAUSAL_CLAIM_WITH_EVIDENCE' : 'NARRATIVE_HELD_AS_MEANING',
    story: told,
    isCausalClaim: claimedAsCausal,
    boundary: 'A NARRATIVE MAY BE TRUE AS MEANING AND FALSE AS MECHANISM. THIS KEEPS THEM APART.',
    businessEffectAuthority: 'NONE'
  };
}
