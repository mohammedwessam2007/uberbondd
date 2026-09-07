// The type ladder between what is observed and what is done.
//
// UberBond's constitutional failure mode is not a wrong answer. It is a silent
// promotion: an observation that becomes a belief, a belief that becomes a
// prediction, a prediction that arrives worded as a command, and a command that
// executes because it sounded confident. Each step is individually reasonable.
// The sequence ends with a machine deciding a life.
//
//   OBSERVATION -> BELIEF -> PREDICTION -> VALUE -> RECOMMENDATION
//                -> CHOICE -> AUTHORITY -> ACTION -> OUTCOME
//
// Three of those edges are not inferences at all, and no amount of evidence
// crosses them:
//
//   PREDICTION -> VALUE        an `is` never becomes an `ought`
//   RECOMMENDATION -> CHOICE   only the founder chooses
//   CHOICE -> AUTHORITY        choosing is not the same as delegating execution
//
// This module makes those three crossings impossible to perform by accident,
// which is the only way they are ever performed.
import { createHash } from 'node:crypto';

export const SOVEREIGNTY_TYPE_SYSTEM_VERSION = 'uberbond.sovereignty-type-system.v1';

/** The ladder, in order. An index here is the claim's rung. */
export const SOVEREIGNTY_TYPES = Object.freeze([
  'OBSERVATION',      // something was seen
  'BELIEF',           // something is held to be so
  'PREDICTION',       // something may happen
  'VALUE',            // something matters
  'RECOMMENDATION',   // something is advised
  'CHOICE',           // the founder decided
  'AUTHORITY',        // execution was delegated
  'ACTION',           // something was done
  'OUTCOME'           // reality answered
]);

/**
 * Crossings that no evidence, confidence, or model agreement can perform.
 *
 * Each names the human act that is the only lawful way across. They are not
 * "high bar" transitions -- there is no bar, because the thing on the far side
 * is a different kind of object, not a stronger version of the same one.
 */
export const HUMAN_ONLY_CROSSINGS = Object.freeze({
  'PREDICTION->VALUE': 'is-does-not-become-ought',
  'RECOMMENDATION->CHOICE': 'only-the-founder-chooses',
  'CHOICE->AUTHORITY': 'choosing-is-not-delegating-execution'
});

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

/** Where a claim sits on the ladder, or -1 if it is not a typed claim at all. */
export const rungOf = type => SOVEREIGNTY_TYPES.indexOf(type);

/**
 * A typed claim: content plus the kind of thing it is.
 *
 * The type is required and closed. An untyped claim is refused rather than
 * defaulted, because every sensible default is wrong in one direction: default
 * low and real recommendations get laundered as observations, default high and
 * raw data arrives carrying authority.
 */
export function typedClaim(input = {}) {
  const reasonCodes = [];
  const type = text(input.type, 40);
  if (!SOVEREIGNTY_TYPES.includes(type)) reasonCodes.push('valid-sovereignty-type-required');

  const body = text(input.body);
  if (!body) reasonCodes.push('claim-body-required');

  const at = iso(input.at) || iso(new Date());
  if (reasonCodes.length) return fail('TYPED_CLAIM_INVALID', reasonCodes);

  const claim = {
    type,
    body,
    at,
    // What this claim was derived from, by id. A promotion has to name its
    // source, which is what makes an unlawful one visible.
    derivedFrom: [...new Set((Array.isArray(input.derivedFrom) ? input.derivedFrom : [])
      .map(id => text(id, 120)).filter(Boolean))],
    basis: text(input.basis, 2000) || null,
    // Confidence is allowed on a PREDICTION and meaningless above it. A
    // RECOMMENDATION carrying 0.97 is confidence theatre pointed at a person.
    confidence: rungOf(type) <= rungOf('PREDICTION')
      && Number.isFinite(Number(input.confidence))
      && Number(input.confidence) >= 0 && Number(input.confidence) <= 1
      ? Number(input.confidence) : null
  };
  return { ok: true, status: 'TYPED_CLAIM', claim: { id: claimId(claim), ...claim } };
}

export function claimId(claim) {
  return `scl_${createHash('sha256').update(JSON.stringify([claim.type, claim.body, claim.at])).digest('hex').slice(0, 32)}`;
}

/**
 * Whether a claim of one type may be derived from a claim of another.
 *
 * Downward and lateral derivations are always fine: a belief may cite a
 * prediction, an observation may cite an outcome. What is controlled is upward
 * movement, and specifically the three crossings above.
 */
export function promotionAllowed(fromType, toType, { humanAct = null } = {}) {
  const from = rungOf(fromType);
  const to = rungOf(toType);
  if (from < 0 || to < 0) return { allowed: false, reasonCodes: ['valid-sovereignty-type-required'] };
  if (to <= from) return { allowed: true, reasonCodes: [] };

  // Skipping rungs is refused even where no crossing is named, because a skip
  // is how a crossing gets stepped over: OBSERVATION straight to
  // RECOMMENDATION never passes the PREDICTION->VALUE edge at all.
  if (to - from > 1) {
    return { allowed: false, reasonCodes: ['sovereignty-promotion-may-not-skip-a-rung'], from: fromType, to: toType };
  }

  const crossing = HUMAN_ONLY_CROSSINGS[`${fromType}->${toType}`];
  if (!crossing) return { allowed: true, reasonCodes: [] };
  if (humanAct === crossing) return { allowed: true, reasonCodes: [], humanAct };
  return { allowed: false, reasonCodes: [`requires-human-act:${crossing}`], from: fromType, to: toType, requiredHumanAct: crossing };
}

/**
 * Derives a claim from others, refusing an unlawful promotion.
 *
 * The check is against the *highest* source rung, not the first or the average.
 * A recommendation built from nine observations and one value judgment inherits
 * the value judgment; averaging would let a single normative input hide inside
 * a pile of facts.
 */
export function deriveClaim({ sources = [], type = null, body = null, humanAct = null, basis = null, at = null } = {}) {
  const rows = (Array.isArray(sources) ? sources : []).filter(row => row && SOVEREIGNTY_TYPES.includes(row.type));
  if (rows.length === 0) return fail('CLAIM_DERIVATION_INVALID', ['typed-sources-required']);

  const highest = rows.reduce((best, row) => (rungOf(row.type) > rungOf(best.type) ? row : best), rows[0]);
  const verdict = promotionAllowed(highest.type, type, { humanAct });
  if (!verdict.allowed) {
    return fail('SOVEREIGNTY_PROMOTION_REFUSED', verdict.reasonCodes, {
      from: highest.type, to: type, requiredHumanAct: verdict.requiredHumanAct ?? null,
      // Named so the refusal is legible: this is the edge, not a policy knob.
      boundary: verdict.requiredHumanAct ? 'A_HUMAN_ACT_IS_THE_ONLY_WAY_ACROSS_THIS_EDGE' : 'PROMOTION_MUST_PROCEED_ONE_RUNG_AT_A_TIME'
    });
  }

  const built = typedClaim({
    type, body, at, basis,
    derivedFrom: rows.map(row => row.id).filter(Boolean)
  });
  if (!built.ok) return built;
  return { ...built, status: 'CLAIM_DERIVED', promotedFrom: highest.type, humanAct: verdict.humanAct ?? null };
}

/**
 * Recognized sources of authority, and the fact that capability is not one.
 *
 * Every entry here is something that makes a system more able. None makes it
 * more entitled. The list is explicit because each of these has, historically,
 * been mistaken for permission by someone building exactly this kind of system.
 */
export const NOT_AUTHORITY = Object.freeze([
  'CAPABILITY', 'INTELLIGENCE', 'PREDICTION_ACCURACY', 'ECONOMIC_VALUE',
  'SOCIAL_CONSENSUS', 'MODEL_AGREEMENT', 'PAST_PREFERENCE', 'URGENCY',
  'CONFIDENCE', 'BENCHMARK_WIN', 'SELF_ASSESSMENT'
]);

/**
 * Whether an action carries real authority.
 *
 * Delegation is attenuation-only and time-bounded: a grant may narrow what it
 * received and may not outlive its own expiry. Both are checked here rather
 * than at the call site, because a call site that has just computed a very good
 * plan is the least reliable place to ask whether it is allowed to run it.
 */
export function authorityFor({ action = null, delegation = null, now = new Date() } = {}) {
  const act = text(action, 200);
  if (!act) return fail('AUTHORITY_DENIED', ['action-required']);
  const at = iso(now);
  if (!at) return fail('AUTHORITY_DENIED', ['valid-clock-required']);

  if (!delegation || typeof delegation !== 'object') {
    return fail('AUTHORITY_DENIED', ['no-delegation-present'], { action: act, note: 'Capability is not authority.' });
  }
  if (delegation.subject !== 'FOUNDER') return fail('AUTHORITY_DENIED', ['delegation-must-originate-with-the-founder'], { action: act });

  const granted = (Array.isArray(delegation.actions) ? delegation.actions : []).map(a => text(a, 200)).filter(Boolean);
  if (!granted.includes(act)) {
    return fail('AUTHORITY_DENIED', ['action-not-in-delegated-set'], { action: act, granted });
  }

  const expiresAt = iso(delegation.expiresAt);
  if (!expiresAt) return fail('AUTHORITY_DENIED', ['delegation-must-expire'], { action: act });
  if (Date.parse(expiresAt) <= Date.parse(at)) {
    return fail('AUTHORITY_DENIED', ['delegation-expired'], { action: act, expiresAt, at });
  }
  if (delegation.revokedAt && Date.parse(iso(delegation.revokedAt) || 0) <= Date.parse(at)) {
    return fail('AUTHORITY_DENIED', ['delegation-revoked'], { action: act, revokedAt: iso(delegation.revokedAt) });
  }

  return {
    ok: true,
    status: 'AUTHORITY_GRANTED',
    action: act,
    grantedAt: at,
    expiresAt,
    // Preserved so a downstream re-delegation can only narrow.
    delegatedActions: granted,
    businessEffectAuthority: 'DELEGATED'
  };
}

/**
 * Re-delegation, which may only attenuate.
 *
 * The interesting failure is not a worker granting itself more than it has --
 * that is obvious and caught. It is a chain of individually-narrowing hops
 * whose expiry quietly extends, so a five-minute grant becomes a standing one
 * three delegations down.
 */
export function attenuate({ parent = null, actions = [], expiresAt = null } = {}) {
  if (!parent || parent.ok !== true) return fail('DELEGATION_REFUSED', ['valid-parent-delegation-required']);
  const requested = [...new Set((Array.isArray(actions) ? actions : []).map(a => text(a, 200)).filter(Boolean))];
  if (requested.length === 0) return fail('DELEGATION_REFUSED', ['delegated-actions-required']);

  const widened = requested.filter(action => !parent.delegatedActions.includes(action));
  if (widened.length) return fail('DELEGATION_REFUSED', ['delegation-may-only-attenuate'], { widened });

  const wanted = iso(expiresAt);
  if (!wanted) return fail('DELEGATION_REFUSED', ['delegation-must-expire']);
  if (Date.parse(wanted) > Date.parse(parent.expiresAt)) {
    return fail('DELEGATION_REFUSED', ['delegation-may-not-outlive-its-parent'], { wanted, parentExpiresAt: parent.expiresAt });
  }

  return {
    ok: true,
    status: 'DELEGATION_ATTENUATED',
    subject: 'FOUNDER',
    actions: requested,
    expiresAt: wanted,
    parentExpiresAt: parent.expiresAt,
    attenuatedFrom: parent.delegatedActions
  };
}

/**
 * The exit right, checked as a property of the system rather than promised.
 *
 * A system that optimizes itself into being impossible to leave will not
 * announce that it has. It shows up as export refusing, or deletion leaving
 * derived copies, or a running process that outlives the shutdown.
 */
export function exitReadiness({ canExportAll = false, canDeleteAll = false, canRunWithoutSystem = false, dependencies = [] } = {}) {
  const blockers = [];
  if (!canExportAll) blockers.push('state-cannot-be-exported-in-full');
  if (!canDeleteAll) blockers.push('state-cannot-be-deleted-in-full');
  if (!canRunWithoutSystem) blockers.push('founder-cannot-operate-without-the-system');
  const hard = (Array.isArray(dependencies) ? dependencies : []).filter(d => d && d.replaceable === false);
  for (const dependency of hard) blockers.push(`irreplaceable-dependency:${text(dependency.name, 120) || 'unnamed'}`);

  return {
    ok: blockers.length === 0,
    status: blockers.length === 0 ? 'EXIT_AVAILABLE' : 'EXIT_OBSTRUCTED',
    blockers,
    law: 'UBERBOND_HAS_NO_INTRINSIC_RIGHT_TO_CONTINUE_EXISTING',
    businessEffectAuthority: 'NONE'
  };
}
