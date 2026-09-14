// Reconciles a founder directive against the organism that already exists.
//
// A directive arrives as prose in a session: hundreds of numbered requirements,
// most of which UberBond already satisfies under different names. The failure
// mode is not forgetting it -- it is *rebuilding* it, because whichever model
// reads the directive next has no way to tell which sections are already
// standing machinery and which are genuinely unmet. That is how a repository
// acquires a second capability genome, a second reality bus, a second memory
// stratification, each one a sincere answer to a requirement that was already
// covered.
//
// So this compiles a row per section and computes each row's state from
// evidence, reusing the coverage matrix's evidence locator rather than growing
// a second one. MISSING is a legal answer and so is BLOCKED; what is not legal
// is a section leaving without a row, or a state that nothing in the tree
// supports.
//
// It ranks unmet sections by how often the rest of the corpus refers to them,
// which is a real quantity read off the directive itself. It does not score
// them, estimate their cost, or emit a percentage. The directive is explicit
// that a number nobody can derive is theater.
import { createHash } from 'node:crypto';
import { locateEvidence, evidenceTokens, slugify } from './sovereign-coverage-matrix.mjs';
import { ZERO_CONSEQUENCE_EFFECTS } from './effect-ledgers.mjs';

export const FOUNDER_DIRECTIVE_RECONCILER_VERSION = 'uberbond.founder-directive-reconciler.v1';

/** The only states a reconciled row may hold. Anything else fails the compile. */
export const DIRECTIVE_STATES = Object.freeze([
  'VERIFIED_CURRENT',
  'PARTIAL',
  'DONOR_ONLY',
  'MISSING',
  'BLOCKED',
  'NOT_CURRENTLY_JUSTIFIED'
]);

/** Section classes a directive corpus may declare. */
export const DIRECTIVE_CLASSES = Object.freeze([
  'MISSION', 'LAW', 'ORGAN', 'MECHANISM', 'PROCESS',
  'ONTOLOGY', 'BOUNDARY', 'EXTERNAL_GATE', 'MILESTONE', 'RESEARCH_QUESTION'
]);

/**
 * Classes that are terminal by what they *are*, not by what was built.
 *
 * A mission statement, a vocabulary and an open research question are not
 * modules anybody can finish, and counting them as unbuilt work inflates the
 * backlog with rows that can never close. They are terminal here for the same
 * reason the coverage matrix refuses to let a filename promote an ontology
 * domain: the category is the answer.
 */
const NOT_BUILD_TARGET_CLASSES = Object.freeze(['MISSION', 'ONTOLOGY', 'RESEARCH_QUESTION']);

/** Classes no amount of repository evidence can satisfy. */
const BOUNDARY_CLASSES = Object.freeze(['BOUNDARY', 'EXTERNAL_GATE']);

/** Classes whose state must come from executable evidence. */
const BUILD_TARGET_CLASSES = Object.freeze(['ORGAN', 'MECHANISM', 'LAW', 'PROCESS']);

const STRONG_MATCHES = new Set(['EXACT_SLUG', 'DECLARED_AND_VERIFIED']);
const LIVE_REACHABILITY = new Set(['PRODUCTION', 'OPERATOR_ONLY']);

const text = (value, max = 4000) => {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
};

function refuse(reasonCodes, extra = {}) {
  return {
    ok: false,
    version: FOUNDER_DIRECTIVE_RECONCILER_VERSION,
    status: 'FOUNDER_DIRECTIVE_RECONCILIATION_REFUSED',
    reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
    businessEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO_CONSEQUENCE_EFFECTS },
    ...extra
  };
}

/**
 * Canonical concepts whose name matches this section.
 *
 * Deliberately narrow. The coverage matrix already decided what each canonical
 * concept is worth; this only asks whether the section is *talking about* one,
 * by requiring the concept's distinctive tokens to be a subset of the section's
 * own. A looser join is what turns "this directive is already covered" into a
 * sentence nobody checked -- every section contains ordinary words, and an
 * overlap-of-one match would quietly mark the whole corpus green.
 */
export function matchCanonicalConcepts(section, canonicalRows) {
  const sectionTokens = new Set([
    ...evidenceTokens(section.title || ''),
    ...evidenceTokens(section.requirement || '')
  ]);
  if (sectionTokens.size === 0) return [];

  const titleSlug = slugify(section.title || '');
  const matches = [];
  for (const row of canonicalRows || []) {
    // Compiled rows carry the concept's literal names, not a `name` field. The
    // canonicalId is a slug with a source prefix and is not a concept name --
    // reading it as one matches nothing and silently reports the whole corpus
    // as unbuilt.
    const names = Array.isArray(row?.literalNames) && row.literalNames.length
      ? row.literalNames
      : [row?.name].filter(Boolean);
    for (const raw of names) {
      const name = text(raw, 400);
      if (!name) continue;
      const conceptTokens = evidenceTokens(name);
      if (conceptTokens.length === 0) continue;
      const covered = conceptTokens.every(token => sectionTokens.has(token));
      if (!covered) continue;
      // One shared ordinary token is a coincidence, not a concept match. Require
      // either a multi-token concept or an exact title hit.
      const exactTitle = slugify(name) === titleSlug;
      if (conceptTokens.length < 2 && !exactTitle) continue;
      matches.push({
        canonicalId: String(row.canonicalId || ''),
        name,
        coverageState: String(row.currentState || 'UNKNOWN'),
        exactTitle
      });
      break;
    }
  }
  return matches;
}

/**
 * The state a section is entitled to, given class, canonical coverage and tree
 * evidence.
 *
 * The ladder only climbs on evidence about behaviour, which is the same rule
 * the coverage matrix applies and for the same reason: a module nothing
 * exercises is a module nobody has shown to work. A canonical concept can lift
 * a row only as high as that concept itself was independently rated.
 */
export function classifyDirectiveState(section, { evidence = null, canonicalMatches = [], declaredTerminal = null, milestoneReceipt = null } = {}) {
  const cls = String(section?.class || '');

  // A reviewed terminal declaration, verified by the caller before it arrives
  // here. It may only mark a row as deliberately-not-built; it can never mark
  // one as built.
  if (declaredTerminal === 'NOT_CURRENTLY_JUSTIFIED') return 'NOT_CURRENTLY_JUSTIFIED';

  if (NOT_BUILD_TARGET_CLASSES.includes(cls)) return 'NOT_CURRENTLY_JUSTIFIED';
  if (BOUNDARY_CLASSES.includes(cls)) return 'BLOCKED';

  // A milestone is an evidence gate. Without a receipt it is blocked, and a
  // receipt is supplied and verified by the caller -- never inferred from a
  // filename, because "we have a module named after the milestone" is exactly
  // the claim the milestone exists to refuse.
  if (cls === 'MILESTONE') return milestoneReceipt ? 'VERIFIED_CURRENT' : 'BLOCKED';

  const strongestCanonical = canonicalMatches.find(match => match.coverageState === 'VERIFIED_CURRENT');
  const anyCanonical = canonicalMatches.length > 0;

  const hasSources = Boolean(evidence?.sources?.length);
  const hasTests = Boolean(evidence?.tests?.length);
  const wholeName = evidence?.matchScope === 'WHOLE_NAME';
  const strong = STRONG_MATCHES.has(evidence?.matchStrength);
  const live = LIVE_REACHABILITY.has(evidence?.reachability);

  if (hasSources && hasTests && wholeName && strong && live) return 'VERIFIED_CURRENT';
  if (strongestCanonical) return 'VERIFIED_CURRENT';
  if (hasSources) return 'PARTIAL';
  if (anyCanonical) return 'PARTIAL';

  // Named in canon somewhere but with nothing executable behind it. The
  // directive calls this donor-only, and it is a different fact from nobody
  // having thought of it.
  if (section?.canonPresence) return 'DONOR_ONLY';

  return 'MISSING';
}

/**
 * How many other sections of the same corpus refer to this one.
 *
 * This is the leverage signal, and it is deliberately the only one: it is read
 * off the directive the founder actually wrote, so it can be recomputed and
 * disagreed with. Estimating implementation cost or an unlock percentage here
 * would be inventing a number from nothing, which the corpus itself names as a
 * failure mode.
 */
export function corpusReferenceCounts(sections) {
  const tokenSets = sections.map(section => new Set([
    ...evidenceTokens(section.title || ''),
    ...evidenceTokens(section.requirement || '')
  ]));
  const counts = new Map();
  sections.forEach((section, index) => {
    const own = evidenceTokens(section.title || '');
    if (own.length === 0) { counts.set(section.sectionId, 0); return; }
    let referenced = 0;
    tokenSets.forEach((other, otherIndex) => {
      if (otherIndex === index) return;
      if (own.every(token => other.has(token))) referenced += 1;
    });
    counts.set(section.sectionId, referenced);
  });
  return counts;
}

/**
 * Compiles the reconciliation, and refuses to emit one that lost a section.
 *
 * The count check is the whole guarantee, exactly as it is for the coverage
 * matrix. Every judgement above can be improved by a later session; a section
 * silently leaving without a row is the one failure that must stay impossible.
 */
export function reconcileFounderDirective({
  directive = null,
  repoIndex = {},
  canonicalRows = [],
  terminalDeclarations = [],
  milestoneReceipts = [],
  generatedAt = new Date().toISOString(),
  sourceCommit = null
} = {}) {
  const sections = Array.isArray(directive?.sections) ? directive.sections : null;
  if (!sections || sections.length === 0) return refuse(['directive-sections-required']);

  const reasonCodes = [];
  const seen = new Set();
  for (const section of sections) {
    const id = text(section?.sectionId, 300);
    if (!id) reasonCodes.push('every-section-needs-a-section-id');
    else if (seen.has(id)) reasonCodes.push(`duplicate-section-id:${id}`);
    else seen.add(id);
    if (!DIRECTIVE_CLASSES.includes(String(section?.class || ''))) {
      reasonCodes.push(`unrecognized-section-class:${id || '<unidentified>'}`);
    }
    if (!text(section?.requirement, 4000)) reasonCodes.push(`section-requirement-required:${id || '<unidentified>'}`);
  }
  if (Number.isInteger(directive?.sectionCount) && directive.sectionCount !== sections.length) {
    reasonCodes.push('declared-section-count-must-equal-materialized-sections');
  }
  if (reasonCodes.length) return refuse(reasonCodes);

  const terminalById = new Map();
  for (const declaration of terminalDeclarations) {
    const id = text(declaration?.sectionId, 300);
    const state = String(declaration?.state || '');
    const reason = text(declaration?.reason, 1000);
    if (!id || !seen.has(id)) return refuse([`terminal-declaration-names-unknown-section:${id || '<missing>'}`]);
    // Only one terminal state may be declared, and only with a stated reason.
    // Without this a declaration file becomes a way to mark anything finished.
    if (state !== 'NOT_CURRENTLY_JUSTIFIED') return refuse([`terminal-declaration-state-not-declarable:${id}`]);
    if (!reason) return refuse([`terminal-declaration-requires-reason:${id}`]);
    terminalById.set(id, { state, reason });
  }

  const receiptById = new Map();
  for (const receipt of milestoneReceipts) {
    const id = text(receipt?.sectionId, 300);
    const evidenceRef = text(receipt?.evidenceRef, 1000);
    if (!id || !seen.has(id)) return refuse([`milestone-receipt-names-unknown-section:${id || '<missing>'}`]);
    if (!evidenceRef) return refuse([`milestone-receipt-requires-evidence-reference:${id}`]);
    receiptById.set(id, { evidenceRef });
  }

  const references = corpusReferenceCounts(sections);
  const rows = sections.map(section => {
    const evidence = locateEvidence({ name: section.title }, repoIndex);
    const canonicalMatches = matchCanonicalConcepts(section, canonicalRows);
    const declaredTerminal = terminalById.get(section.sectionId)?.state || null;
    const milestoneReceipt = receiptById.get(section.sectionId) || null;
    const currentState = classifyDirectiveState(section, { evidence, canonicalMatches, declaredTerminal, milestoneReceipt });
    return {
      sectionId: section.sectionId,
      numeral: section.numeral,
      title: section.title,
      class: section.class,
      currentState,
      corpusReferences: references.get(section.sectionId) ?? 0,
      canonicalMatches: canonicalMatches.slice(0, 8),
      currentEvidence: {
        sourceModules: evidence.sources.slice(0, 8),
        testModules: evidence.tests.slice(0, 8),
        reachability: evidence.reachability,
        matchStrength: evidence.matchStrength,
        matchScope: evidence.matchScope
      },
      terminalReason: terminalById.get(section.sectionId)?.reason || null,
      milestoneEvidenceRef: milestoneReceipt?.evidenceRef || null
    };
  });

  if (rows.length !== sections.length) return refuse(['reconciliation-must-not-drop-a-section']);
  const badState = rows.find(row => !DIRECTIVE_STATES.includes(row.currentState));
  if (badState) return refuse([`noncanonical-directive-state:${badState.sectionId}`]);

  const byState = {};
  for (const state of DIRECTIVE_STATES) byState[state] = 0;
  for (const row of rows) byState[row.currentState] += 1;

  const byClass = {};
  for (const row of rows) byClass[row.class] = (byClass[row.class] || 0) + 1;

  // The cut set: unmet sections that are genuinely build targets, ordered by
  // how much of the rest of the corpus depends on the same vocabulary. MISSING
  // ranks ahead of PARTIAL at equal reference count because nothing exists yet.
  const cutSet = rows
    .filter(row => BUILD_TARGET_CLASSES.includes(row.class))
    .filter(row => row.currentState === 'MISSING' || row.currentState === 'PARTIAL')
    .sort((a, b) =>
      b.corpusReferences - a.corpusReferences
      || (a.currentState === b.currentState ? 0 : a.currentState === 'MISSING' ? -1 : 1)
      || a.sectionId.localeCompare(b.sectionId))
    .map(row => ({
      sectionId: row.sectionId,
      numeral: row.numeral,
      title: row.title,
      class: row.class,
      currentState: row.currentState,
      corpusReferences: row.corpusReferences,
      existingEvidence: row.currentEvidence.sourceModules.slice(0, 3),
      nearestCanonicalConcepts: row.canonicalMatches.slice(0, 3).map(match => match.name)
    }));

  const rowDigest = createHash('sha256')
    .update(JSON.stringify(rows.map(row => [row.sectionId, row.currentState, row.corpusReferences])))
    .digest('hex');

  return {
    ok: true,
    version: FOUNDER_DIRECTIVE_RECONCILER_VERSION,
    status: 'FOUNDER_DIRECTIVE_RECONCILED_AGAINST_REPOSITORY_EVIDENCE',
    directiveId: String(directive.directiveId || ''),
    corpusDigest: String(directive.corpusDigest || ''),
    sourceCommit,
    generatedAt,
    counts: { sections: sections.length, rows: rows.length, byState, byClass },
    rows,
    cutSet,
    rowDigest,
    truthBoundary:
      'RECONCILIATION_REPORTS_ONLY_WHAT_THIS_TREE_AND_THE_CANONICAL_COVERAGE_MATRIX_SUPPORT. '
      + 'A_ROW_IS_NOT_A_WORK_ORDER; A_CUT_SET_POSITION_IS_A_CORPUS_REFERENCE_COUNT_AND_NOT_AN_ESTIMATE_OF_COST_VALUE_OR_UNLOCK. '
      + 'IT_DOES_NOT_PROVE_IMPLEMENTATION_RUNTIME_EXTERNAL_OUTCOMES_RECURSIVE_SELF_IMPROVEMENT_OR_ASI.',
    businessEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO_CONSEQUENCE_EFFECTS }
  };
}
