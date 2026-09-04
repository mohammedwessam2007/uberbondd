#!/usr/bin/env node
// The GENESIS chain runs gamechanger:plan -> genesis:evolve -> genesis:scientist -> genesis:ontology, each step reading what the last one wrote. A missing input means an earlier step has not run, which is a knowable fact and worth reporting as one.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildCounterfactualWorlds,
  buildSyntheticFutureMemories,
  compileCausalEconomicGenome,
  compileEconomicScientistProtocol,
  guardMetaObjective
} from '../src/genesis-scientist.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = new Map();
for (let i = 2; i < process.argv.length; i += 1) {
  const arg = process.argv[i];
  if (!arg.startsWith('--')) continue;
  args.set(arg, process.argv[i + 1]?.startsWith('--') ? true : process.argv[++i] ?? true);
}
const inputPath = resolve(root, String(args.get('--input') || 'artifacts/genesis-evolution-latest.json'));
const outputPath = resolve(root, String(args.get('--output') || 'artifacts/genesis-scientist-latest.json'));
const generatedAt = new Date().toISOString();

async function readJson(path) { try { return JSON.parse(await readFile(path, 'utf8')); } catch { return null; } }
const evolution = await readJson(inputPath);
if (!evolution || typeof evolution !== 'object') {
  console.error(JSON.stringify({ ok: false, status: 'GENESIS_SCIENTIST_EVOLUTION_INPUT_REQUIRED', inputPath, producedBy: 'npm run genesis:evolve', detail: 'The evolution receipt has not been generated yet. Run `npm run genesis:evolve` first, which itself needs `npm run gamechanger:plan`.' }, null, 2));
  process.exit(1);
}

const baselineObjective = {
  economicNorthStar: 'risk-adjusted cleared contribution profit / founder minute',
  authorityLaw: 'capability never creates authority',
  truthLaw: 'external truth requires external evidence',
  founderFreedomLaw: 'increase leverage while reducing compulsory founder minutes and preserving optionality'
};

const laboratories = [];
for (const cycle of (Array.isArray(evolution.cycles) ? evolution.cycles : []).filter(item => item?.ok).slice(0, 50)) {
  const primitiveText = cycle?.multiplication?.primitive || cycle?.surprise?.primitive || cycle?.signalId || 'frontier primitive';
  const evidenceRef = cycle?.source ? `signal:${String(cycle.source).slice(0, 180)}` : `receipt:${cycle.signalId || 'genesis-cycle'}`;
  const worlds = buildCounterfactualWorlds({
    axes: {
      capabilityTrajectory: ['stalls', 'continues', 'accelerates'],
      adoptionSpeed: ['slow', 'fast'],
      commoditization: ['low', 'high']
    },
    maxWorlds: 12
  });
  const causal = compileCausalEconomicGenome({
    variables: [
      { id: 'frontier-primitive', role: 'EXOGENOUS', description: primitiveText },
      { id: 'unit-cost', role: 'COST', description: 'cost per successful task' },
      { id: 'task-reliability', role: 'MEDIATOR', description: 'task-specific reliability' },
      { id: 'opportunity-reach', role: 'MEDIATOR', description: 'share of stored opportunities materially affected' },
      { id: 'cleared-contribution-profit', role: 'OUTCOME', description: 'risk-adjusted cleared contribution profit' }
    ],
    edges: [
      { from: 'frontier-primitive', to: 'unit-cost', sign: 'UNKNOWN', evidenceClass: 'HYPOTHESIS' },
      { from: 'frontier-primitive', to: 'task-reliability', sign: 'UNKNOWN', evidenceClass: 'HYPOTHESIS' },
      { from: 'task-reliability', to: 'opportunity-reach', sign: 'POSITIVE', evidenceClass: 'HYPOTHESIS' },
      { from: 'unit-cost', to: 'cleared-contribution-profit', sign: 'NEGATIVE', evidenceClass: 'HYPOTHESIS' },
      { from: 'opportunity-reach', to: 'cleared-contribution-profit', sign: 'POSITIVE', evidenceClass: 'HYPOTHESIS' }
    ],
    evidenceRefs: [evidenceRef]
  });
  const protocol = compileEconomicScientistProtocol({
    theory: `If ${primitiveText} materially improves task economics or reliability, then at least some affected UberBond opportunity mechanisms should become cheaper, more reliable, or newly feasible without weakening truth or authority boundaries.`,
    predictions: [
      'task-specific benchmark or cost evidence changes in the predicted direction',
      'capability multiplication remains non-zero after stricter semantic review',
      'at least one bounded opportunity hypothesis survives falsification better than its pre-change baseline'
    ],
    falsifiers: [
      'independent benchmark shows no material task improvement',
      'new primitive increases total cost or founder burden after hidden costs',
      'affected opportunity hypotheses fail buyer/economic evidence gates',
      'security, legal, authority, or reliability constraints erase the apparent advantage'
    ],
    observations: ['provider/model benchmark receipts', 'task outcome receipts', 'opportunity experiment evidence', 'founder-minute receipts'],
    interventions: ['bounded sandbox comparison only after existing authority gates pass']
  });
  const topHypotheses = cycle?.portfolio?.options?.map(option => option.hypothesis).filter(Boolean).slice(0, 8) || [];
  const futureMemories = worlds.ok ? buildSyntheticFutureMemories({ worlds: worlds.worlds, hypotheses: topHypotheses, horizon: 'FRONTIER_SCENARIO' }) : null;
  const objectiveGuard = guardMetaObjective({ baseline: baselineObjective, candidate: baselineObjective });
  laboratories.push({
    signalId: cycle.signalId || null,
    primitive: primitiveText,
    worlds,
    causal,
    protocol,
    futureMemories,
    objectiveGuard,
    status: worlds.ok && causal.ok && protocol.ok && objectiveGuard.ok ? 'SCIENTIST_LAB_READY' : 'SCIENTIST_LAB_PARTIAL'
  });
}

const receipt = {
  schemaVersion: 'uberbond.genesis-scientist.tick.v1',
  generatedAt,
  input: inputPath,
  laboratories,
  summary: {
    laboratories: laboratories.length,
    ready: laboratories.filter(item => item.status === 'SCIENTIST_LAB_READY').length,
    syntheticWorlds: laboratories.reduce((sum, item) => sum + (item.worlds?.worlds?.length || 0), 0),
    syntheticFutureMemories: laboratories.reduce((sum, item) => sum + (item.futureMemories?.memories?.length || 0), 0)
  },
  businessEffectAuthority: 'NONE',
  externalEffectAuthority: 'NONE',
  externalEffectLedger: { messages: 0, moneyMovements: 0, purchases: 0, deployments: 0, customerStateMutations: 0, providerCalls: 0 },
  truthBoundary: 'SCIENTIST_LABS_ARE_COUNTERFACTUAL_AND_HYPOTHESIS_DESIGN_RECEIPTS; THEY_ARE_NOT_CAUSAL_MARKET_CUSTOMER_OR_REVENUE_PROOF'
};
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status: 'GENESIS_SCIENTIST_TICK_COMPLETE', ...receipt.summary, output: outputPath, businessEffectAuthority: 'NONE' }, null, 2));
