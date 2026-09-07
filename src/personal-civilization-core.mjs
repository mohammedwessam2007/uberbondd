// The private core of the Personal Civilization: capture, derive, export, delete.
//
// This holds the one data class in UberBond that is not the company's: Mohamed's
// life. Everything here is written against a single premise -- that private life
// data must be able to leave, and must be able to stop existing, and that neither
// is true unless the system can prove it.
//
// Two invariants carry the weight, and both exist because their absence is
// invisible until it is catastrophic:
//
// 1. Private records never reach a repository path. The repo is public. A leak
//    here is not a bug that gets fixed in the next commit -- it is permanent, in
//    a public git history, about a person.
// 2. Deleting a life event deletes what was derived from it. A "Living Model"
//    that survives the deletion of the events it was built from is a copy of the
//    data the owner just deleted, wearing a different name. Right-to-delete that
//    only reaches the source table is theatre.
//
// The founder is the only authority. No lane, agent, model, or scheduled job can
// read or mutate private state without an owner authorization carried on the
// call. Capability never creates authority; here it does not even create access.
import { createHash } from 'node:crypto';

export const PERSONAL_CIVILIZATION_CORE_VERSION = 'uberbond.personal-civilization-core.v1';

/** Record kinds the private core holds. */
export const PRIVATE_RECORD_KINDS = Object.freeze([
  'THOUGHT',            // Thought Ocean: unstructured, unjudged, append-only
  'LIFE_EVENT',         // Life Event ledger: something that happened
  'OBSERVATION',        // a noticed pattern, not yet a belief
  'DERIVED_MODEL'       // Living Mohamed Model / Life Knowledge Graph nodes
]);

/** Anything not PUBLIC_REPOSITORY_SAFE may never be written to a repo path. */
export const PRIVACY_CLASSES = Object.freeze(['PRIVATE_LIFE_DATA', 'PUBLIC_REPOSITORY_SAFE']);

const text = (value, max = 20000) => {
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
 * Whether a call carries founder authority.
 *
 * Deliberately not a boolean flag on the record. A flag is something any caller
 * can set; this requires the owner's authorization object to be passed down the
 * call, so an autonomous lane cannot reach private state by constructing a
 * plausible-looking request.
 */
export function founderAuthorized(authorization) {
  if (!authorization || typeof authorization !== 'object') return false;
  return authorization.subject === 'FOUNDER'
    && authorization.grant === 'PRIVATE_LIFE_STATE'
    && Boolean(text(authorization.issuedAt, 60))
    && iso(authorization.issuedAt) !== null;
}

/**
 * Refuses any path that would put private data in the repository.
 *
 * The check is on the destination, not the intent, because intent is what fails
 * silently. A private record with a repo-relative destination is not a
 * configuration mistake to be logged -- it is the one outcome this module exists
 * to make impossible.
 */
export function privateDestinationAllowed(destination) {
  const target = text(destination, 4096);
  if (!target) return { allowed: false, reasonCodes: ['private-destination-required'] };
  if (!target.startsWith('/')) return { allowed: false, reasonCodes: ['private-destination-must-be-absolute'] };

  const forbidden = [
    /(^|\/)\.git(\/|$)/,
    /(^|\/)artifacts(\/|$)/,
    /(^|\/)docs(\/|$)/,
    /(^|\/)src(\/|$)/,
    /(^|\/)tests(\/|$)/,
    /(^|\/)config(\/|$)/,
    /(^|\/)scripts(\/|$)/
  ];
  if (forbidden.some(pattern => pattern.test(target))) {
    return { allowed: false, reasonCodes: ['private-data-may-not-enter-repository-path'] };
  }
  return { allowed: true, reasonCodes: [] };
}

/** A content-addressed id, so the same record cannot be stored twice under two names. */
export function privateRecordId(record) {
  return `pcr_${createHash('sha256').update(JSON.stringify([
    record.kind, record.occurredAt, record.body, record.subjectId ?? null
  ])).digest('hex').slice(0, 32)}`;
}

/**
 * Normalizes one private record, or refuses it.
 *
 * `certainty` and `interpretation` are kept apart from `body` on purpose. A
 * thought is what was thought; what it might mean is a separate, revisable
 * claim. Collapsing them is how a bad day becomes a permanent trait -- which the
 * sovereignty laws forbid in as many words.
 */
export function normalizePrivateRecord(input = {}) {
  const reasonCodes = [];
  const kind = text(input.kind, 40);
  if (!PRIVATE_RECORD_KINDS.includes(kind)) reasonCodes.push('valid-record-kind-required');

  const body = text(input.body);
  if (!body) reasonCodes.push('record-body-required');

  const occurredAt = iso(input.occurredAt);
  if (!occurredAt) reasonCodes.push('valid-occurred-at-required');

  const privacyClass = PRIVACY_CLASSES.includes(input.privacyClass) ? input.privacyClass : 'PRIVATE_LIFE_DATA';

  if (reasonCodes.length) return fail('PRIVATE_RECORD_INVALID', reasonCodes);

  const record = {
    kind,
    body,
    occurredAt,
    privacyClass,
    subjectId: text(input.subjectId, 120) || null,
    // Provenance, so a derived model can name what it was built from and a
    // deletion can find everything downstream of a source.
    derivedFrom: [...new Set((Array.isArray(input.derivedFrom) ? input.derivedFrom : []).map(id => text(id, 80)).filter(Boolean))],
    // An interpretation is a claim about the record, not the record.
    interpretation: text(input.interpretation, 4000) || null,
    certainty: Number.isFinite(Number(input.certainty)) && Number(input.certainty) >= 0 && Number(input.certainty) <= 1
      ? Number(input.certainty) : null,
    recordedAt: iso(input.recordedAt) || occurredAt
  };
  return { ok: true, status: 'PRIVATE_RECORD_NORMALIZED', record: { id: privateRecordId(record), ...record } };
}

/**
 * Appends a record to the private store.
 *
 * Append-only by construction: the Thought Ocean is not a place where the past
 * gets tidied. Correction is a new record that supersedes, so the shape of a
 * change of mind stays visible.
 */
export function appendPrivateRecord({ store = [], input = {}, authorization = null, destination = null } = {}) {
  if (!founderAuthorized(authorization)) return fail('PRIVATE_STATE_FOUNDER_AUTHORITY_REQUIRED', ['founder-authorization-required']);

  const normalized = normalizePrivateRecord(input);
  if (!normalized.ok) return normalized;

  if (normalized.record.privacyClass === 'PRIVATE_LIFE_DATA') {
    const destinationCheck = privateDestinationAllowed(destination);
    if (!destinationCheck.allowed) return fail('PRIVATE_DESTINATION_REFUSED', destinationCheck.reasonCodes, { destination });
  }

  const existing = store.find(row => row.id === normalized.record.id);
  if (existing) {
    return { ok: true, status: 'PRIVATE_RECORD_ALREADY_PRESENT', duplicate: true, record: existing, store };
  }
  return { ok: true, status: 'PRIVATE_RECORD_APPENDED', duplicate: false, record: normalized.record, store: [...store, normalized.record] };
}

/**
 * Everything downstream of a record, transitively.
 *
 * The reason deletion is not a single-row operation. A Living Model node built
 * from a life event is that life event, restated -- deleting the event and
 * keeping the node leaves the owner's data in the system after they removed it.
 */
export function derivedClosure(store, rootIds) {
  const roots = new Set((Array.isArray(rootIds) ? rootIds : []).filter(Boolean));
  const closure = new Set(roots);
  let grew = true;
  while (grew) {
    grew = false;
    for (const row of store) {
      if (closure.has(row.id)) continue;
      if ((row.derivedFrom || []).some(parent => closure.has(parent))) { closure.add(row.id); grew = true; }
    }
  }
  return closure;
}

/**
 * Deletes records and everything derived from them, and proves what it removed.
 *
 * The receipt names ids rather than content: a deletion receipt that quotes the
 * deleted body would preserve the very thing it claims to have destroyed.
 */
export function deletePrivateRecords({ store = [], ids = [], authorization = null, now = new Date() } = {}) {
  if (!founderAuthorized(authorization)) return fail('PRIVATE_STATE_FOUNDER_AUTHORITY_REQUIRED', ['founder-authorization-required']);
  const at = iso(now);
  if (!at) return fail('PRIVATE_DELETE_INVALID', ['valid-clock-required']);

  const requested = (Array.isArray(ids) ? ids : []).map(id => text(id, 80)).filter(Boolean);
  if (requested.length === 0) return fail('PRIVATE_DELETE_INVALID', ['delete-ids-required']);

  const present = new Set(store.map(row => row.id));
  const unknown = requested.filter(id => !present.has(id));
  const closure = derivedClosure(store, requested.filter(id => present.has(id)));
  const remaining = store.filter(row => !closure.has(row.id));

  return {
    ok: true,
    status: 'PRIVATE_RECORDS_DELETED',
    deletedAt: at,
    requestedIds: requested,
    deletedIds: [...closure],
    derivedAlsoDeleted: [...closure].filter(id => !requested.includes(id)),
    unknownIds: unknown,
    remainingCount: remaining.length,
    store: remaining,
    // The property a caller actually needs to trust.
    guarantee: 'NO_RECORD_DERIVED_FROM_A_DELETED_RECORD_REMAINS',
    businessEffectAuthority: 'NONE'
  };
}

/**
 * The complete private state, in a form the owner can take elsewhere.
 *
 * Export is a sovereignty primitive, not a feature: a store you cannot leave is
 * a store that owns you. It is refused to a repository destination for the same
 * reason an append is.
 */
export function exportPrivateState({ store = [], authorization = null, destination = null, now = new Date() } = {}) {
  if (!founderAuthorized(authorization)) return fail('PRIVATE_STATE_FOUNDER_AUTHORITY_REQUIRED', ['founder-authorization-required']);
  const at = iso(now);
  if (!at) return fail('PRIVATE_EXPORT_INVALID', ['valid-clock-required']);

  const destinationCheck = privateDestinationAllowed(destination);
  if (!destinationCheck.allowed) return fail('PRIVATE_DESTINATION_REFUSED', destinationCheck.reasonCodes, { destination });

  const records = [...store];
  return {
    ok: true,
    status: 'PRIVATE_STATE_EXPORTED',
    exportedAt: at,
    destination,
    recordCount: records.length,
    // Completeness is asserted against the store it was taken from, so a
    // partial export cannot pass itself off as the whole life.
    completeness: {
      storeCount: store.length,
      exportedCount: records.length,
      complete: records.length === store.length
    },
    digest: createHash('sha256').update(JSON.stringify(records.map(row => row.id).sort())).digest('hex'),
    records,
    businessEffectAuthority: 'NONE'
  };
}

/**
 * A Living Model derived from private records.
 *
 * Every derived claim cites the records it came from, which is what makes
 * deletion able to reach it. A claim with no provenance is refused rather than
 * stored, because it could never be deleted correctly afterwards.
 */
export function deriveLivingModel({ store = [], claims = [], authorization = null, now = new Date() } = {}) {
  if (!founderAuthorized(authorization)) return fail('PRIVATE_STATE_FOUNDER_AUTHORITY_REQUIRED', ['founder-authorization-required']);
  const at = iso(now);
  if (!at) return fail('LIVING_MODEL_INVALID', ['valid-clock-required']);

  const present = new Set(store.map(row => row.id));
  const derived = [];
  const refused = [];

  for (const claim of (Array.isArray(claims) ? claims : [])) {
    const body = text(claim?.body, 4000);
    const sources = [...new Set((Array.isArray(claim?.derivedFrom) ? claim.derivedFrom : []).map(id => text(id, 80)).filter(Boolean))];
    if (!body) { refused.push({ claim, reasonCodes: ['claim-body-required'] }); continue; }
    if (sources.length === 0) { refused.push({ claim, reasonCodes: ['claim-provenance-required'] }); continue; }
    const missing = sources.filter(id => !present.has(id));
    if (missing.length) { refused.push({ claim, reasonCodes: ['claim-cites-absent-records'], missing }); continue; }

    const normalized = normalizePrivateRecord({
      kind: 'DERIVED_MODEL', body, occurredAt: at, derivedFrom: sources,
      interpretation: claim?.interpretation, certainty: claim?.certainty,
      privacyClass: 'PRIVATE_LIFE_DATA'
    });
    if (!normalized.ok) { refused.push({ claim, reasonCodes: normalized.reasonCodes }); continue; }
    derived.push(normalized.record);
  }

  return {
    ok: true,
    status: 'LIVING_MODEL_DERIVED',
    derivedAt: at,
    derivedCount: derived.length,
    refusedCount: refused.length,
    derived,
    refused,
    store: [...store, ...derived],
    truthBoundary: 'A DERIVED CLAIM IS AN INTERPRETATION OF PRIVATE RECORDS, NOT A TRAIT, DIAGNOSIS, OR PERMANENT FACT ABOUT A PERSON',
    businessEffectAuthority: 'NONE'
  };
}
