#!/usr/bin/env node
// Runs the life loop end to end on a supplied situation and reports what the
// organs actually concluded.
//
// The point is not a health badge. It is that the four organs -- possibility,
// compression, world sensing, generation -- compose into one pass over a real
// situation, so the composition is exercised by something an operator can run
// rather than only by unit tests. A module reachable only from tests is not
// reachable, and this repository has paid for that lesson three times.
//
// Input is a JSON situation file, or nothing, in which case a synthetic fixture
// runs. The fixture is synthetic on purpose: private life data does not belong
// in a repository, and a doctor that only works against real personal history
// would be a doctor nobody can run in CI.
//
// Read-only. No provider call, no network, no write outside --out, no effect.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { branch, evaluateDecision, inventoryBreadth, crossFutureValue } from '../src/life-possibility-engine.mjs';
import { fact, compress, compressionDebt } from '../src/life-compression-engine.mjs';
import { classifySignal, ground, windowVersusImportance, attentionBudget } from '../src/gamechanger-for-life.mjs';
import { generatePath, generateBatch, unknownSelfProbes } from '../src/genesis-for-life.mjs';
import { gateOption, freedomGradient, agencyGeometry } from '../src/freedom-gradient.mjs';
import { dependency, mapRedundancy, classify } from '../src/anti-fragility-map.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = new Map();
for (let i = 2; i < process.argv.length; i += 1) {
  const arg = process.argv[i];
  if (!arg.startsWith('--')) continue;
  const next = process.argv[i + 1];
  args.set(arg, next && !next.startsWith('--') ? process.argv[++i] : true);
}

// A synthetic situation. Every field is invented; none of it is anybody's life.
const FIXTURE = {
  branches: [
    { name: 'clinical practice', dimension: 'CAREER', reachability: 'REACHABLE_NOW', valued: true, requires: ['medical licence'] },
    { name: 'research post abroad', dimension: 'CAREER', reachability: 'REACHABLE_WITH_PREPARATION', valued: true, requires: ['medical licence', 'conversational German'] },
    { name: 'live in a German-speaking city', dimension: 'GEOGRAPHIC_FREEDOM', reachability: 'REACHABLE_WITH_PREPARATION', valued: true, requires: ['conversational German'] },
    { name: 'read the primary literature unmediated', dimension: 'KNOWLEDGE', reachability: 'REACHABLE_WITH_PREPARATION', valued: true, requires: ['conversational German'] },
    { name: 'build a software business', dimension: 'ENTREPRENEURSHIP', reachability: 'REACHABLE_NOW', valued: true, requires: ['capital'] }
  ],
  decision: {
    decision: 'commit to a single specialty for four years',
    opens: [{ name: 'operate independently', dimension: 'CAREER' }],
    closes: [
      { branch: { name: 'three adjacent specialties', dimension: 'CAREER' }, kind: 'DELIBERATE_COMMITMENT', inExchangeFor: 'depth in one craft' },
      { branch: { name: 'a year of unstructured travel', dimension: 'EXPERIENCE' }, kind: 'UNNECESSARY_CLOSURE' }
    ]
  },
  compression: {
    principle: 'energy predicts output more reliably than hours worked',
    explains: [
      { statement: 'the productive spring', ref: 'journal/2026-03' },
      { statement: 'the flat autumn', ref: 'journal/2026-10' }
    ],
    boundaryConditions: ['does not apply under a hard external deadline'],
    counterexamplesExamined: [
      { statement: 'the thesis month: low energy, highest output', ref: 'journal/2026-05', verdict: 'BOUNDED_EXCEPTION', boundary: 'does not apply under a hard external deadline' }
    ]
  },
  signals: [
    { title: 'a cheaper frontier model shipped', observedAt: '2026-09-01', economicScore: 94 },
    {
      title: 'a research-visa route opened for this specialty', observedAt: '2026-09-04',
      changesReachabilityOf: ['CAREER', 'GEOGRAPHIC_FREEDOM'],
      wouldHaveToBeTrue: ['I meet the qualification bar', 'an institution will sponsor']
    }
  ],
  options: [
    { name: 'stay in the current post', gates: { PERCEIVED: true, UNDERSTOOD: true, REACHABLE: true, RESOURCED: true, REVERSIBLE: true, UNCOERCED: true, SELF_ENDORSED: true } },
    { name: 'the research post abroad', gates: { PERCEIVED: true, UNDERSTOOD: true, REACHABLE: true, RESOURCED: false, REVERSIBLE: true, UNCOERCED: true, SELF_ENDORSED: true } },
    { name: 'the family-expected route', gates: { PERCEIVED: true, UNDERSTOOD: true, REACHABLE: true, RESOURCED: true, REVERSIBLE: true, UNCOERCED: false, SELF_ENDORSED: false } }
  ],
  dependencies: [
    { name: 'the hospital salary', domain: 'INCOME', failureModes: ['the post ends'], maintenanceCostPerMonth: 0 },
    { name: 'the locum work', domain: 'INCOME', failureModes: ['the post ends'], maintenanceCostPerMonth: 0 },
    { name: 'notes in one cloud provider', domain: 'MEMORY', failureModes: ['the provider shuts down'], maintenanceCostPerMonth: 8 }
  ],
  stresses: [{ event: 'a month of illness', degraded: true, recovered: true }],
  testedDimensions: ['CAREER', 'KNOWLEDGE', 'EDUCATION'],
  paths: [
    { name: 'a more prestigious version of the current track', identityDistance: 'CONTINUATION', dimensions: ['CAREER'] },
    { name: 'teach the subject to non-specialists', identityDistance: 'ADJACENT', dimensions: ['CONTRIBUTION', 'CAREER'] },
    { name: 'a season of physical work in another country', identityDistance: 'UNKNOWN_SELF', dimensions: ['PHYSICAL_CAPABILITY', 'GEOGRAPHIC_FREEDOM'], reversibleProbe: 'one month, return ticket booked' }
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

// Possibility: what the inventory is, and what the decision does to it.
const branches = (Array.isArray(situation.branches) ? situation.branches : []).map(branch)
  .filter(row => row.ok).map(row => row.branch);
const breadth = inventoryBreadth(branches);
const crossFuture = crossFutureValue(branches);
const decision = situation.decision ? evaluateDecision(situation.decision) : null;

// Compression: what has been learned, and whether it survived being attacked.
const compressionInput = situation.compression || {};
const facts = (Array.isArray(compressionInput.explains) ? compressionInput.explains : []).map(fact)
  .filter(row => row.ok).map(row => row.fact);
const compressed = compress({ ...compressionInput, explains: facts });
const debt = compressionDebt({
  compressed: compressed.ok ? compressed.principle : null,
  dropped: situation.compressionDropped || [],
  decisionDependsOn: situation.decisionDependsOn || []
});

// World: which signals moved the geometry, and what survives the attention budget.
const classified = (Array.isArray(situation.signals) ? situation.signals : []).map(classifySignal).filter(row => row.ok);
const grounded = classified
  .filter(row => row.state === 'HYPOTHESIS')
  .map(row => ground({ signal: row, evidence: 'THIRD_PARTY_REPORT', conditionsMet: [] }));
const budget = attentionBudget(classified, { maxSurfaced: Number(args.get('--attention') || 3) });
const windows = classified
  .filter(row => row.state !== 'NOVELTY_NOT_GEOMETRY_CHANGE')
  .map(row => windowVersusImportance({
    signal: row.signal.title,
    windowCause: 'NONE_KNOWN',
    dimensionsMoved: row.changesReachabilityOf || []
  }));

// Generation: what was imagined, and whether any of it departed.
const paths = (Array.isArray(situation.paths) ? situation.paths : []).map(generatePath)
  .filter(row => row.ok).map(row => row.path);
const batch = paths.length ? generateBatch(paths) : null;
const probes = unknownSelfProbes({ testedDimensions: situation.testedDimensions || [], paths });

// Freedom: how many of the nominal options are effectively free, and where the
// rest are lost.
const gatedOptions = (Array.isArray(situation.options) ? situation.options : []).map(gateOption)
  .filter(row => row.ok).map(row => row.option);
const gradient = freedomGradient(gatedOptions);
// The same funnel with the constrained options removed, which is the shape the
// life would have if the resource and coercion gates were cleared. Compared
// against the real one so a rising option count cannot read as rising freedom.
const ifCleared = freedomGradient(gatedOptions.map(option => option.effectivelyFree
  ? option
  : { ...option, gates: Object.fromEntries(Object.keys(option.gates).map(gate => [gate, true])), effectivelyFree: true }));
const geometry = agencyGeometry({ before: gradient, after: ifCleared });

// Fragility: which domains depend on one thing not failing.
const dependencies = (Array.isArray(situation.dependencies) ? situation.dependencies : []).map(dependency)
  .filter(row => row.ok).map(row => row.dependency);
const redundancy = mapRedundancy(dependencies);
const fragility = classify({ system: 'the life system', stressesObserved: situation.stresses || [] });

const report = {
  ok: true,
  status: 'PERSONAL_CIVILIZATION_DOCTOR_COMPLETE',
  version: 'uberbond.personal-civilization-doctor.v1',
  generatedAt: new Date().toISOString(),
  situationSource: source,
  possibility: {
    branchesAccepted: branches.length,
    dimensionsRepresented: breadth.dimensionsRepresented,
    concentrated: breadth.concentrated,
    crossFutureRequirements: crossFuture.highValue.map(row => ({ requirement: row.requirement, dimensions: row.dimensionsSpanned })),
    decision: decision && decision.ok
      ? {
        decision: decision.decision,
        unnecessarilyClosed: decision.unnecessarilyClosed.map(row => row.branch),
        deliberatelyClosed: decision.deliberatelyClosed.map(row => ({ branch: row.branch, inExchangeFor: row.inExchangeFor })),
        authorityBoundary: decision.authorityBoundary
      }
      : decision
  },
  compression: {
    state: compressed.ok ? compressed.state : null,
    status: compressed.status,
    exceptionsKept: (compressed.exceptions || []).length,
    debt: { status: debt.status, loadBearingLoss: debt.loadBearingLoss }
  },
  world: {
    droppedAsNovelty: budget.ok ? budget.droppedAsNovelty : [],
    surfaced: budget.ok ? budget.surfaced : [],
    deferredCount: budget.ok ? budget.deferredCount : 0,
    groundingOutcomes: grounded.map(row => ({ signal: row.signal, state: row.state, status: row.status })),
    urgencyAndImportance: windows.map(row => ({ signal: row.signal, reading: row.reading }))
  },
  freedom: {
    nominalOptions: gradient.nominalOptions,
    effectivelyFree: gradient.effectivelyFree,
    narrowestGate: gradient.narrowestGate,
    ifConstraintsCleared: { effectiveDelta: geometry.effectiveDelta, reading: geometry.reading }
  },
  fragility: {
    singlePointOfFailureDomains: redundancy.domains.filter(row => row.singlePointOfFailure).map(row => row.domain),
    unmappedDomains: redundancy.domainsWithNoRecordedDependency,
    maintenanceCostPerMonth: redundancy.maintenanceCostPerMonth,
    observedClass: fragility.observedClass
  },
  genesis: {
    generated: paths.length,
    caged: batch ? batch.caged : null,
    departures: batch ? batch.departures : [],
    untestedDimensions: probes.untestedDimensions,
    probeReady: probes.probeReady
  },
  // Said plainly because a doctor that returns a green object invites being
  // read as a verdict about a life.
  truthBoundary: 'THIS_IS_A_STRUCTURED_READING_OF_A_SUPPLIED_SITUATION__NOT_EVIDENCE_ABOUT_A_LIFE_AND_NOT_A_RECOMMENDATION',
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
