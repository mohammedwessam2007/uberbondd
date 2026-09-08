// The Living Model is a person over time, not a label; the Life Graph is a
// claim about the world, not the world.
//
// personal-civilization-core.mjs already derives a model from private
// records, with provenance and deletion-closure enforced. life-knowledge-graph
// already types edges by evidence basis and holds contradictions open. Neither
// module, alone, stops the two failures this one exists to close:
//
// 1. A model that only ever produces one active claim per dimension is a model
//    that has already decided who the person is. "I am bad at public
//    speaking" and "I am inexperienced at public speaking" describe the same
//    observations, but only one of them is revisable. Collapsing competing
//    explanations into a single conclusion -- especially the durable-sounding
//    one -- is the identity-compression error the North Star names, and it is
//    invisible from inside a system that only ever stores one hypothesis at a
//    time. So hypotheses here compete, survive being outranked, and survive
//    being superseded: a superseded hypothesis keeps its record and its
//    supersession reason rather than being deleted, because "why we no longer
//    believe this" is itself evidence about the person.
//
// 2. A graph edge asserted from a life event is that event, restated as a
//    claim about the world. If the event is deleted and the edge remains, the
//    graph is a copy of deleted data wearing a different shape -- the same
//    failure personal-civilization-core.mjs was written to prevent for
//    derived models, now one layer further out. So every edge asserted here
//    carries the private record it came from, and reconciling the graph after
//    a deletion reuses the core's own closure function rather than
//    re-deriving a second, possibly inconsistent, notion of "downstream."
//
// Both failures share a root cause: treating a claim as freestanding once it
// has been made, instead of keeping it tied to the evidence and the record it
// depends on. Everything below exists to keep that tie unbreakable.
import { founderAuthorized, deriveLivingModel, derivedClosure } from './personal-civilization-core.mjs';
import { edge } from './life-knowledge-graph.mjs';

export const PERSONAL_CIVILIZATION_MODEL_GRAPH_VERSION = 'uberbond.personal-civilization-model-graph.v1';

/**
 * What a hypothesis about the person is claiming to be.
 *
 * The distinction that matters most is between the four types that describe
 * a condition of the current moment (TEMPORARY_STATE, SKILL_DEFICIT,
 * ENVIRONMENT_EFFECT, INSUFFICIENT_EXPOSURE) and TRAIT, which describes the
 * person. Evidence for the first kind is routinely mistaken for evidence of
 * the second; that mistake is a permanent identity claim built on temporary
 * evidence, and it is the one this module is structured to make impossible
 * to do silently.
 */
export const HYPOTHESIS_TYPES = Object.freeze([
  'TRAIT', 'TEMPORARY_STATE', 'SKILL_DEFICIT', 'HABIT', 'ENVIRONMENT_EFFECT',
  'PREFERENCE', 'VALUE', 'SELF_STORY', 'INSUFFICIENT_EXPOSURE', 'UNKNOWN'
]);

/**
 * Types a hypothesis may never be superseded *into* TRAIT from directly.
 *
 * Each of these describes something that is, by definition, expected to
 * change: a skill gap closes with practice, an environment effect stops the
 * moment the environment changes, a temporary state passes, and insufficient
 * exposure is resolved by exposure. None of that is compatible with TRAIT,
 * which claims permanence. This module cannot read the evidence text and
 * judge whether a promotion is "really" justified -- so instead it makes the
 * specific transition structurally unavailable, and a real change of
 * conclusion has to go through a different type first, on its own evidence.
 */
export const TRAIT_PROMOTION_FORBIDDEN_FROM = Object.freeze([
  'SKILL_DEFICIT', 'ENVIRONMENT_EFFECT', 'TEMPORARY_STATE', 'INSUFFICIENT_EXPOSURE'
]);

/** How a graph claim is being presented: something seen, or something concluded. */
export const GRAPH_ASSERTION_KINDS = Object.freeze(['OBSERVATION', 'INFERENCE']);

const text = (value, max = 4000) => {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
};

const iso = value => {
  const date = value instanceof Date ? value : new Date(String(value ?? ''));
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
};

const fail = (status, reasonCodes, extra = {}) => ({
  ok: false, status, reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
  businessEffectAuthority: 'NONE', ...extra
});

/**
 * Registers one hypothesis about the person, backed by a private-record claim.
 *
 * The provenance and evidence discipline -- a body, a citation of records that
 * actually exist, refusal when neither is present -- is not reimplemented
 * here; it is inherited by delegating to `deriveLivingModel`. This function
 * adds only what that one does not have a concept of: a typed dimension, a
 * hypothesis type, and a numeric evidence strength that never defaults
 * upward. Registering a second, third, or Nth hypothesis for the same
 * subject and dimension never removes or edits an existing one -- there is no
 * code path here that does that -- which is what keeps competing
 * explanations genuinely competing instead of silently reduced to whichever
 * was registered last.
 */
export function registerHypothesis({
  store = [], hypothesisStore = [], subjectId = null, dimension = null, type = null,
  statement = null, derivedFrom = [], evidenceStrength = undefined, authorization = null, now = new Date()
} = {}) {
  if (!founderAuthorized(authorization)) {
    return fail('PRIVATE_STATE_FOUNDER_AUTHORITY_REQUIRED', ['founder-authorization-required']);
  }
  const at = iso(now);
  if (!at) return fail('HYPOTHESIS_INVALID', ['valid-clock-required']);

  const subject = text(subjectId, 120);
  if (!subject) return fail('HYPOTHESIS_INVALID', ['subject-id-required']);
  const dimension_ = text(dimension, 240);
  if (!dimension_) return fail('HYPOTHESIS_INVALID', ['dimension-required']);
  if (!HYPOTHESIS_TYPES.includes(type)) return fail('HYPOTHESIS_INVALID', ['valid-hypothesis-type-required']);

  const model = deriveLivingModel({
    store, authorization, now,
    claims: [{ body: statement, derivedFrom, certainty: evidenceStrength }]
  });
  if (!model.ok) return model;
  if (model.refusedCount > 0) {
    return fail('HYPOTHESIS_INVALID', model.refused[0].reasonCodes, { refused: model.refused[0] });
  }

  const backing = model.derived[0];
  // Evidence strength defaults to 0, not to null-treated-as-unranked and not
  // to any value that could let an unscored hypothesis tie with, let alone
  // beat, a scored one. `deriveLivingModel` separately stores `certainty` as
  // null when none was given -- that null is preserved on the private record
  // as "unknown", while the strength used for ranking here is always a
  // number so two hypotheses can always be compared.
  const strength = Number.isFinite(Number(evidenceStrength)) && Number(evidenceStrength) >= 0 && Number(evidenceStrength) <= 1
    ? Number(evidenceStrength) : 0;

  const hypothesis = {
    id: `hyp_${backing.id.slice(4)}`,
    subjectId: subject,
    dimension: dimension_,
    type,
    statement: backing.body,
    recordId: backing.id,
    derivedFrom: backing.derivedFrom,
    evidenceStrength: strength,
    status: 'ACTIVE',
    supersedes: null,
    supersededBy: null,
    supersessionReason: null,
    registeredAt: at
  };

  return {
    ok: true,
    status: 'HYPOTHESIS_REGISTERED',
    hypothesis,
    hypothesisStore: [...hypothesisStore, hypothesis],
    store: model.store,
    businessEffectAuthority: 'NONE'
  };
}

/**
 * Supersedes one hypothesis with a new one, on new evidence.
 *
 * The previous hypothesis is never deleted and never mutated in place beyond
 * gaining a status and a reason: `hypothesisStore.map`, not `.filter`. A
 * supersession that erased the prior belief would erase exactly the
 * information a later reviewer needs -- what UberBond used to think, and why
 * it stopped -- and would make the Living Model no more auditable than a
 * single mutable field.
 */
export function supersedeHypothesis({
  store = [], hypothesisStore = [], previousId = null, next = {}, reason = null,
  authorization = null, now = new Date()
} = {}) {
  if (!founderAuthorized(authorization)) {
    return fail('PRIVATE_STATE_FOUNDER_AUTHORITY_REQUIRED', ['founder-authorization-required']);
  }

  const prevId = text(previousId, 80);
  if (!prevId) return fail('HYPOTHESIS_SUPERSESSION_INVALID', ['previous-hypothesis-id-required']);
  const previous = (Array.isArray(hypothesisStore) ? hypothesisStore : []).find(row => row.id === prevId);
  if (!previous) return fail('HYPOTHESIS_SUPERSESSION_INVALID', ['previous-hypothesis-not-found']);
  if (previous.status !== 'ACTIVE') return fail('HYPOTHESIS_SUPERSESSION_INVALID', ['previous-hypothesis-not-active']);

  const supersessionReason = text(reason, 2000);
  if (!supersessionReason) return fail('HYPOTHESIS_SUPERSESSION_INVALID', ['supersession-reason-required']);

  // The guard this function exists for. It fires before any record is
  // written, so a refused promotion leaves no half-registered hypothesis
  // behind.
  if (TRAIT_PROMOTION_FORBIDDEN_FROM.includes(previous.type) && next?.type === 'TRAIT') {
    return fail('HYPOTHESIS_TRAIT_PROMOTION_REFUSED', ['trait-promotion-from-non-durable-type-refused'], {
      previousType: previous.type,
      note: 'A skill deficit, environment effect, temporary state, or exposure gap describes a condition expected to change. TRAIT claims permanence. Superseding one into the other is refused rather than logged.'
    });
  }

  const registered = registerHypothesis({
    store, hypothesisStore, authorization, now,
    subjectId: previous.subjectId,
    dimension: next.dimension || previous.dimension,
    type: next.type,
    statement: next.statement,
    derivedFrom: next.derivedFrom,
    evidenceStrength: next.evidenceStrength
  });
  if (!registered.ok) return registered;

  const supersededPrevious = {
    ...previous, status: 'SUPERSEDED', supersededBy: registered.hypothesis.id, supersessionReason
  };
  const nextHypothesis = { ...registered.hypothesis, supersedes: prevId };

  const updatedStore = registered.hypothesisStore.map(row => {
    if (row.id === prevId) return supersededPrevious;
    if (row.id === nextHypothesis.id) return nextHypothesis;
    return row;
  });

  return {
    ok: true,
    status: 'HYPOTHESIS_SUPERSEDED',
    previous: supersededPrevious,
    next: nextHypothesis,
    hypothesisStore: updatedStore,
    store: registered.store,
    businessEffectAuthority: 'NONE'
  };
}

/**
 * Ranks the active hypotheses for a subject/dimension by evidence strength.
 *
 * The only signal is `evidenceStrength`, and it is a plain descending sort --
 * no tie-break toward recency, registration order, or hypothesis type. An
 * unscored hypothesis carries strength 0 by construction, so it cannot climb
 * above a scored one by being newer, more recently reasserted, or phrased
 * more confidently.
 */
export function rankHypotheses({ hypothesisStore = [], subjectId = null, dimension = null } = {}) {
  const subject = text(subjectId, 120);
  const dimension_ = text(dimension, 240);

  const rows = (Array.isArray(hypothesisStore) ? hypothesisStore : [])
    .filter(row => row.status === 'ACTIVE')
    .filter(row => !subject || row.subjectId === subject)
    .filter(row => !dimension_ || row.dimension === dimension_);

  const ranked = [...rows].sort((a, b) => b.evidenceStrength - a.evidenceStrength);

  return {
    ok: true,
    status: 'HYPOTHESES_RANKED',
    ranked,
    // Never a single conclusion: this reports how many active explanations
    // are actually competing, rather than silently picking ranked[0] and
    // discarding the rest.
    competing: ranked.length > 1,
    businessEffectAuthority: 'NONE'
  };
}

/**
 * Asserts one life-graph edge, tied to the private record it came from.
 *
 * `assertionKind` -- whether the edge may be presented as something observed
 * versus something concluded -- is computed from `basis`, never read from
 * caller-supplied input. `edge()` already refuses a missing basis; this
 * function refuses to let anything override what a stated basis of INFERRED
 * means, because that override is exactly how an inference would end up
 * presentable as an observation.
 */
export function assertProvenancedEdge({
  store = [], edges = [], edgeInput = {}, sourceRecordId = null, authorization = null, now = new Date()
} = {}) {
  if (!founderAuthorized(authorization)) {
    return fail('PRIVATE_STATE_FOUNDER_AUTHORITY_REQUIRED', ['founder-authorization-required']);
  }
  const at = iso(now);
  if (!at) return fail('GRAPH_EDGE_INVALID', ['valid-clock-required']);

  const sourceId = text(sourceRecordId, 80);
  if (!sourceId) return fail('GRAPH_EDGE_INVALID', ['source-record-id-required']);
  const sourceRecord = (Array.isArray(store) ? store : []).find(row => row.id === sourceId);
  if (!sourceRecord) return fail('GRAPH_EDGE_INVALID', ['source-record-not-found-in-private-store']);

  const built = edge(edgeInput);
  if (!built.ok) return built;

  const assertionKind = built.edge.basis === 'INFERRED' ? 'INFERENCE' : 'OBSERVATION';

  const provenanced = {
    ...built.edge,
    provenance: {
      sourceRecordId: sourceId,
      originPrivacyClass: sourceRecord.privacyClass,
      evidenceBasis: built.edge.basis,
      assertionKind,
      assertedAt: at
    }
  };

  return {
    ok: true,
    status: 'GRAPH_EDGE_ASSERTED',
    edge: provenanced,
    edges: [...edges, provenanced],
    businessEffectAuthority: 'NONE'
  };
}

/**
 * Removes graph edges whose source record no longer exists, after a deletion.
 *
 * This calls the core's own `derivedClosure` on the pre-deletion store to
 * compute exactly which record ids were removed -- including everything
 * transitively derived from the requested roots -- rather than re-deriving a
 * second notion of "what got deleted" that could drift from the one the
 * private store actually enforces. An edge surviving here after its source
 * left the private store would be the same failure `deletePrivateRecords`
 * exists to prevent for derived models, one layer further from the record.
 */
export function reconcileGraphAfterDeletion({ storeBeforeDeletion = [], deletedIds = [], edges = [] } = {}) {
  const roots = (Array.isArray(deletedIds) ? deletedIds : []).map(id => text(id, 80)).filter(Boolean);
  if (roots.length === 0) return fail('GRAPH_RECONCILE_INVALID', ['deleted-ids-required']);

  const closure = derivedClosure(storeBeforeDeletion, roots);

  const surviving = [];
  const pruned = [];
  for (const row of (Array.isArray(edges) ? edges : [])) {
    const sourceId = row?.provenance?.sourceRecordId;
    if (sourceId && closure.has(sourceId)) {
      pruned.push({ from: row.from, to: row.to, kind: row.kind, sourceRecordId: sourceId });
    } else {
      surviving.push(row);
    }
  }

  return {
    ok: true,
    status: pruned.length ? 'GRAPH_EDGES_PRUNED' : 'NO_GRAPH_EDGES_ORPHANED',
    edges: surviving,
    prunedCount: pruned.length,
    pruned,
    closureSize: closure.size,
    guarantee: 'NO_GRAPH_CLAIM_FROM_A_DELETED_RECORD_REMAINS',
    businessEffectAuthority: 'NONE'
  };
}
