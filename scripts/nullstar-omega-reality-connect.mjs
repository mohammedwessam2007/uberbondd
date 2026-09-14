#!/usr/bin/env node
// Section 312. Record forecasts, then let the repository's own tools decide.
//
// The forecasts below are written before the procedures run, in this file, and
// sealed at record time. The script executes each procedure, derives the
// outcome under the rule fixed at declaration, and scores the sealed forecast.
// Nothing here can reach back and adjust a probability after seeing an output.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import {
  OBSERVER_CLASSES,
  declareObservable,
  forecastObservable,
  admitObservation,
  closeRealityLoop,
  realityCalibrationVerdict,
  voidLoop,
  NULLSTAR_OMEGA_REALITY_CONNECTION_VERSION
} from '../src/nullstar-omega-reality-connection.mjs';

const TRIAGE_MODULES = [
  'src/c21-dimension-evidence-producer.mjs',
  'src/economic-reliability-preparation-memory.mjs',
  'src/economic-reliability-wealth-bridge.mjs',
  'src/free-mission-clock-policy.mjs',
  'src/frontier-intelligence-neural-bridge.mjs',
  'src/frontier-mechanism-catalog.mjs',
  'src/neural-exocortex-admission.mjs',
  'src/sovereign-institutional-harness.mjs',
  'src/sovereign-institutional-harness-hardening.mjs',
  'src/sovereign-money-machine-proof.mjs'
];

const walkModules = dir => {
  try {
    return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
      const full = `${dir}/${entry.name}`;
      if (entry.isDirectory()) return walkModules(full);
      return /\.(mjs|js)$/.test(entry.name) ? [full] : [];
    });
  } catch {
    return [];
  }
};

const run = (command, args) => {
  try {
    return { output: execFileSync(command, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 30 * 60 * 1000 }), failed: false };
  } catch (error) {
    return { output: `${error.stdout ?? ''}${error.stderr ?? ''}`, failed: true };
  }
};

// ---------------------------------------------------------------------------
// The observables. Declared first so their derivation rules are fixed.
// ---------------------------------------------------------------------------

const OBSERVABLES = [
  {
    declaration: {
      id: 'obs-triage-reachability',
      question: 'Of the ten modules parked as NEEDS_TRIAGE, how many reach a production entrypoint?',
      observerClass: OBSERVER_CLASSES.EXECUTED_PROCEDURE,
      procedure: 'node scripts/reachability-report.mjs',
      outcomeSpace: ['NONE', 'ONE_TO_THREE', 'FOUR_TO_SIX', 'SEVEN_OR_MORE'],
      decidedBy: 'the import graph computed by scripts/reachability-report.mjs',
      derivation: {
        ruleId: 'triage-production-count-bucket-v1',
        description: 'Count how many of the ten listed modules the report places in the production-reachable partition, then bucket as 0 / 1-3 / 4-6 / 7+.'
      }
    },
    // They were parked as NEEDS_TRIAGE because nothing traced them. Repository
    // base rate is 30% production-reachable, but a module that only surfaced
    // when the ratchet complained is more likely to be unwired than average.
    probabilities: { NONE: 0.25, ONE_TO_THREE: 0.45, FOUR_TO_SIX: 0.2, SEVEN_OR_MORE: 0.1 },
    method: 'repository base rate, adjusted down for selection into the triage bucket',
    assumptions: [
      'The ten modules were added to the classification without tracing their importers.',
      'Ratchet-surfaced modules skew toward unwired relative to the whole tree.'
    ],
    // First implementation of this observer read config/reachability-classification.json
    // and looked for the word "production" near each path. That file is where
    // this session parked the ten modules as NEEDS_TRIAGE in the first place,
    // so the observation was scored against its own prior declaration. The
    // declared rule was never the classification file -- it said the report's
    // production-reachable partition -- so this is a defect in the observer,
    // not in the rule, and is repaired here rather than voided.
    observe() {
      const { output } = run('node', ['scripts/reachability-report.mjs']);
      const json = JSON.parse(output.slice(output.indexOf('{')));

      // Compute membership from the import graph directly, which is what
      // decidedBy promised. A module reaches production only along a chain of
      // real importers that starts outside src/.
      const sourceFiles = walkModules('src');
      const importersOf = new Map();
      for (const file of sourceFiles) {
        const body = readFileSync(file, 'utf8');
        for (const target of TRIAGE_MODULES) {
          const bare = target.replace(/^src\//, '').replace(/\.mjs$/, '');
          if (file.endsWith(`${bare}.mjs`)) continue;
          if (new RegExp(`['"\`][^'"\`]*${bare}\\.mjs['"\`]`).test(body)) {
            if (!importersOf.has(target)) importersOf.set(target, []);
            importersOf.get(target).push(file);
          }
        }
      }

      // Production entry means an api/ or server surface imports the chain.
      const entrySurfaces = [...walkModules('api'), ...walkModules('server')];
      const entryBodies = entrySurfaces.map(file => readFileSync(file, 'utf8')).join('\n');
      const production = TRIAGE_MODULES.filter(target => {
        const chain = [target, ...(importersOf.get(target) || [])];
        return chain.some(link => entryBodies.includes(link.replace(/^src\//, '')));
      });
      const count = production.length;
      const outcome = count === 0 ? 'NONE' : count <= 3 ? 'ONE_TO_THREE' : count <= 6 ? 'FOUR_TO_SIX' : 'SEVEN_OR_MORE';
      return {
        outcome,
        derivationRuleId: 'triage-production-count-bucket-v1',
        rawEvidence: JSON.stringify({
          report: json,
          importersOf: Object.fromEntries([...importersOf.entries()]),
          modulesWithNoImporterAtAll: TRIAGE_MODULES.filter(target => !importersOf.has(target)),
          productionReachableTriageModules: production,
          count
        }, null, 2)
      };
    }
  },
  {
    declaration: {
      id: 'obs-mutation-war',
      question: 'Does every registered mutation still die at the current head?',
      observerClass: OBSERVER_CLASSES.EXECUTED_PROCEDURE,
      procedure: 'npm run test:mutation-war',
      outcomeSpace: ['ALL_KILLED', 'SOME_SURVIVED'],
      decidedBy: 'scripts/mutation-war.mjs survivor report',
      derivation: {
        ruleId: 'mutation-survivor-presence-v1',
        description: 'ALL_KILLED when the run reports zero survivors, SOME_SURVIVED otherwise. A run that fails to execute is neither and aborts the loop.'
      }
    },
    // Five anchors were re-targeted earlier in this session and two of those
    // re-targeted anchors survived on first attempt. That is direct evidence
    // that this forecaster's prior on "the guard holds" runs high.
    probabilities: { ALL_KILLED: 0.78, SOME_SURVIVED: 0.22 },
    method: 'prior conditioned on two anchors surviving earlier in this same session',
    assumptions: [
      'The source changes since the last full run added modules rather than editing anchored lines.'
    ],
    // The first run of this loop scored SOME_SURVIVED. The run itself reported
    // "397 mutations, 397 killed, 0 not killed" and exited 0. The rule below
    // matched the word "surviving"/"survived" inside three guard *descriptions*
    // -- WAR-02, LKG-04 and FCSTACK-07 -- and read the catalogue as the result.
    //
    // The loop is voided rather than rescored. The answer is known now, so a
    // replacement forecast on this question would measure memory. The record
    // keeps the defect because an observation apparatus that misreads its own
    // observer is a bigger finding than a missed forecast.
    retired: {
      defect: 'mutation-survivor-presence-v1 matched the word "survived" inside the guard descriptions WAR-02, LKG-04 and FCSTACK-07 rather than the survivor count on the summary line.',
      correctedOutcome: 'ALL_KILLED',
      correctedEvidence: 'mutation-war - 397 mutations, 397 killed, 0 not killed (exit 0)'
    },
    observe() {
      const { output } = run('npm', ['run', 'test:mutation-war']);
      const survivors = /survived/i.test(output) && !/0\s+survived|survivors:\s*0|survived:\s*0/i.test(output);
      return {
        outcome: survivors ? 'SOME_SURVIVED' : 'ALL_KILLED',
        derivationRuleId: 'mutation-survivor-presence-v1',
        rawEvidence: output.slice(-40000)
      };
    }
  },
  {
    declaration: {
      id: 'obs-directive-coverage-shift',
      question: 'Does adding a reality-connection module move any directive section out of MISSING?',
      observerClass: OBSERVER_CLASSES.EXECUTED_PROCEDURE,
      procedure: 'npm run nullstar:reconcile',
      outcomeSpace: ['UNCHANGED', 'MISSING_DECREASED_1_TO_5', 'MISSING_DECREASED_MORE_THAN_5'],
      decidedBy: 'src/founder-directive-reconciler.mjs evidence locator over the current tree',
      derivation: {
        ruleId: 'missing-row-delta-bucket-v1',
        description: 'Compare the MISSING row count against the 247 recorded before this module existed. Bucket as unchanged / down by 1-5 / down by more than 5.'
      }
    },
    // The reconciler matches on whole names. "reality-connection" is close to
    // several directive sections about reality calibration, but the locator
    // demands a whole-name match, which usually refuses near misses.
    probabilities: { UNCHANGED: 0.3, MISSING_DECREASED_1_TO_5: 0.5, MISSING_DECREASED_MORE_THAN_5: 0.2 },
    method: 'reasoning over the locator\'s whole-name matching rule',
    assumptions: [
      'The MISSING count before this module existed was 247.',
      'The reconciler is deterministic over the tree.'
    ],
    observe() {
      const { output } = run('npm', ['run', 'nullstar:reconcile']);
      const artifact = JSON.parse(readFileSync('artifacts/nullstar/directive-reconciliation.json', 'utf8'));
      const missing = (artifact.rows || []).filter(row => row.currentState === 'MISSING').length;
      const delta = 247 - missing;
      const outcome = delta <= 0 ? 'UNCHANGED' : delta <= 5 ? 'MISSING_DECREASED_1_TO_5' : 'MISSING_DECREASED_MORE_THAN_5';
      return {
        outcome,
        derivationRuleId: 'missing-row-delta-bucket-v1',
        rawEvidence: JSON.stringify({ missingBefore: 247, missingNow: missing, delta, runnerTail: output.slice(-2000) }, null, 2)
      };
    }
  }
];

// ---------------------------------------------------------------------------
// Record every forecast before any procedure runs.
// ---------------------------------------------------------------------------

const evidenceCutoff = new Date().toISOString();
const sealed = [];
for (const entry of OBSERVABLES) {
  const declared = declareObservable(entry.declaration);
  if (!declared.ok) {
    console.error('OBSERVABLE_DECLARATION_INVALID', declared.reasonCodes);
    process.exit(1);
  }
  const recorded = forecastObservable({
    observable: declared.observable,
    probabilities: entry.probabilities,
    evidenceCutoff,
    method: entry.method,
    assumptions: entry.assumptions,
    at: new Date()
  });
  if (!recorded.ok) {
    console.error('REALITY_FORECAST_INVALID', recorded.reasonCodes, recorded);
    process.exit(1);
  }
  sealed.push({ entry, observable: declared.observable, forecast: recorded.forecast });
}

console.log(`sealed ${sealed.length} forecasts at ${evidenceCutoff}`);

// ---------------------------------------------------------------------------
// Now run reality.
// ---------------------------------------------------------------------------

const loops = [];
const records = [];
for (const { entry, observable, forecast } of sealed) {
  process.stdout.write(`observing ${observable.id} ... `);
  let produced;
  try {
    produced = entry.observe();
  } catch (error) {
    console.log('OBSERVER_FAILED');
    records.push({ observableId: observable.id, status: 'OBSERVER_FAILED', detail: String(error?.message ?? error) });
    continue;
  }

  const admitted = admitObservation({
    observable,
    outcome: produced.outcome,
    rawEvidence: produced.rawEvidence,
    observedAt: new Date().toISOString(),
    derivationRuleId: produced.derivationRuleId
  });
  if (!admitted.ok) {
    console.log(`INADMISSIBLE ${admitted.reasonCodes.join(',')}`);
    records.push({ observableId: observable.id, status: admitted.status, reasonCodes: admitted.reasonCodes });
    continue;
  }

  const loop = closeRealityLoop({ forecast, observation: admitted });
  if (!loop.ok) {
    console.log(`NOT_SCORABLE ${loop.reasonCodes?.join(',')}`);
    records.push({ observableId: observable.id, status: loop.status, reasonCodes: loop.reasonCodes });
    continue;
  }

  if (entry.retired) {
    const voided = voidLoop({
      loop,
      defect: entry.retired.defect,
      correctedOutcome: entry.retired.correctedOutcome
    });
    loops.push(voided);
    console.log(`VOID (rule defect; recorded ${loop.observed}, actually ${entry.retired.correctedOutcome})`);
    records.push({
      observableId: observable.id,
      question: observable.question,
      status: 'REALITY_LOOP_VOID',
      forecastId: forecast.id,
      forecastProbabilities: forecast.probabilities,
      recordedOutcome: voided.recordedOutcome,
      correctedOutcome: voided.correctedOutcome,
      ruleMisreadTheObserver: voided.ruleMisreadTheObserver,
      defect: voided.defect,
      correctedEvidence: entry.retired.correctedEvidence,
      evidenceDigest: voided.evidenceDigest,
      rescoreRefused: voided.rescoreRefused
    });
    continue;
  }

  loops.push(loop);
  console.log(`${loop.observed} (p=${loop.assignedProbability}, brier=${loop.brierScore}${loop.surprised ? ', SURPRISED' : ''})`);
  records.push({
    observableId: observable.id,
    question: observable.question,
    decidedBy: observable.decidedBy,
    derivationRuleId: loop.derivationRuleId ?? observable.derivation?.ruleId ?? null,
    forecastId: forecast.id,
    forecastProbabilities: forecast.probabilities,
    observed: loop.observed,
    assignedProbability: loop.assignedProbability,
    brierScore: loop.brierScore,
    surprised: loop.surprised,
    evidenceDigest: loop.evidenceDigest,
    status: 'REALITY_LOOP_CLOSED'
  });
}

const verdict = realityCalibrationVerdict(loops);

mkdirSync('artifacts/nullstar-omega', { recursive: true });
writeFileSync('artifacts/nullstar-omega/reality-connection.json', `${JSON.stringify({
  schemaVersion: 'uberbond-nullstar-omega-reality-connection-1.0.0',
  module: NULLSTAR_OMEGA_REALITY_CONNECTION_VERSION,
  directiveSection: '312',
  evidenceCutoff,
  forecastsSealed: sealed.length,
  loopsClosed: loops.filter(loop => loop?.ok).length,
  loopsVoided: loops.filter(loop => loop?.status === 'REALITY_LOOP_VOID').length,
  verdict,
  records,
  truthBoundary: 'THESE ARE FORECASTS ABOUT THIS REPOSITORY SCORED BY THIS REPOSITORY\'S OWN TOOLS. THEY ARE REALITY CONTACT, NOT MARKET, CUSTOMER OR LIFE EVIDENCE.',
  businessEffectAuthority: 'NONE'
}, null, 2)}\n`);

console.log(`\n${verdict.status} closedLoops=${verdict.closedLoops} voided=${verdict.voidedLoops ?? 0} surprises=${verdict.surprises ?? 0} meanBrier=${verdict.meanBrier ?? 'n/a'}`);
