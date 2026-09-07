// Preference Provenance.
//
// Repetition is evidence that a behavior repeated. It is not proof that the
// person endorses becoming the kind of person who repeats it. This organ keeps
// origin and influence visible so personalization cannot silently promote
// observed behavior into sovereign will.
export const PREFERENCE_PROVENANCE_VERSION = 'uberbond.preference-provenance.v1';

export const PREFERENCE_ORIGINS = Object.freeze([
  'PRESENT_SELF_REPORT',
  'PAST_SELF_REPORT',
  'BEHAVIORAL_INFERENCE',
  'SOCIAL_INFLUENCE',
  'ENVIRONMENTAL_CONSTRAINT',
  'AI_SUGGESTION',
  'EXTERNAL_SUGGESTION',
  'UNKNOWN'
]);

const text = (value, max = 600) => {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
};
const uniq = values => [...new Set((values || []).filter(Boolean))];
const fail = (reasonCodes, extra = {}) => ({
  ok: false,
  status: 'PREFERENCE_PROVENANCE_REFUSED',
  reasonCodes: uniq(reasonCodes),
  businessEffectAuthority: 'NONE',
  ...extra
});

export function recordPreference({
  preferenceId,
  statement,
  origin = 'UNKNOWN',
  evidenceRefs = [],
  influencedBy = [],
  observedAt = new Date().toISOString(),
  presentExplicitEndorsement = false
} = {}) {
  const id = text(preferenceId, 160);
  const claim = text(statement, 1000);
  const normalizedOrigin = text(origin, 80)?.toUpperCase();
  const refs = uniq((Array.isArray(evidenceRefs) ? evidenceRefs : []).map(ref => text(ref, 300)));
  const influences = uniq((Array.isArray(influencedBy) ? influencedBy : []).map(ref => text(ref, 200)));
  const at = Date.parse(observedAt);
  const reasons = [];
  if (!id) reasons.push('preference-id-required');
  if (!claim) reasons.push('preference-statement-required');
  if (!PREFERENCE_ORIGINS.includes(normalizedOrigin)) reasons.push('known-preference-origin-required');
  if (!Number.isFinite(at)) reasons.push('valid-observed-at-required');
  if (normalizedOrigin !== 'PRESENT_SELF_REPORT' && presentExplicitEndorsement === true) {
    reasons.push('present-explicit-endorsement-requires-present-self-report');
  }
  if (reasons.length) return fail(reasons);

  return {
    ok: true,
    status: 'PREFERENCE_PROVENANCE_RECORDED',
    preferenceId: id,
    statement: claim,
    origin: normalizedOrigin,
    evidenceRefs: refs,
    influencedBy: influences,
    observedAt: new Date(at).toISOString(),
    presentExplicitEndorsement: normalizedOrigin === 'PRESENT_SELF_REPORT' && presentExplicitEndorsement === true,
    authenticityClaim: 'NOT_INFERRED',
    highestRung: 'OBSERVATION',
    businessEffectAuthority: 'NONE',
    truthBoundary: 'PROVENANCE_DESCRIBES_WHERE_A_PREFERENCE_CAME_FROM__IT_DOES_NOT_DECIDE_WHICH_DESIRES_ARE_AUTHENTIC'
  };
}

/** Detect provenance loops and model-induced preference chains. */
export function tracePreferenceLineage(preferences = []) {
  const rows = (Array.isArray(preferences) ? preferences : []).filter(row => row?.ok && row.preferenceId);
  if (!rows.length) return fail(['recorded-preferences-required']);
  const ids = rows.map(row => row.preferenceId);
  if (new Set(ids).size !== ids.length) return fail(['duplicate-preference-id']);
  const byId = new Map(rows.map(row => [row.preferenceId, row]));
  const reasons = [];
  for (const row of rows) {
    for (const dep of row.influencedBy || []) {
      if (!byId.has(dep) && !/^external:|^ai:|^social:|^environment:/i.test(dep)) {
        reasons.push(`unknown-preference-influence:${row.preferenceId}->${dep}`);
      }
    }
  }
  if (reasons.length) return fail(reasons);

  const cycles = [];
  const visiting = new Set();
  const visited = new Set();
  function visit(id, path = []) {
    if (visited.has(id)) return;
    if (visiting.has(id)) {
      const start = path.indexOf(id);
      cycles.push([...path.slice(start), id]);
      return;
    }
    visiting.add(id);
    const row = byId.get(id);
    for (const dep of row?.influencedBy || []) if (byId.has(dep)) visit(dep, [...path, id]);
    visiting.delete(id);
    visited.add(id);
  }
  for (const id of ids) visit(id, []);
  if (cycles.length) return fail(['preference-provenance-cycle'], { cycles });

  const memo = new Map();
  function ancestry(id) {
    if (memo.has(id)) return memo.get(id);
    const row = byId.get(id);
    const result = new Set([row.origin]);
    for (const dep of row.influencedBy || []) {
      if (byId.has(dep)) for (const origin of ancestry(dep)) result.add(origin);
      else if (/^ai:/i.test(dep)) result.add('AI_SUGGESTION');
      else if (/^social:/i.test(dep)) result.add('SOCIAL_INFLUENCE');
      else if (/^environment:/i.test(dep)) result.add('ENVIRONMENTAL_CONSTRAINT');
      else result.add('EXTERNAL_SUGGESTION');
    }
    memo.set(id, result);
    return result;
  }

  return {
    ok: true,
    status: 'PREFERENCE_LINEAGE_TRACED',
    preferences: rows.map(row => ({
      preferenceId: row.preferenceId,
      origin: row.origin,
      ancestryOrigins: [...ancestry(row.preferenceId)].sort(),
      presentExplicitEndorsement: row.presentExplicitEndorsement
    })),
    businessEffectAuthority: 'NONE'
  };
}

/** Present explicit self-report outranks inference about the same question. */
export function presentPreferencePrecedence(preferences = []) {
  const rows = (Array.isArray(preferences) ? preferences : []).filter(row => row?.ok);
  if (!rows.length) return fail(['recorded-preferences-required']);
  const explicit = rows.filter(row => row.origin === 'PRESENT_SELF_REPORT' && row.presentExplicitEndorsement === true);
  return {
    ok: true,
    status: explicit.length ? 'PRESENT_EXPLICIT_PREFERENCE_AVAILABLE' : 'NO_PRESENT_EXPLICIT_PREFERENCE',
    presentExplicitPreferences: explicit,
    inferredPreferences: rows.filter(row => !explicit.includes(row)),
    precedenceLaw: 'PRESENT_EXPLICIT_SELF_REPORT_OUTRANKS_BEHAVIORAL_MODEL_SOCIAL_AND_AI_INFERENCE',
    businessEffectAuthority: 'NONE'
  };
}
