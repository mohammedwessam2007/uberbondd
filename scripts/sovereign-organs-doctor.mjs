#!/usr/bin/env node
// Does each sovereign organ still refuse what it exists to refuse?
//
// The organs added for issue #463 are decision-support machinery. Their value
// is almost entirely in their refusals -- a forecast organ that stops widening
// its ranges, or an experience planner that stops requiring authority to spend,
// still returns plausible objects. It fails silently and looks fine.
//
// The test suites cover this exhaustively and are the real gate. This doctor is
// the fast operator-facing one: nine checks, one per organ, each exercising the
// single boundary whose loss would be worst, so that an operator can ask "are
// the refusals still there" without running three thousand tests.
//
// It asserts behaviour rather than importing modules to prove they parse. A
// doctor that only imported would report health it never measured.
//
// Five organs, not nine. The four Personal Civilization organs are absent on
// purpose and must stay absent. They compose personal-civilization-core, which
// is DELIBERATELY_UNREACHABLE because it holds the founder's private life
// state: every entry point in this repository runs autonomously with nobody
// present, so a path from one to that module would let private records be
// read, derived from or exported by a lane acting on its own. Importing those
// organs here -- even only to assert that they refuse things -- would create
// exactly that path. A health check is not worth a hole in the one boundary it
// would be checking.
import {
  FORECAST_PARENT_ORGAN_VERSION, referenceClass
} from '../src/forecast-parent-organ.mjs';
import {
  VERSION as DECISION_BOUNDARY_VERSION, decisionRobustness
} from '../src/forecast-decision-boundary.mjs';
import {
  FORECAST_ADVERSARIAL_ENSEMBLE_VERSION, forecasterSubmission, effectiveIndependence
} from '../src/forecast-adversarial-ensemble.mjs';
import {
  GENESIS_MECHANISM_COMPILER_VERSION, normalizeDonorMechanism
} from '../src/genesis-mechanism-compiler.mjs';
import {
  GENESIS_BOUNDARY_EXPERIMENT_VERSION, IMPOSSIBILITY_CLASSES, classifyPossibility
} from '../src/genesis-boundary-experiment.mjs';


const checks = [];
const check = (organ, boundary, fn) => {
  try {
    const detail = fn();
    checks.push({ organ, boundary, held: true, detail });
  } catch (error) {
    checks.push({ organ, boundary, held: false, detail: error.message });
  }
};
const must = (condition, message) => { if (!condition) throw new Error(message); };

check('forecast-parent-organ', 'a correlated sample is never promoted to a base rate', () => {
  const result = referenceClass({
    question: 'will it convert?',
    comparabilityCriteria: ['same-market'],
    // Twenty rows, one source. Large sample, one voice.
    cases: Array.from({ length: 20 }, (_, i) => ({ id: `c${i}`, source: 'one-analyst-report', hit: i < 18 }))
  });
  must(result.status === 'REFERENCE_CLASS_UNDERPOWERED', `expected underpowered, got ${result.status}`);
  must(result.baseRate === null, 'a correlated sample produced a base rate');
  return `20 cases / 1 source -> ${result.status}, baseRate null`;
});

check('forecast-decision-boundary', 'irreversible ruin outranks any expected value', () => {
  const result = decisionRobustness({
    option: 'bet the runway', reversibility: 'PRACTICALLY_IRREVERSIBLE',
    expectedValue: 9_999_999, worstCase: 'insolvency', ruinRisk: true
  });
  must(result.status === 'NOT_RECOMMENDABLE__IRREVERSIBLE_RUIN', `expected ruin refusal, got ${result.status}`);
  must(result.recommendable === false, 'a ruinous option was recommendable');
  return `EV 9,999,999 with ruin -> ${result.status}`;
});

check('forecast-adversarial-ensemble', 'shared ancestry collapses to one effective vote', () => {
  const clones = Array.from({ length: 10 }, (_, i) => forecasterSubmission({
    forecasterId: `f${i}`, distribution: { yes: 0.8, no: 0.2 },
    evidenceAncestry: ['the-one-report'], updateTriggers: ['the report is retracted']
  }));
  const result = effectiveIndependence(clones);
  must(result.rawCount === 10, 'fixture did not produce ten forecasters');
  must(result.effectiveIndependentCount === 1, `expected 1 effective vote, got ${result.effectiveIndependentCount}`);
  return `10 forecasters / 1 ancestor -> ${result.effectiveIndependentCount} effective vote`;
});

check('genesis-mechanism-compiler', 'a vendor claim cannot present as observed fact', () => {
  const result = normalizeDonorMechanism({
    mechanismId: 'vendor-pitch', domain: 'saas',
    does: 'reduces churn by predicting cancellations',
    exploits: 'usage decline precedes cancellation',
    effects: ['retained revenue'], assumptions: ['the signal generalises'],
    // The donor asserts the strongest class it can. The ceiling must overrule it.
    evidenceClass: 'VERIFIED_FACT',
    source: { kind: 'VENDOR_MATERIAL', ref: 'evidence:vendor-deck', observedAt: '2026-06-01T00:00:00.000Z' }
  });
  must(result.ok === true, 'normalization refused a well-formed donor');
  must(result.evidenceClass === 'VENDOR_CLAIM', `vendor material emerged as ${result.evidenceClass}`);
  return `claimed VERIFIED_FACT from VENDOR_MATERIAL -> ${result.evidenceClass}`;
});

check('genesis-boundary-experiment', 'not-found is never impossible', () => {
  const result = classifyPossibility({
    claim: 'a partner channel can deliver cleared payment within thirty days',
    searchedMechanisms: ['direct outbound', 'referral', 'marketplace listing'],
    foundMechanism: null
  });
  must(result.classification === 'UNKNOWN', `expected UNKNOWN, got ${result.classification}`);
  must(!IMPOSSIBILITY_CLASSES.includes(result.classification), 'an exhausted search reached an impossibility verdict');
  return `exhausted search, no mechanism -> ${result.classification}`;
});

const held = checks.filter(row => row.held);
const broken = checks.filter(row => !row.held);

const receipt = {
  schema: 'uberbond.sovereign-organs-doctor.v1',
  status: broken.length === 0 ? 'ALL_BOUNDARIES_HELD' : 'BOUNDARY_LOST',
  organs: {
    'forecast-parent-organ': FORECAST_PARENT_ORGAN_VERSION,
    'forecast-decision-boundary': DECISION_BOUNDARY_VERSION,
    'forecast-adversarial-ensemble': FORECAST_ADVERSARIAL_ENSEMBLE_VERSION,
    'genesis-mechanism-compiler': GENESIS_MECHANISM_COMPILER_VERSION,
    'genesis-boundary-experiment': GENESIS_BOUNDARY_EXPERIMENT_VERSION
  },
  privateOrgansDeliberatelyNotChecked: [
    'src/personal-civilization-capture.mjs',
    'src/personal-civilization-model-graph.mjs',
    'src/personal-civilization-possibility.mjs',
    'src/personal-civilization-decision-loop.mjs'
  ],
  checked: checks.length,
  held: held.length,
  broken: broken.length,
  results: checks,
  businessEffectAuthority: 'NONE',
  note: 'Five behavioural checks, one boundary per organ. This proves those refusals still fire. It does not '
      + 'prove any forecast is accurate, any candidate is good, or that the full test suite passes. The four '
      + 'Personal Civilization organs are excluded on purpose: reaching them from a script would make the '
      + 'private life store reachable from an autonomous entry point, which is the boundary they exist to keep.'
};

console.log(JSON.stringify(receipt, null, 2));
process.exit(broken.length === 0 ? 0 : 1);
