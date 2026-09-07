// Searching for the questions nobody knew to ask, which is harder than it sounds
// because the search is run by the thing with the blind spot.
//
// The frontier module already builds an agenda: hand it anomalies and it attaches
// research questions to each. That is useful and it is not this. Attaching
// questions to observations you already flagged finds known unknowns -- things
// you know you do not know. The unknown unknown is the one nothing in the
// current vocabulary made expressible, and it does not arrive labelled.
//
// Three ways it can be reached, and all three are about structure rather than
// about any single observation:
//
//   an anomaly an existing model explains is a known unknown, and is excluded
//   surprise from one source is a fact about that source, not about the world
//   an expected thing that is absent is evidence, and only if the expectation was stated
//
// The last is the negative-space case and it is the one that needs the
// discipline. Declaring afterwards that you always expected the missing thing
// is unfalsifiable; the expectation has to exist before the look.
//
// And the honest ending: this search runs inside a set of sources, and those
// sources have a shape. A domain none of them can observe produces silence that
// reads exactly like absence. That silence is reported as a limit of the search,
// never as a finding about the world, because "we looked and found nothing" and
// "we could not have seen it" are different sentences.
export const UNKNOWN_UNKNOWN_MINING_VERSION = 'uberbond.unknown-unknown-mining.v1';

/** What an observation turned out to be, once it was checked against what is known. */
export const OBSERVATION_VERDICTS = Object.freeze([
  'EXPLAINED_BY_EXISTING_MODEL',   // not an unknown at all
  'KNOWN_UNKNOWN',                 // a question already being asked
  'RESISTS_EXPLANATION'            // nothing accounts for it
]);

/** How a candidate question was reached. */
export const DISCOVERY_ROUTES = Object.freeze([
  'CROSS_SOURCE_STRUCTURE',   // resistant observations from independent sources
  'DECLARED_ABSENCE',         // something expected beforehand that is not there
  'CONCEPT_PRESSURE'          // the vocabulary itself could not express the question
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
 * An observation, tagged with the source that produced it and what is known about it.
 *
 * The source is mandatory because the whole cross-source rule depends on it, and
 * an observation with no source cannot be told apart from the same observation
 * counted twice.
 */
export function observation(input = {}) {
  const statement = text(input?.statement, 2000);
  const source = text(input?.source, 240);
  const verdict = text(input?.verdict, 40);
  if (!statement) return fail('OBSERVATION_INVALID', ['observation-statement-required']);
  if (!source) return fail('OBSERVATION_INVALID', ['observation-source-required'], {
    note: 'Without a source, one observation counted twice is indistinguishable from two independent observations.'
  });
  if (!verdict || !OBSERVATION_VERDICTS.includes(verdict)) {
    return fail('OBSERVATION_INVALID', ['known-verdict-required'], { known: OBSERVATION_VERDICTS });
  }
  return {
    ok: true,
    status: 'OBSERVATION_RECORDED',
    observation: { statement, source, verdict, domain: text(input?.domain, 120) || null },
    businessEffectAuthority: 'NONE'
  };
}

/**
 * An expectation, recorded before the look.
 *
 * This is the whole falsifiability of the negative-space route. An expectation
 * declared after noticing the gap explains anything, which is another way of
 * saying it explains nothing.
 */
export function expectation(input = {}) {
  const expected = text(input?.expected, 2000);
  const declaredAt = text(input?.declaredAt, 64);
  const because = text(input?.because, 480);
  if (!expected) return fail('EXPECTATION_INVALID', ['expected-thing-required']);
  if (!declaredAt) return fail('EXPECTATION_INVALID', ['declared-at-required'], {
    note: 'An expectation with no time cannot be shown to predate the gap it explains.'
  });
  if (!because) return fail('EXPECTATION_INVALID', ['reason-for-expecting-required'], {
    note: 'An expectation with no stated reason is a description of the gap wearing the word "expected".'
  });
  return {
    ok: true,
    status: 'EXPECTATION_RECORDED',
    expectation: { expected, declaredAt, because, domain: text(input?.domain, 120) || null },
    businessEffectAuthority: 'NONE'
  };
}

/**
 * Mines structure across observations. Returns questions, never findings.
 *
 * Two filters run before anything is surfaced, and both discard material that
 * looks like signal:
 *
 * Explained and known-unknown observations are dropped. They are the ones the
 * system is already handling, and letting them through would make the output a
 * restatement of the current agenda.
 *
 * A resistant observation appearing under one source is dropped too. Repeated
 * surprise from a single instrument is the classic reading of a broken
 * instrument, and promoting it produces a confident question about a mechanism
 * that does not exist.
 */
export function mine({ observations = [], expectations = [], observedDomains = [], sourceCoverage = {} } = {}) {
  const rows = (Array.isArray(observations) ? observations : [])
    .filter(row => row?.statement && row?.source && OBSERVATION_VERDICTS.includes(row?.verdict));

  const resistant = rows.filter(row => row.verdict === 'RESISTS_EXPLANATION');
  const alreadyHandled = rows.filter(row => row.verdict !== 'RESISTS_EXPLANATION');

  // Group resistant observations by domain and count independent sources.
  const byDomain = new Map();
  for (const row of resistant) {
    const key = row.domain || '__UNDOMAINED__';
    if (!byDomain.has(key)) byDomain.set(key, { sources: new Set(), statements: [] });
    const entry = byDomain.get(key);
    entry.sources.add(row.source);
    entry.statements.push(row.statement);
  }

  const questions = [];
  const singleSourceOnly = [];
  for (const [domain, entry] of [...byDomain.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const record = {
      route: 'CROSS_SOURCE_STRUCTURE',
      domain: domain === '__UNDOMAINED__' ? null : domain,
      independentSources: entry.sources.size,
      observations: [...new Set(entry.statements)].sort(),
      question: 'WHAT_MECHANISM_WOULD_MAKE_THESE_INDEPENDENT_OBSERVATIONS_THE_SAME_PHENOMENON'
    };
    if (entry.sources.size >= 2) questions.push(record);
    else singleSourceOnly.push({ ...record, question: 'IS_THIS_SOURCE_MISREPORTING' });
  }

  // Negative space: expectations declared beforehand with nothing observed.
  const observedText = new Set(rows.map(row => row.statement.toLowerCase()));
  const absences = (Array.isArray(expectations) ? expectations : [])
    .filter(row => row?.expected && row?.declaredAt && row?.because)
    .filter(row => !observedText.has(String(row.expected).toLowerCase()))
    .map(row => ({
      route: 'DECLARED_ABSENCE',
      expected: row.expected,
      because: row.because,
      declaredAt: row.declaredAt,
      question: 'WHY_IS_THE_EXPECTED_THING_ABSENT_AND_WHAT_WOULD_ITS_ABSENCE_IMPLY'
    }))
    .sort((a, b) => a.expected.localeCompare(b.expected));

  // The shape of the search itself. A domain no source covers produces silence
  // that reads exactly like absence.
  const covered = new Set();
  for (const domains of Object.values(sourceCoverage || {})) {
    for (const domain of (Array.isArray(domains) ? domains : [])) {
      const key = text(domain, 120);
      if (key) covered.add(key);
    }
  }
  const unobservable = [...new Set((Array.isArray(observedDomains) ? observedDomains : [])
    .map(item => text(item, 120)).filter(item => item && !covered.has(item)))].sort();

  return {
    ok: true,
    status: 'UNKNOWN_UNKNOWN_MINED',
    questions: [...questions, ...absences],
    singleSourceOnly,
    excludedAsAlreadyKnown: alreadyHandled.map(row => ({ statement: row.statement, verdict: row.verdict })),
    blindSpots: unobservable,
    blindSpotLaw: unobservable.length
      ? 'SILENCE_IN_AN_UNOBSERVED_DOMAIN_IS_A_LIMIT_OF_THE_SEARCH__NOT_A_FINDING_ABOUT_THE_WORLD'
      : 'EVERY_DECLARED_DOMAIN_HAD_AT_LEAST_ONE_SOURCE__WHICH_IS_NOT_THE_SAME_AS_ADEQUATE_COVERAGE',
    crossSourceLaw: 'REPEATED_SURPRISE_FROM_ONE_SOURCE_IS_A_FACT_ABOUT_THAT_SOURCE',
    outputBoundary: 'THESE_ARE_QUESTIONS__NOT_FINDINGS__NOT_EVIDENCE_OF_A_MECHANISM',
    businessEffectAuthority: 'NONE'
  };
}

/**
 * The vocabulary check: questions the current concepts cannot express.
 *
 * This is the route that most resembles the thing being hunted. If a phenomenon
 * can only be described by negation -- "it is not any of the categories we have"
 * -- then the categories are the constraint, and the honest output is an
 * Ontogenesis candidate rather than a forced fit into a box that distorts it.
 */
export function conceptPressure({ phenomenon = null, existingCategories = [], fitsAny = null, distortionIfForced = null } = {}) {
  const name = text(phenomenon, 2000);
  if (!name) return fail('CONCEPT_PRESSURE_INVALID', ['phenomenon-required']);

  const categories = [...new Set((Array.isArray(existingCategories) ? existingCategories : [])
    .map(item => text(item, 240)).filter(Boolean))].sort();
  if (categories.length === 0) {
    return fail('CONCEPT_PRESSURE_INVALID', ['existing-categories-required'], {
      note: 'A phenomenon that fits no category is only interesting once the categories it was tried against are named.'
    });
  }

  if (fitsAny !== false) {
    return {
      ok: true,
      status: 'NO_CONCEPT_PRESSURE',
      phenomenon: name,
      triedAgainst: categories,
      law: 'A_PHENOMENON_THAT_FITS_AN_EXISTING_CATEGORY_IS_NOT_EVIDENCE_THE_ONTOLOGY_IS_WRONG',
      businessEffectAuthority: 'NONE'
    };
  }

  const distortion = text(distortionIfForced, 480);
  if (!distortion) {
    return fail('CONCEPT_PRESSURE_INVALID', ['distortion-required'], {
      phenomenon: name,
      note: 'Claiming the ontology fails requires saying what is lost by forcing the fit. Without that, "new category" is a preference.'
    });
  }

  return {
    ok: true,
    status: 'CONCEPT_PRESSURE_DETECTED',
    phenomenon: name,
    triedAgainst: categories,
    distortionIfForced: distortion,
    route: 'CONCEPT_PRESSURE',
    question: 'WHAT_CATEGORY_WOULD_REPRESENT_THIS_WITHOUT_DISTORTION_AND_WHAT_WOULD_FALSIFY_IT',
    // Handed on rather than acted on. Creating a category to escape a
    // falsification is the failure Ontogenesis is explicitly not for.
    handoff: 'ONTOGENESIS_CANDIDATE__NOT_AN_ONTOLOGY_CHANGE',
    businessEffectAuthority: 'NONE'
  };
}
