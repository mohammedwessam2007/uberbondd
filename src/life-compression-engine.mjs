// Turning many facts into a few principles, without the principle eating the
// facts that refute it.
//
// Compression is the useful half of understanding and the easy half to fake.
// A principle that explains ninety cases looks stronger than one explaining
// twenty -- right up until you ask what happened to the cases it could not
// explain. If nobody looked, the ratio measured the search, not the world. If
// somebody looked and the exceptions were folded in as "special cases", the
// principle has been made unfalsifiable, which is worse than wrong because it
// can no longer be corrected by reality.
//
// So the rules here are about what a principle owes, not how much it saves:
//
//   a principle that was never attacked is unfalsified, never compressed
//   a decisive counterexample breaks a principle; it is not absorbed by it
//   the raw facts stay addressable, so the compression is never the only copy
//
// Simplicity that destroys truth is not intelligence. The canon says it; this
// module is what saying it costs.
export const LIFE_COMPRESSION_ENGINE_VERSION = 'uberbond.life-compression-engine.v1';

/** What a candidate principle currently is. Ordered by how much it has survived. */
export const PRINCIPLE_STATES = Object.freeze([
  'UNFALSIFIED_NOT_PROVEN',  // nobody has looked for counterexamples
  'BROKEN_BY_COUNTEREXAMPLE',
  'COMPRESSED_WITH_EXCEPTIONS',
  'COMPRESSED'
]);

/** How a counterexample relates to the principle it was tested against. */
export const COUNTEREXAMPLE_VERDICTS = Object.freeze([
  'DECISIVE',        // the principle predicts the opposite; it is broken
  'BOUNDED_EXCEPTION', // outside a stated boundary condition the principle already declares
  'EXPLAINED'        // the principle does account for it
]);

const text = (value, max = 2000) => {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
};

const fail = (status, reasonCodes, extra = {}) => ({
  ok: false, status, reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
  businessEffectAuthority: 'NONE', ...extra
});

/**
 * A fact, kept addressable so a principle can never become its only record.
 *
 * `ref` is the pointer back to wherever the fact actually lives. It is
 * required for the same reason the abstraction-debt organ exists: a summary
 * that cannot be unwound is a summary nobody can check.
 */
export function fact(input = {}) {
  const statement = text(input?.statement, 2000);
  const ref = text(input?.ref, 480);
  if (!statement) return fail('FACT_INVALID', ['fact-statement-required']);
  if (!ref) return fail('FACT_INVALID', ['fact-source-ref-required'], {
    note: 'A fact with no pointer back to its source makes the compression the only surviving copy.'
  });
  return {
    ok: true,
    status: 'FACT_RECORDED',
    fact: { statement, ref, domain: text(input?.domain, 120) || null },
    businessEffectAuthority: 'NONE'
  };
}

/**
 * Attempts a compression, and refuses to call it one until it has been attacked.
 *
 * The counterexample list is not optional and an empty one is not a pass. A
 * principle nobody tried to break is exactly as informative as the effort
 * spent breaking it, which is zero.
 */
export function compress({ principle = null, explains = [], counterexamplesExamined = [], boundaryConditions = [] } = {}) {
  const claim = text(principle, 2000);
  if (!claim) return fail('COMPRESSION_INVALID', ['principle-statement-required']);

  const facts = (Array.isArray(explains) ? explains : []).filter(row => row?.statement && row?.ref);
  if (facts.length === 0) {
    return fail('COMPRESSION_INVALID', ['principle-must-explain-addressable-facts'], {
      note: 'Facts must carry a source ref, so the principle never becomes the only copy of what it summarises.'
    });
  }

  const bounds = [...new Set((Array.isArray(boundaryConditions) ? boundaryConditions : [])
    .map(item => text(item, 480)).filter(Boolean))].sort();

  const examined = [];
  for (const row of (Array.isArray(counterexamplesExamined) ? counterexamplesExamined : [])) {
    const statement = text(row?.statement, 2000);
    const ref = text(row?.ref, 480);
    const verdict = text(row?.verdict, 40);
    if (!statement || !ref) {
      return fail('COMPRESSION_INVALID', ['counterexample-requires-statement-and-ref']);
    }
    if (!verdict || !COUNTEREXAMPLE_VERDICTS.includes(verdict)) {
      return fail('COMPRESSION_INVALID', ['counterexample-verdict-required'], { known: COUNTEREXAMPLE_VERDICTS });
    }
    // A bounded exception is only bounded if the boundary was declared. Without
    // that, "bounded exception" is how a decisive counterexample gets absorbed.
    const boundary = text(row?.boundary, 480);
    if (verdict === 'BOUNDED_EXCEPTION') {
      if (!boundary) {
        return fail('COMPRESSION_INVALID', ['bounded-exception-requires-declared-boundary'], {
          counterexample: statement,
          note: 'Without a boundary the principle already declares, "bounded exception" is how a decisive counterexample gets absorbed.'
        });
      }
      if (!bounds.includes(boundary)) {
        return fail('COMPRESSION_INVALID', ['bounded-exception-boundary-not-declared'], {
          counterexample: statement,
          boundary,
          declaredBoundaries: bounds,
          note: 'A boundary invented to fit one counterexample is not a boundary condition, it is an excuse.'
        });
      }
    }
    examined.push({ statement, ref, verdict, boundary: boundary || null });
  }

  if (examined.length === 0) {
    return {
      ok: true,
      status: 'COMPRESSION_UNFALSIFIED',
      principle: claim,
      state: 'UNFALSIFIED_NOT_PROVEN',
      explainsCount: facts.length,
      counterexamplesExamined: [],
      law: 'A_PRINCIPLE_NOBODY_TRIED_TO_BREAK_CARRIES_THE_INFORMATION_OF_THAT_EFFORT__WHICH_IS_NONE',
      businessEffectAuthority: 'NONE'
    };
  }

  const decisive = examined.filter(row => row.verdict === 'DECISIVE');
  if (decisive.length > 0) {
    return {
      ok: true,
      status: 'COMPRESSION_BROKEN',
      principle: claim,
      state: 'BROKEN_BY_COUNTEREXAMPLE',
      explainsCount: facts.length,
      decisiveCounterexamples: decisive,
      counterexamplesExamined: examined,
      // Stated because the ratio is the temptation: ninety explained facts do
      // not outvote one case the principle predicts backwards.
      law: 'EXPLANATORY_REACH_NEVER_OUTRANKS_A_DECISIVE_COUNTEREXAMPLE',
      businessEffectAuthority: 'NONE'
    };
  }

  const exceptions = examined.filter(row => row.verdict === 'BOUNDED_EXCEPTION');
  return {
    ok: true,
    status: 'COMPRESSION_ACCEPTED',
    principle: claim,
    state: exceptions.length > 0 ? 'COMPRESSED_WITH_EXCEPTIONS' : 'COMPRESSED',
    explainsCount: facts.length,
    boundaryConditions: bounds,
    exceptions,
    counterexamplesExamined: examined,
    // The pointers survive the compression on purpose.
    factRefs: [...new Set(facts.map(row => row.ref))].sort(),
    businessEffectAuthority: 'NONE'
  };
}

/**
 * What the compression dropped, and whether that matters for a given decision.
 *
 * The compression ratio is reported and explicitly disclaimed. It is the
 * number a reader reaches for and the one that means least: dropping more is
 * only better when nothing dropped was load-bearing.
 */
export function compressionDebt({ compressed = null, dropped = [], decisionDependsOn = [] } = {}) {
  const claim = text(compressed, 2000);
  if (!claim) return fail('COMPRESSION_DEBT_INVALID', ['compressed-claim-required']);

  const lost = [...new Set((Array.isArray(dropped) ? dropped : []).map(item => text(item, 480)).filter(Boolean))];
  const needed = [...new Set((Array.isArray(decisionDependsOn) ? decisionDependsOn : []).map(item => text(item, 480)).filter(Boolean))];
  const loadBearing = lost.filter(item => needed.includes(item)).sort();

  return {
    ok: true,
    status: loadBearing.length ? 'COMPRESSION_DEBT_BLOCKING' : 'COMPRESSION_DEBT_ACCEPTABLE',
    compressed: claim,
    dropped: lost.sort(),
    loadBearingLoss: loadBearing,
    // Reported and disclaimed in the same object so they cannot be separated.
    droppedCount: lost.length,
    ratioBoundary: 'DROPPING_MORE_IS_ONLY_BETTER_WHEN_NOTHING_DROPPED_WAS_LOAD_BEARING',
    requiredAction: loadBearing.length ? 'RETURN_TO_RAW_EVIDENCE_BEFORE_DECIDING' : 'COMPRESSION_MAY_BE_USED_FOR_THIS_DECISION',
    businessEffectAuthority: 'NONE'
  };
}
