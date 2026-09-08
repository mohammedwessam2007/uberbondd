#!/usr/bin/env node
// The sovereign relation, checked over time rather than at a moment.
//
// The three organs here fail as a set. Authority drifts by accumulation, not by
// announcement; the amplification loop turns while the chooser stays flat; and
// a claim from a previous decade gets spoken in the present tense. Any one of
// those alone is recoverable. Together they describe a system that has quietly
// become the author of a life it was built to widen, with every individual step
// defensible.
//
// So this runs all three on one situation and reports the three shapes side by
// side. Read-only, synthetic fixture by default -- private life data does not
// belong in a repository -- and no external effect.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { position, resolve, deferralDrift } from '../src/present-free-will.mjs';
import { scoreCycle, amplificationTrend, LOOP_STAGES } from '../src/free-will-amplification.mjs';
import { observe, applyToPresent, longRangeThemes, recordTransformation } from '../src/temporal-civilization.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = new Map();
for (let i = 2; i < process.argv.length; i += 1) {
  const arg = process.argv[i];
  if (!arg.startsWith('--')) continue;
  const next = process.argv[i + 1];
  args.set(arg, next && !next.startsWith('--') ? process.argv[++i] : true);
}

// Synthetic. None of this is anybody's life.
const FIXTURE = {
  positions: [
    { rung: 'UBERBOND_PREDICTION', claim: 'take the larger offer', supportingEvidence: ['base rate', 'peer outcomes', 'income model'] },
    { rung: 'ECONOMIC_OPTIMIZATION', claim: 'take the larger offer' },
    { rung: 'HISTORICAL_PREFERENCE', claim: 'take the larger offer' },
    { rung: 'PRESENT_CONSCIOUS_CHOICE', claim: 'stay and finish the training' }
  ],
  resolutionHistory: [
    { decidedBy: 'PRESENT_CONSCIOUS_CHOICE', presentChoiceWasAvailable: true },
    { decidedBy: 'UBERBOND_PREDICTION', presentChoiceWasAvailable: true },
    { decidedBy: 'UBERBOND_PREDICTION', presentChoiceWasAvailable: true },
    { decidedBy: 'SOCIAL_EXPECTATION', presentChoiceWasAvailable: true },
    { decidedBy: 'ECONOMIC_OPTIMIZATION', presentChoiceWasAvailable: false }
  ],
  cycles: [
    { subject: 'the language question', stagesCompleted: LOOP_STAGES, realityContact: 'six weeks of lessons and one trip',
      deltas: { UNDERSTANDING: 2, CAPABILITY: 1, OPTION_COUNT: 3 } },
    { subject: 'the tooling survey', stagesCompleted: LOOP_STAGES, realityContact: 'read and compared',
      deltas: { UNDERSTANDING: 0, CAPABILITY: 0, OPTION_COUNT: 14 } },
    { subject: 'the unfinished plan', stagesCompleted: ['WILL', 'INTELLIGENCE', 'UNDERSTANDING'], realityContact: null,
      deltas: { UNDERSTANDING: 1, CAPABILITY: 0, OPTION_COUNT: 0 } }
  ],
  observations: [
    { statement: 'dislikes large groups', atAge: 22, theme: 'social energy' },
    { statement: 'drawn to how things are built', atAge: 18, theme: 'mechanism' },
    { statement: 'drawn to how things are built', atAge: 29, theme: 'mechanism' },
    { statement: 'still taking things apart', atAge: 34, theme: 'mechanism' }
  ],
  presentAge: 34,
  appliedStatements: ['dislikes large groups', 'drawn to how things are built'],
  transformations: [
    { fromAge: 22, toAge: 29, kind: 'ENVIRONMENT_CHANGED', description: 'moved from a large institution to a small team' },
    { fromAge: 29, toAge: 34, kind: 'UNEXPLAINED', description: 'stopped minding crowds and cannot say why' }
  ]
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

// Authority: who wins now, and whether present choice has been drifting.
const positions = (Array.isArray(situation.positions) ? situation.positions : [])
  .map(position).filter(row => row.ok).map(row => row.position);
const resolved = positions.length ? resolve(positions) : null;
const drift = Array.isArray(situation.resolutionHistory) && situation.resolutionHistory.length
  ? deferralDrift(situation.resolutionHistory)
  : null;

// Amplification: is the chooser getting sharper, or is the menu getting longer?
const scored = (Array.isArray(situation.cycles) ? situation.cycles : []).map(scoreCycle).filter(row => row.ok);
const trend = scored.length ? amplificationTrend(scored) : null;

// Time: which claims may be spoken in the present tense, and what recurs.
const observations = (Array.isArray(situation.observations) ? situation.observations : [])
  .map(observe).filter(row => row.ok).map(row => row.observation);
const presentAge = situation.presentAge ?? null;
const applied = (Array.isArray(situation.appliedStatements) ? situation.appliedStatements : [])
  .map(statement => applyToPresent({ statement, observations, presentAge }))
  .filter(row => row.ok)
  .map(row => ({ statement: row.statement, tense: row.tense, erasSpanned: row.erasSpanned, status: row.status }));
const themes = longRangeThemes(observations);
const transformations = (Array.isArray(situation.transformations) ? situation.transformations : [])
  .map(recordTransformation).filter(row => row.ok).map(row => row.transformation);

const report = {
  ok: true,
  status: 'SOVEREIGN_RELATION_DOCTOR_COMPLETE',
  version: 'uberbond.sovereign-relation-doctor.v1',
  generatedAt: new Date().toISOString(),
  situationSource: source,
  authority: resolved && resolved.ok
    ? {
      decision: resolved.decision,
      decidedBy: resolved.decidedBy,
      overriddenRungs: resolved.overridden.map(row => row.rung),
      sovereigntyFunctioning: resolved.sovereigntyFunctioning,
      drifting: drift && drift.ok ? drift.drifting : null,
      deferredTo: drift && drift.ok ? drift.deferredTo : {},
      driftBoundary: drift && drift.ok ? drift.authorityBoundary : null
    }
    : null,
  amplification: trend && trend.ok
    ? {
      cycles: trend.cycles,
      amplifying: trend.amplifying,
      noise: trend.noise,
      ungroundedOrIncomplete: trend.ungroundedOrIncomplete,
      totalOptionGain: trend.totalOptionGain,
      totalResolutionGain: trend.totalResolutionGain,
      spinning: trend.spinning,
      menuGrowingWithoutChooser: trend.menuGrowingWithoutChooser
    }
    : null,
  time: {
    appliedToPresent: applied,
    recurringThemes: themes.recurring.map(row => ({ theme: row.theme, erasSpanned: row.erasSpanned, span: row.span })),
    singleEraThemes: themes.singleEraOnly.map(row => row.theme),
    transformations: transformations.map(row => ({ fromAge: row.fromAge, toAge: row.toAge, kind: row.kind })),
    interpretationBoundary: themes.interpretationBoundary
  },
  truthBoundary: 'A_STRUCTURED_READING_OF_A_SUPPLIED_SITUATION__NOT_EVIDENCE_ABOUT_A_LIFE_AND_NOT_A_RECOMMENDATION',
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
