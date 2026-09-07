// The no-drop compiler: every canonical concept gets a row, or the build fails.
//
// UberBond's failure mode across a hundred sessions has never been losing code.
// It has been losing *concepts* -- an idea named once in a chat, donated by a
// superseded program, or buried in a list of 170, quietly dropping out of the
// project's own account of itself. The anti-forgetting law exists because that
// happened repeatedly.
//
// So this compiles a row for every item in every canonical source, and the state
// of each row is computed from repository evidence rather than asserted. UNKNOWN
// is a legal answer. Omission is not, and `compileCoverageMatrix` refuses to
// emit a matrix whose row count does not equal the extracted concept count.
//
// What a state means here is deliberately narrow. This module can see files,
// tests and a reachability partition. It cannot see whether anything works, and
// it never upgrades a row on the strength of a name matching a filename alone.
import { createHash } from 'node:crypto';

export const COVERAGE_MATRIX_VERSION = 'uberbond.sovereign-coverage-matrix.v1';

/** The only states a row may hold. Anything else fails the build. */
export const COVERAGE_STATES = Object.freeze([
  'VERIFIED_CURRENT',
  'PARTIAL_CURRENT',
  'DRAFT_DONOR',
  'SPEC_ONLY',
  'EXTERNAL_BLOCKED',
  'OWNER_BOUNDARY',
  'ELAPSED_TIME_REQUIRED',
  'SUPERSEDED_WITH_PRESERVED_DONATION',
  'UNKNOWN',
  // Terminal states for rows that are not awaiting implementation.
  //
  // SPEC_ONLY was doing two jobs and telling the reader neither: "nobody has
  // built this organ" and "this is a line of canon that was never a module".
  // 883 rows sat in it, and the mix made the number useless in both directions
  // -- it overstated the work remaining and hid the rows that genuinely are
  // unbuilt among rows that never could be.
  //
  // Each state below is granted by a verified rule, never by a class label
  // alone. That distinction is the whole safeguard: collapsing it is exactly
  // how a triage becomes a way to make an inconvenient number go away.
  'ENFORCED_BY_CODE',
  'STRUCTURAL_NOT_A_BUILD_TARGET',
  'COVERED_BY_PARENT_ORGAN',
  'REFERENCE_ONLY_BY_CANON',
  'HISTORICAL_DONOR_PRESERVED',
  'ALIAS_OF_CANONICAL_CONCEPT'
]);

/**
 * Chat-born names whose mechanism was later merged or renamed.
 *
 * Canon is explicit that these exist for literal searchability and are "not a
 * duplicate-implementation instruction". Recording them as unbuilt organs
 * invited exactly the duplicate build canon forbids -- 45 rows asking to be
 * implemented twice.
 */
export const ALIAS_CLASSES = Object.freeze(['ALIAS']);

/**
 * External gates, and which terminal state each produces.
 *
 * Reviewed and closed, because "blocked" is the most abusable label available:
 * anything unbuilt can be described as waiting on something. Every gate here
 * names a fact outside this repository that no amount of engineering closes.
 */
export const EXTERNAL_GATES = Object.freeze({
  HOST_RUNTIME_NOT_INSTALLED: 'EXTERNAL_BLOCKED',
  NO_PROVIDER_CREDENTIAL: 'EXTERNAL_BLOCKED',
  NO_CUSTOMER_EVIDENCE: 'EXTERNAL_BLOCKED',
  NO_CLEARED_PAYMENT: 'EXTERNAL_BLOCKED',
  NO_OBSERVED_LIFE_OUTCOME: 'EXTERNAL_BLOCKED',
  ELAPSED_TIME_NOT_YET_OBSERVED: 'ELAPSED_TIME_REQUIRED'
});

/**
 * Classes that are canon scaffolding rather than implementable units.
 *
 * A hierarchy node, an ontology domain and a loop stage are names canon uses to
 * arrange everything else. No module "implements WILL" or "implements
 * MOHAMED_CHOOSES", and recording them as unbuilt implied one should.
 *
 * Reviewed and closed. A class belongs here because building its rows would be
 * a category error -- not because its rows are inconvenient.
 */
export const STRUCTURAL_CLASSES = Object.freeze([
  'HIERARCHY', 'ONTOLOGY', 'LOOP_STAGE', 'STRATEGIC_STAGE'
]);

/**
 * Classes whose rows are fields of a larger organ rather than organs.
 *
 * `expected_regret` and `time_to_feedback` are outputs the decision packet
 * produces. They are covered when their parent is, and the parent is checked in
 * the same compile rather than declared -- so this cannot inherit coverage from
 * an organ that does not exist.
 */
export const FIELD_CLASSES = Object.freeze([
  'FORECAST_DIMENSION', 'FORECAST_OUTPUT', 'FORECAST_REQUIREMENT',
  'FORECAST_MECHANISM', 'CALIBRATION_FIELD', 'DECISION_PACKET_FIELD'
]);

/** Classes canon marks as lineage to keep discoverable, not as current work. */
export const DONOR_CLASSES = Object.freeze(['NAMED_INITIATIVE', 'ECONOMIC_DONOR']);

/** Classes canon forbids vendoring: mechanism references, never build targets. */
export const REFERENCE_CLASSES = Object.freeze(['REFERENCE_SURFACE']);

/** Classes eligible for ENFORCED_BY_CODE, given a verified declaration. */
export const LAW_CLASSES = Object.freeze(['AUTHORITY_LAW', 'TERMINAL_LAW']);

export const AUTHORITY_CLASSES = Object.freeze([
  'NONE', 'INTERNAL_ONLY', 'OWNER_ONLY', 'EXTERNAL_EFFECT_GATED'
]);

export const PRIVACY_CLASSES = Object.freeze([
  'PUBLIC_REPOSITORY_SAFE', 'PRIVATE_LIFE_DATA', 'SECRET_BEARING', 'PROVIDER_EVIDENCE'
]);

const text = (value, max = 400) => {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : (out ? out.slice(0, max) : '');
};

/** A stable id for a concept, so a row survives rewording of its source list. */
export function canonicalConceptId(source, name) {
  const slug = slugify(name);
  return `${source}:${slug || createHash('sha256').update(String(name)).digest('hex').slice(0, 12)}`;
}

export function slugify(name) {
  return String(name ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/**
 * The words a concept would plausibly appear under in a filename.
 *
 * Deliberately drops the connective vocabulary that would otherwise match
 * everything: a concept whose only distinctive token is "system" must not
 * collect evidence from every module with "system" in its name.
 */
const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'for', 'to', 'in', 'on', 'with', 'without',
  'system', 'systems', 'engine', 'layer', 'module', 'model', 'models', 'core',
  'kernel', 'protocol', 'law', 'laws', 'dimension', 'dimensions', 'is', 'not',
  'per', 'via', 'that', 'this', 'as', 'at', 'by', 'from', 'into', 'over', 'under'
]);

export function evidenceTokens(name) {
  return [...new Set(slugify(name).split('-').filter(token => token.length >= 4 && !STOPWORDS.has(token)))];
}

/**
 * The phrases a concept could be found under: the whole name, then its parts.
 *
 * Canon names a concept and its qualifier in one string -- "Mutation War and
 * independent verification", "Postal/free-first provider mesh and sender
 * infrastructure". Requiring every word matched nothing, so a shipped and
 * mutation-covered Mutation War read SPEC_ONLY.
 *
 * Splitting is what makes that findable, and is also exactly how a coverage
 * matrix becomes a fiction: "GENESIS for Life" contains "GENESIS", and treating
 * that as a hit would claim a life-domain organ exists because an unrelated
 * frontier engine does. So parts are only split on explicit conjunctions and
 * separators -- never on whitespace -- and a part-match is recorded as such and
 * can never reach VERIFIED_CURRENT. Part of a concept being present is a
 * different fact from the concept being present, and the row says which.
 */
export function evidencePhrases(name) {
  const whole = String(name ?? '').trim();
  const parts = whole
    .split(/\s+and\s+|\s*\/\s*|\s*,\s*|\s+plus\s+/i)
    .map(part => part.trim())
    .filter(part => part && part.toLowerCase() !== whole.toLowerCase() && evidenceTokens(part).length > 0);
  return { whole, parts: [...new Set(parts)] };
}

/**
 * What the repository can actually say about one concept.
 *
 * Conservative on purpose. A filename containing a concept's distinctive tokens
 * is a *lead*, not proof, and this is where a no-drop matrix would quietly
 * become a no-drop fiction: matching loosely turns 900 unimplemented ideas into
 * 900 green rows without anybody writing a line of code.
 */
export function locateEvidence(concept, repoIndex) {
  const { whole, parts } = evidencePhrases(concept.name);

  const search = phrase => {
    const tokens = evidenceTokens(phrase);
    if (tokens.length === 0) return null;
    const slug = slugify(phrase);
    const match = list => (list || []).filter(file => {
      const base = String(file).toLowerCase();
      return base.includes(slug) || tokens.every(token => base.includes(token));
    });
    const sources = match(repoIndex.sourceFiles);
    if (sources.length === 0) return null;
    return {
      sources,
      tests: match(repoIndex.testFiles),
      exact: sources.some(file => String(file).toLowerCase().includes(slug))
    };
  };

  if (evidenceTokens(whole).length === 0) {
    return { sources: [], tests: [], reachability: null, matchStrength: 'NO_DISTINCTIVE_TOKENS', matchScope: 'NONE', matchedPhrase: null };
  }

  let hit = search(whole);
  let scope = 'WHOLE_NAME';
  let phrase = whole;
  if (!hit) {
    for (const part of parts) {
      const partial = search(part);
      if (partial) { hit = partial; scope = 'SUB_PHRASE'; phrase = part; break; }
    }
  }

  if (!hit) {
    return { sources: [], tests: [], reachability: null, matchStrength: 'NO_MATCH', matchScope: 'NONE', matchedPhrase: null };
  }

  return {
    sources: hit.sources,
    tests: hit.tests,
    reachability: hit.sources.some(file => (repoIndex.productionReachable || []).includes(file)) ? 'PRODUCTION'
      : hit.sources.some(file => (repoIndex.operatorReachable || []).includes(file)) ? 'OPERATOR_ONLY'
        : 'CLASSIFIED_OR_UNREACHABLE',
    matchStrength: hit.exact ? 'EXACT_SLUG' : 'ALL_TOKENS',
    matchScope: scope,
    matchedPhrase: phrase
  };
}

/**
 * The state a row is entitled to, given what was found.
 *
 * The ladder only climbs on evidence that is actually about behaviour. Source
 * with no test is PARTIAL at best, because a module nothing exercises is a
 * module nobody has shown to work -- the same reason the reachability ratchet
 * exists. A declared boundary always wins over any amount of code, because an
 * owner decision or an absent provider is not something a file can satisfy.
 */
/**
 * Checks a declared concept-to-implementation mapping against the actual tree.
 *
 * The matcher above finds evidence by filename, which is right for names that
 * became modules and useless for the many that did not: `personal-civilization-core.mjs`
 * implements the Thought Ocean and the Life Event ledger without either phrase
 * appearing in its path. Without a way to say so, every such concept reads
 * SPEC_ONLY forever and the matrix can never record that anything got built.
 *
 * So a declaration is allowed -- and is verified rather than believed. It may
 * only supply *which files*; `classifyState` still decides what that is worth,
 * so a declaration with no test file lands on PARTIAL_CURRENT exactly as a
 * discovered one does. A declaration cannot invent a file, cannot name a
 * concept no source artifact mentions, and cannot skip the test requirement.
 *
 * Every problem fails the whole compile rather than downgrading one row. A
 * manifest that silently ignored its own rotted entries would be a slower way
 * of writing the states by hand.
 */
export function verifyImplementationManifest({ manifest = [], repoIndex = {}, conceptSlugs = new Set() } = {}) {
  const problems = [];
  const byConcept = new Map();
  const sourceFiles = new Set(repoIndex.sourceFiles || []);
  const testFiles = new Set(repoIndex.testFiles || []);

  for (const entry of (Array.isArray(manifest) ? manifest : [])) {
    const concept = text(entry?.concept);
    if (!concept) { problems.push({ reason: 'manifest-entry-concept-required', entry }); continue; }
    const slug = slugify(concept);

    // A renamed or removed concept must break loudly. The alternative is a
    // manifest that keeps asserting coverage for something the canon no longer
    // contains.
    if (!conceptSlugs.has(slug)) { problems.push({ reason: 'manifest-names-unknown-concept', concept }); continue; }

    const sources = [...new Set((Array.isArray(entry.sources) ? entry.sources : []).map(file => text(file)).filter(Boolean))];
    const tests = [...new Set((Array.isArray(entry.tests) ? entry.tests : []).map(file => text(file)).filter(Boolean))];
    if (sources.length === 0) { problems.push({ reason: 'manifest-entry-requires-source', concept }); continue; }

    const missing = [
      ...sources.filter(file => !sourceFiles.has(file)),
      ...tests.filter(file => !testFiles.has(file))
    ];
    if (missing.length) { problems.push({ reason: 'manifest-names-missing-files', concept, missing }); continue; }

    byConcept.set(slug, { concept, sources, tests, lane: text(entry.lane, 40) || null });
  }

  return { ok: problems.length === 0, problems, byConcept };
}

/**
 * Folds a verified declaration into discovered evidence.
 *
 * Union rather than replacement: a concept can be both named by a module and
 * declared by another, and losing either would understate what is there.
 */
export function mergeDeclaredEvidence(evidence, declared, repoIndex = {}) {
  if (!declared) return evidence;
  const sources = [...new Set([...declared.sources, ...(evidence?.sources || [])])];
  const tests = [...new Set([...declared.tests, ...(evidence?.tests || [])])];
  return {
    sources,
    tests,
    reachability: sources.some(file => (repoIndex.productionReachable || []).includes(file)) ? 'PRODUCTION'
      : sources.some(file => (repoIndex.operatorReachable || []).includes(file)) ? 'OPERATOR_ONLY'
        : 'CLASSIFIED_OR_UNREACHABLE',
    matchStrength: 'DECLARED_AND_VERIFIED',
    matchScope: 'WHOLE_NAME',
    matchedPhrase: declared.concept
  };
}

/**
 * Assigns a terminal state to a row that found no implementation evidence.
 *
 * Runs only after `classifyState` has returned SPEC_ONLY, so a row with real
 * evidence can never be reclassified into one of these -- the ordering is the
 * safeguard. A row that has a module is current; this is only about what a row
 * with no module actually is.
 *
 * `enforcement` and `parentStates` are supplied by the compiler from verified
 * facts, not by the concept describing itself.
 */
export function classifyTerminalState(concept, { enforcement = null, parentState = null, externalGate = null } = {}) {
  const cls = concept?.class;

  // A law is only enforced if something enforces it. The declaration names a
  // module and a test, both verified to exist before this is reached; without
  // one the law stays SPEC_ONLY, which for "Capability does not create
  // authority" would be the correct and alarming answer.
  if (LAW_CLASSES.includes(cls)) {
    return enforcement ? 'ENFORCED_BY_CODE' : 'SPEC_ONLY';
  }

  // A declared external gate, verified against the reviewed vocabulary before
  // it reaches here. Checked ahead of the class tables so a genuinely blocked
  // organ reports why rather than reporting as unbuilt work.
  if (externalGate && EXTERNAL_GATES[externalGate]) return EXTERNAL_GATES[externalGate];

  if (ALIAS_CLASSES.includes(cls)) return 'ALIAS_OF_CANONICAL_CONCEPT';
  if (STRUCTURAL_CLASSES.includes(cls)) return 'STRUCTURAL_NOT_A_BUILD_TARGET';
  if (REFERENCE_CLASSES.includes(cls)) return 'REFERENCE_ONLY_BY_CANON';
  if (DONOR_CLASSES.includes(cls)) return 'HISTORICAL_DONOR_PRESERVED';

  // A field is covered only when its parent organ actually is. Checked against
  // the compiled row rather than asserted, so a field cannot inherit coverage
  // from an organ nobody built.
  if (FIELD_CLASSES.includes(cls)) {
    return parentState === 'VERIFIED_CURRENT' || parentState === 'PARTIAL_CURRENT'
      ? 'COVERED_BY_PARENT_ORGAN'
      : 'SPEC_ONLY';
  }

  // Everything else -- CONCEPT, ORGAN, PERSONAL_CIVILIZATION_ORGAN,
  // CAPABILITY_ATOM and the rest -- is a genuine organ that nobody has built.
  // This is the residue the triage must not be able to shrink.
  return 'SPEC_ONLY';
}

export function classifyState(concept, evidence) {
  if (concept.declaredState && COVERAGE_STATES.includes(concept.declaredState)) return concept.declaredState;
  if (concept.class === 'BOUNDARY') return 'OWNER_BOUNDARY';
  if (concept.class === 'EXTERNAL_GATE') return 'EXTERNAL_BLOCKED';
  if (concept.class === 'ELAPSED_TIME') return 'ELAPSED_TIME_REQUIRED';

  if (!evidence || evidence.matchStrength === 'NO_DISTINCTIVE_TOKENS') return 'UNKNOWN';
  if (evidence.sources.length === 0) return 'SPEC_ONLY';
  if (evidence.tests.length === 0) return 'PARTIAL_CURRENT';
  // A sub-phrase match is capped here on purpose: finding "Postal" inside
  // "Postal/free-first provider mesh and sender infrastructure" says a
  // component exists, not the mesh.
  if (evidence.matchScope !== 'WHOLE_NAME') return 'PARTIAL_CURRENT';
  const strongMatch = evidence.matchStrength === 'EXACT_SLUG' || evidence.matchStrength === 'DECLARED_AND_VERIFIED';
  if (strongMatch && evidence.reachability && evidence.reachability !== 'CLASSIFIED_OR_UNREACHABLE') {
    return 'VERIFIED_CURRENT';
  }
  return 'PARTIAL_CURRENT';
}

/**
 * Compiles the matrix, and refuses to emit one that lost a concept.
 *
 * The count check is the whole guarantee. Everything else in this file is
 * judgement that a later session can improve; the invariant that no input
 * concept leaves without a row is the one that cannot be allowed to soften.
 */
export function compileCoverageMatrix({ concepts = [], repoIndex = {}, laneMap = {}, manifest = [], enforcement = [], externalGates = [], generatedAt = new Date().toISOString(), sourceCommit = null } = {}) {
  const reasonCodes = [];
  if (!Array.isArray(concepts) || concepts.length === 0) reasonCodes.push('concepts-required');
  if (reasonCodes.length) return { ok: false, status: 'COVERAGE_MATRIX_BLOCKED', reasonCodes };

  // Verified before any row is built, so a rotted declaration stops the matrix
  // instead of quietly producing one whose states nobody can trust.
  const conceptSlugs = new Set(concepts.map(concept => slugify(text(concept?.name))).filter(Boolean));
  const declarations = verifyImplementationManifest({ manifest, repoIndex, conceptSlugs });
  if (!declarations.ok) {
    return {
      ok: false,
      status: 'COVERAGE_MANIFEST_INVALID',
      reasonCodes: [...new Set(declarations.problems.map(problem => problem.reason))],
      problems: declarations.problems
    };
  }

  // Enforcement declarations, verified like the implementation manifest: an
  // entry naming a file that is not in the tree fails the compile rather than
  // silently granting a law the ENFORCED_BY_CODE state.
  const enforcementCheck = verifyImplementationManifest({ manifest: enforcement, repoIndex, conceptSlugs });
  if (!enforcementCheck.ok) {
    return {
      ok: false,
      status: 'COVERAGE_ENFORCEMENT_INVALID',
      reasonCodes: [...new Set(enforcementCheck.problems.map(problem => problem.reason))],
      problems: enforcementCheck.problems
    };
  }
  const enforcementByConcept = enforcementCheck.byConcept;

  // External-gate declarations. "Blocked" is the most abusable label available
  // -- anything unbuilt can be described as waiting on something -- so a gate
  // must come from the reviewed vocabulary and must name a concept some source
  // artifact actually states. Both are checked before any row is built.
  const gateByConcept = new Map();
  const gateProblems = [];
  for (const entry of (Array.isArray(externalGates) ? externalGates : [])) {
    const concept = text(entry?.concept);
    const gate = text(entry?.gate, 80);
    if (!concept) { gateProblems.push({ reason: 'gate-entry-concept-required', entry }); continue; }
    if (!conceptSlugs.has(slugify(concept))) { gateProblems.push({ reason: 'gate-names-unknown-concept', concept }); continue; }
    if (!EXTERNAL_GATES[gate]) { gateProblems.push({ reason: 'gate-not-in-reviewed-vocabulary', concept, gate }); continue; }
    if (!text(entry?.evidence, 2000)) { gateProblems.push({ reason: 'gate-requires-stated-evidence', concept }); continue; }
    gateByConcept.set(slugify(concept), gate);
  }
  if (gateProblems.length) {
    return {
      ok: false,
      status: 'COVERAGE_EXTERNAL_GATES_INVALID',
      reasonCodes: [...new Set(gateProblems.map(problem => problem.reason))],
      problems: gateProblems
    };
  }

  // First pass over evidence alone, so a field's parent state is a computed
  // fact rather than something the field asserts about itself.
  const parentStates = new Map();
  for (const concept of concepts) {
    const name = text(concept?.name);
    if (!name) continue;
    const evidence = mergeDeclaredEvidence(
      locateEvidence({ name, ...concept }, repoIndex),
      declarations.byConcept.get(slugify(name)),
      repoIndex
    );
    parentStates.set(slugify(name), classifyState({ name, ...concept }, evidence));
  }

  const seen = new Map();
  const rows = [];
  const duplicates = [];

  for (const concept of concepts) {
    const name = text(concept?.name);
    if (!name) { reasonCodes.push('concept-name-required'); continue; }
    const canonicalId = canonicalConceptId(concept.source, name);

    if (seen.has(canonicalId)) {
      // Not dropped and not double-counted: the same concept named by two
      // sources is one row that records both, which is what an alias list is
      // for. Silently keeping the first would lose the second's phrasing.
      const existing = seen.get(canonicalId);
      if (!existing.literalNames.includes(name)) existing.literalNames.push(name);
      if (!existing.sourceArtifacts.includes(concept.sourceArtifact)) existing.sourceArtifacts.push(concept.sourceArtifact);
      duplicates.push(canonicalId);
      continue;
    }

    const evidence = mergeDeclaredEvidence(
      locateEvidence({ name, ...concept }, repoIndex),
      declarations.byConcept.get(slugify(name)),
      repoIndex
    );
    // The manifest's declared lane wins where one exists. Without this the
    // field was inert decoration: every row took its lane from its concept
    // class, so the calibration ledger reported under OMEGA-14 and OMEGA-13
    // read as an empty lane while its organ was built and mutation-covered.
    const declaredLane = declarations.byConcept.get(slugify(name))?.lane || null;
    const lane = declaredLane || laneMap[concept.class] || laneMap[concept.source] || concept.owningLane || 'OMEGA-14';

    // Two passes, in this order. An organ with evidence is current; only a row
    // with no evidence at all reaches the terminal classifier. Reversing them
    // would let a class label overwrite real implementation evidence.
    const evidenceState = classifyState({ name, ...concept }, evidence);
    const currentState = evidenceState === 'SPEC_ONLY'
      ? classifyTerminalState({ name, ...concept }, {
        enforcement: enforcementByConcept.get(slugify(name)) || null,
        parentState: concept.parent ? parentStates.get(slugify(concept.parent)) || null : null,
        externalGate: gateByConcept.get(slugify(name)) || null
      })
      : evidenceState;

    const row = {
      canonicalId,
      literalNames: [name, ...(concept.aliases || [])].filter(Boolean),
      class: concept.class || 'CONCEPT',
      currentState,
      currentEvidence: {
        sourceModules: evidence.sources,
        testModules: evidence.tests,
        reachability: evidence.reachability,
        matchStrength: evidence.matchStrength,
        matchScope: evidence.matchScope,
        matchedPhrase: evidence.matchedPhrase,
        // Said in the row, not only in this file's header: a filename is not a
        // working feature, and a reader scanning states needs that on the row.
        boundary: 'FILE_AND_TEST_PRESENCE_IS_INTERNAL_EVIDENCE_NOT_PROOF_OF_BEHAVIOUR_OR_EXTERNAL_OUTCOME'
      },
      targetModule: concept.targetModule || (evidence.sources[0] || null),
      owningLane: lane,
      dependencies: concept.dependencies || [],
      authorityClass: concept.authorityClass || 'NONE',
      privacyClass: concept.privacyClass || 'PUBLIC_REPOSITORY_SAFE',
      testsRequired: concept.testsRequired ?? (evidence.tests.length === 0),
      realityEvidenceRequired: concept.realityEvidenceRequired ?? false,
      supersedes: concept.supersedes || null,
      supersededBy: concept.supersededBy || null,
      disposition: concept.disposition || 'CARRY_FORWARD',
      sourceArtifacts: [concept.sourceArtifact].filter(Boolean)
    };
    seen.set(canonicalId, row);
    rows.push(row);
  }

  const named = concepts.filter(concept => text(concept?.name)).length;
  const accounted = rows.length + duplicates.length;
  if (accounted !== named) {
    // The one failure this file exists to make impossible.
    //
    // Deliberately not mutation-covered, and this note is why. No input can
    // currently reach it: every named concept becomes a row or a merge, and an
    // unnamed one is excluded from both sides of the comparison. A mutation
    // removing it therefore survives every test -- unfalsifiable rather than
    // untested, the same shape as a redundant guard. It stays because it is the
    // backstop for a future extractor that grows a third path, and the day that
    // path drops a concept this is what refuses to emit the matrix.
    return {
      ok: false,
      status: 'COVERAGE_MATRIX_DROPPED_CONCEPTS',
      reasonCodes: ['concept-count-mismatch'],
      extracted: named,
      accounted
    };
  }

  const byState = {};
  for (const state of COVERAGE_STATES) byState[state] = rows.filter(row => row.currentState === state).length;
  const byLane = {};
  for (const row of rows) byLane[row.owningLane] = (byLane[row.owningLane] || 0) + 1;

  return {
    ok: true,
    status: 'COVERAGE_MATRIX_COMPILED',
    schemaVersion: COVERAGE_MATRIX_VERSION,
    generatedAt,
    sourceCommit,
    counts: {
      extractedConcepts: named,
      rows: rows.length,
      mergedAliasRows: duplicates.length,
      declaredConcepts: declarations.byConcept.size,
      byState,
      byLane
    },
    rows,
    truthBoundary: 'A ROW IS AN ACCOUNT OF WHAT THE REPOSITORY CONTAINS. IT IS NOT PROOF THAT ANY CONCEPT WORKS, IS REACHED AT RUNTIME, OR HAS EXTERNAL EVIDENCE.',
    // Stated so nobody reads SPEC_ONLY as a finding. The matcher is deliberately
    // biased toward under-claiming: it will not split a name on whitespace,
    // because "GENESIS for Life" contains "GENESIS" and a matrix that scored
    // that as partially built would be inventing a life-domain organ out of an
    // unrelated frontier engine. The cost is real: "Event Horizon capital
    // allocation" reads SPEC_ONLY while src/event-horizon.mjs exists. An
    // under-claimed row is a lead for a human; an over-claimed one is a lie
    // that compounds.
    matcherBias: 'CONSERVATIVE__SPEC_ONLY_MAY_UNDERSTATE_EXISTING_IMPLEMENTATION__NEVER_OVERSTATES',
    businessEffectAuthority: 'NONE'
  };
}
