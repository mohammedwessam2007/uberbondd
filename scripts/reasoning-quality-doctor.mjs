#!/usr/bin/env node
// Runs the epistemic organs over a supplied situation: what the search could not
// see, what the assumptions already decided, and what the personal evidence is
// actually entitled to claim.
//
// These three fail together in a specific way. A search that only surfaces what
// the current vocabulary can express, run inside an assumption set that already
// fixed the answer, over a personal time series pooled across a regime change,
// produces a confident conclusion with nothing behind it -- and every step of
// that looked like rigour on the way past.
//
// The doctor exists so the three run as one pass and so they have a caller an
// operator can invoke. Read-only, synthetic fixture by default, no effect.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { observation, expectation, mine, conceptPressure } from '../src/unknown-unknown-mining.mjs';
import { diagnose, proposeFoundations, distinguishingObservation } from '../src/assumption-escape.mjs';
import { segmentSeries, claimStrength, importPrior } from '../src/n-of-1-personal-science.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = new Map();
for (let i = 2; i < process.argv.length; i += 1) {
  const arg = process.argv[i];
  if (!arg.startsWith('--')) continue;
  const next = process.argv[i + 1];
  args.set(arg, next && !next.startsWith('--') ? process.argv[++i] : true);
}

// Synthetic. None of this is anybody's evidence.
const FIXTURE = {
  observations: [
    { statement: 'output collapses in the third week of every quarter', source: 'time-tracker', verdict: 'RESISTS_EXPLANATION', domain: 'work-rhythm' },
    { statement: 'the same slump appears in the written journal', source: 'journal', verdict: 'RESISTS_EXPLANATION', domain: 'work-rhythm' },
    { statement: 'sleep drops after late calls', source: 'wearable', verdict: 'EXPLAINED_BY_EXISTING_MODEL', domain: 'sleep' },
    { statement: 'one odd spike in resting rate', source: 'wearable', verdict: 'RESISTS_EXPLANATION', domain: 'physiology' }
  ],
  expectations: [
    { expected: 'a peer group for this exists somewhere online', declaredAt: '2026-02-01', because: 'every adjacent specialty has one', domain: 'community' }
  ],
  observedDomains: ['work-rhythm', 'sleep', 'physiology', 'finances', 'relationships'],
  sourceCoverage: { 'time-tracker': ['work-rhythm'], journal: ['work-rhythm', 'sleep'], wearable: ['sleep', 'physiology'] },
  conceptPressure: {
    phenomenon: 'the recurring pull toward unrelated fields',
    existingCategories: ['habit', 'preference', 'skill gap'],
    fitsAny: false,
    distortionIfForced: 'calling it a preference loses that it precedes any exposure to the field'
  },
  question: {
    question: 'is the current track worth continuing',
    assumptions: ['worth means lifetime earnings', 'the ledger is accurate'],
    answerChangesIfDropped: ['worth means lifetime earnings']
  },
  foundations: {
    current: { name: 'earnings maximisation', predicts: { 'ten-year income': 'higher', 'reported satisfaction': 'unchanged' } },
    candidates: [
      { name: 'capability accumulation', predicts: { 'ten-year income': 'lower', 'reported satisfaction': 'higher' } },
      { name: 'utility maximisation', predicts: { 'ten-year income': 'higher', 'reported satisfaction': 'unchanged' } }
    ]
  },
  availableObservables: ['ten-year income'],
  series: {
    observations: [
      { at: '2026-01-01', value: 6.1 }, { at: '2026-02-01', value: 6.4 },
      { at: '2026-07-01', value: 7.2 }, { at: '2026-08-01', value: 7.4 }
    ],
    regimeChanges: [{ at: '2026-05-01', cause: 'RELOCATION' }]
  },
  claim: {
    design: 'BEFORE_AFTER', observations: 4,
    confoundersNamed: ['the move itself'], confoundersControlled: []
  },
  prior: {
    finding: 'the intervention raises the measure by 12%',
    population: 'a cohort of 4000 adults over 50',
    transferAssumption: 'the mechanism runs through sleep debt, which applies at any age',
    personDiffersIn: ['age']
  }
};

function loadSituation() {
  const file = args.get('--situation');
  if (!file) return { source: 'SYNTHETIC_FIXTURE', situation: FIXTURE };
  try {
    const parsed = JSON.parse(fs.readFileSync(path.resolve(root, String(file)), 'utf8'));
    return { source: 'SUPPLIED_FILE', situation: parsed && typeof parsed === 'object' ? parsed : FIXTURE };
  } catch {
    return { source: 'SITUATION_FILE_UNREADABLE__FIXTURE_USED', situation: FIXTURE };
  }
}

const { source, situation } = loadSituation();

const observations = (Array.isArray(situation.observations) ? situation.observations : [])
  .map(observation).filter(row => row.ok).map(row => row.observation);
const expectations = (Array.isArray(situation.expectations) ? situation.expectations : [])
  .map(expectation).filter(row => row.ok).map(row => row.expectation);
const mined = mine({
  observations, expectations,
  observedDomains: situation.observedDomains || [],
  sourceCoverage: situation.sourceCoverage || {}
});
const pressure = situation.conceptPressure ? conceptPressure(situation.conceptPressure) : null;

const diagnosis = situation.question ? diagnose(situation.question) : null;
const foundations = situation.foundations ? proposeFoundations(situation.foundations) : null;
const distinguishable = situation.foundations
  ? distinguishingObservation({
    foundations: [situation.foundations.current, ...(situation.foundations.candidates || [])],
    availableObservables: situation.availableObservables || []
  })
  : null;

const segmented = situation.series ? segmentSeries(situation.series) : null;
const strength = situation.claim ? claimStrength(situation.claim) : null;
const prior = situation.prior ? importPrior(situation.prior) : null;

const report = {
  ok: true,
  status: 'REASONING_QUALITY_DOCTOR_COMPLETE',
  version: 'uberbond.reasoning-quality-doctor.v1',
  generatedAt: new Date().toISOString(),
  situationSource: source,
  search: {
    questions: mined.questions.map(row => ({ route: row.route, question: row.question, domain: row.domain ?? row.expected ?? null })),
    singleSourceOnly: mined.singleSourceOnly.map(row => ({ domain: row.domain, question: row.question })),
    excludedAsAlreadyKnown: mined.excludedAsAlreadyKnown.length,
    blindSpots: mined.blindSpots,
    blindSpotLaw: mined.blindSpotLaw,
    conceptPressure: pressure && pressure.ok
      ? { status: pressure.status, handoff: pressure.handoff ?? null }
      : null
  },
  assumptions: {
    state: diagnosis && diagnosis.ok ? diagnosis.state : null,
    escapeWarranted: diagnosis && diagnosis.ok ? diagnosis.escapeWarranted : null,
    loadBearing: diagnosis && diagnosis.ok ? diagnosis.loadBearing : [],
    genuineAlternatives: foundations && foundations.ok ? foundations.alternatives.map(row => row.name) : [],
    notationalVariants: foundations && foundations.ok ? foundations.notationalVariants.map(row => row.name) : [],
    decidability: distinguishable && distinguishable.ok ? distinguishable.state : null,
    wouldDiscriminateIfObservable: distinguishable && distinguishable.ok
      ? distinguishable.wouldDiscriminateIfObservable.map(row => row.observable) : []
  },
  personalEvidence: {
    poolable: segmented && segmented.ok ? segmented.poolable : null,
    segments: segmented && segmented.ok ? segmented.segments.length : 0,
    permittedClaim: strength && strength.ok ? strength.permittedClaim : null,
    priorRole: prior && prior.ok ? prior.role : null,
    priorStatus: prior && prior.ok ? prior.status : null
  },
  truthBoundary: 'A_STRUCTURED_READING_OF_A_SUPPLIED_SITUATION__QUESTIONS_AND_LIMITS__NOT_FINDINGS_ABOUT_THE_WORLD',
  authorityBoundary: 'RECOMMENDATION_AT_MOST__MOHAMED_CHOOSES',
  privacyBoundary: 'SUPPLIED_SITUATIONS_ARE_PRIVATE_RUNTIME_INPUT_AND_ARE_NOT_WRITTEN_TO_REPOSITORY_ARTIFACTS',
  externalEffects: { messages: 0, providerCalls: 0, spendCents: 0, deployments: 0, writes: 0 },
  businessEffectAuthority: 'NONE'
};

const out = args.get('--out');
if (out && typeof out === 'string') {
  fs.writeFileSync(path.resolve(root, out), `${JSON.stringify(report, null, 2)}\n`);
}
console.log(JSON.stringify(report, null, 2));
