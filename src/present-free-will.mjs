// The ordering that decides who wins when the parts of a person disagree.
//
// The canon gives it as a list, present conscious choice at the top and
// economic optimization at the bottom, and the list is only interesting at the
// moments it is inconvenient. A model that has been right for two years, a
// commitment made in better circumstances, a preference the data shows is
// stable -- each of those is a good reason, and none of them outranks the
// person saying no today.
//
// The failure is never a system announcing it has taken over. It is the
// accumulation of small deferrals: this one time the model is obviously right,
// this one time the historical preference is better evidence than the mood. Run
// that long enough and present choice has been outvoted without any single
// moment where it lost.
//
// So the rungs are ordered, the ordering is enforced, and the resolution says
// what it overrode. "I know X is optimal, I choose Y" resolves to Y and is not
// an error state -- the canon says so explicitly, and a module that returned
// CONFLICT there would be arguing.
export const PRESENT_FREE_WILL_VERSION = 'uberbond.present-free-will.v1';

/**
 * The authority hierarchy, strongest first. Index is rank.
 *
 * Frozen and ordered: the ordering *is* the module, and a caller able to supply
 * its own ranking could put economic optimization anywhere it liked.
 */
export const AUTHORITY_RUNGS = Object.freeze([
  'PRESENT_CONSCIOUS_CHOICE',
  'ENDORSED_COMMITMENT',        // a commitment the person still endorses
  'CURRENT_VALUE',
  'LONG_TERM_INTENTION',
  'OBSERVED_PREFERENCE',
  'HISTORICAL_PREFERENCE',
  'UBERBOND_PREDICTION',
  'SOCIAL_EXPECTATION',
  'ECONOMIC_OPTIMIZATION'
]);

/** Rungs no accumulation of evidence can promote. */
export const NEVER_OUTRANKS_PRESENT_CHOICE = Object.freeze(
  AUTHORITY_RUNGS.filter(rung => rung !== 'PRESENT_CONSCIOUS_CHOICE')
);

const text = (value, max = 2000) => {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
};

const fail = (status, reasonCodes, extra = {}) => ({
  ok: false, status, reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
  businessEffectAuthority: 'NONE', ...extra
});

/**
 * A position held by some part of the system or the person.
 *
 * A commitment must say whether it is still endorsed. Without that it is a
 * historical preference wearing a stronger word, which is the specific way a
 * past self acquires authority over a present one.
 */
export function position(input = {}) {
  const rung = text(input?.rung, 40);
  const claim = text(input?.claim, 2000);
  if (!claim) return fail('POSITION_INVALID', ['claim-required']);
  if (!rung || !AUTHORITY_RUNGS.includes(rung)) {
    return fail('POSITION_INVALID', ['known-authority-rung-required'], { known: AUTHORITY_RUNGS });
  }
  if (rung === 'ENDORSED_COMMITMENT' && input?.stillEndorsed !== true) {
    return fail('POSITION_INVALID', ['commitment-must-be-currently-endorsed'], {
      claim,
      note: 'A commitment nobody currently endorses is a historical preference wearing a stronger word.'
    });
  }
  return {
    ok: true,
    status: 'POSITION_RECORDED',
    position: {
      rung,
      claim,
      rank: AUTHORITY_RUNGS.indexOf(rung),
      stillEndorsed: input?.stillEndorsed === true,
      supportingEvidence: [...new Set((Array.isArray(input?.supportingEvidence) ? input.supportingEvidence : [])
        .map(item => text(item, 240)).filter(Boolean))].sort()
    },
    businessEffectAuthority: 'NONE'
  };
}

/**
 * Resolves a disagreement by rank, and records what lost.
 *
 * Evidence is preserved and pointedly not weighed. A prediction with a hundred
 * corroborating observations and one with none occupy the same rung, because
 * the hierarchy is about what kind of thing something is, not how good an
 * instance of it happens to be. Letting strength promote a rung is precisely
 * the mechanism this file exists to prevent.
 */
export function resolve(positions = []) {
  const rows = (Array.isArray(positions) ? positions : [])
    .filter(row => row?.claim && AUTHORITY_RUNGS.includes(row?.rung))
    .map(row => ({ ...row, rank: AUTHORITY_RUNGS.indexOf(row.rung) }));

  if (rows.length === 0) return fail('RESOLUTION_INVALID', ['positions-required']);

  const sorted = [...rows].sort((a, b) => a.rank - b.rank || String(a.claim).localeCompare(String(b.claim)));
  const winner = sorted[0];
  const overridden = sorted.slice(1).filter(row => row.claim !== winner.claim);

  const present = rows.find(row => row.rung === 'PRESENT_CONSCIOUS_CHOICE') || null;
  const contradicted = present
    ? overridden.filter(row => row.claim !== present.claim)
    : [];

  return {
    ok: true,
    status: 'RESOLVED',
    decision: winner.claim,
    decidedBy: winner.rung,
    overridden: overridden.map(row => ({ rung: row.rung, claim: row.claim, evidenceCount: (row.supportingEvidence || []).length })),
    // The canonical case, named so it cannot be read as a fault.
    sovereigntyFunctioning: Boolean(present) && contradicted.length > 0,
    note: present && contradicted.length > 0
      ? 'Present choice was made against a better-supported lower rung. That is sovereignty functioning correctly, not a system error.'
      : null,
    law: 'RANK_DECIDES__EVIDENCE_STRENGTH_NEVER_PROMOTES_A_RUNG',
    businessEffectAuthority: 'NONE'
  };
}

/**
 * The drift check: has present choice been quietly outvoted over time?
 *
 * A single deferral is a decision. A pattern of them is a transfer, and the
 * transfer never announces itself, which is why it has to be counted rather
 * than noticed.
 */
export function deferralDrift(resolutions = [], { window = 10 } = {}) {
  const size = Number(window);
  if (!Number.isSafeInteger(size) || size < 2 || size > 1000) {
    return fail('DRIFT_INVALID', ['window-between-2-and-1000-required']);
  }

  const rows = (Array.isArray(resolutions) ? resolutions : [])
    .filter(row => row?.decidedBy && AUTHORITY_RUNGS.includes(row.decidedBy))
    .slice(-size);
  if (rows.length === 0) return fail('DRIFT_INVALID', ['resolutions-required']);

  // Only decisions where present choice was actually on the table can show drift.
  const contested = rows.filter(row => row.presentChoiceWasAvailable === true);
  const deferred = contested.filter(row => row.decidedBy !== 'PRESENT_CONSCIOUS_CHOICE');

  const byRung = {};
  for (const row of deferred) byRung[row.decidedBy] = (byRung[row.decidedBy] || 0) + 1;

  const drifting = contested.length >= 3 && deferred.length * 2 > contested.length;

  return {
    ok: true,
    status: drifting ? 'PRESENT_CHOICE_DRIFTING' : 'NO_DRIFT_DETECTED',
    considered: rows.length,
    contested: contested.length,
    deferred: deferred.length,
    deferredTo: byRung,
    drifting,
    law: 'A_SINGLE_DEFERRAL_IS_A_DECISION__A_PATTERN_OF_THEM_IS_A_TRANSFER_NOBODY_ANNOUNCED',
    // Reported to the person, never acted on. Acting on it would be the same
    // failure from the other direction.
    authorityBoundary: 'OBSERVATION_RETURNED_TO_MOHAMED__NOT_A_CORRECTION_APPLIED',
    businessEffectAuthority: 'NONE'
  };
}
