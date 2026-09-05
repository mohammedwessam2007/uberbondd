#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compileUberBondCognitiveGraph, cognitiveGraphIntegrity } from '../src/uberbond-cognitive-graph.mjs';
import { compileClosedLoopActivation } from '../src/uberbond-cognitive-bus.mjs';
import { compileCognitiveEventsFromArtifacts } from '../src/uberbond-cognitive-adapters.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = new Map();
for (let i = 2; i < process.argv.length; i += 1) {
  const arg = process.argv[i];
  if (!arg.startsWith('--')) continue;
  const next = process.argv[i + 1];
  args.set(arg, next && !next.startsWith('--') ? process.argv[++i] : true);
}

async function readJson(path) {
  try { return JSON.parse(await readFile(path, 'utf8')); }
  catch { return null; }
}

const paths = {
  gamechanger: resolve(root, String(args.get('--gamechanger') || 'artifacts/gamechanger-mesh-latest.json')),
  genesis: resolve(root, String(args.get('--genesis') || 'artifacts/perpetual-frontier-genesis-latest.json')),
  lineage: resolve(root, String(args.get('--lineage') || 'config/uberbond-cognitive-lineage.json')),
  capabilityGenome: args.get('--capability-genome') ? resolve(root, String(args.get('--capability-genome'))) : null,
  selfMaintenance: args.get('--self-maintenance') ? resolve(root, String(args.get('--self-maintenance'))) : null,
  commercialOutcome: args.get('--commercial-outcome') ? resolve(root, String(args.get('--commercial-outcome'))) : null,
  output: resolve(root, String(args.get('--output') || 'artifacts/uberbond-cognitive-cycle-latest.json'))
};

const [gamechanger, genesis, lineage, capabilityGenome, selfMaintenance, commercialOutcome] = await Promise.all([
  readJson(paths.gamechanger),
  readJson(paths.genesis),
  readJson(paths.lineage),
  paths.capabilityGenome ? readJson(paths.capabilityGenome) : null,
  paths.selfMaintenance ? readJson(paths.selfMaintenance) : null,
  paths.commercialOutcome ? readJson(paths.commercialOutcome) : null
]);

const graph = compileUberBondCognitiveGraph();
const integrity = cognitiveGraphIntegrity(graph);
if (!graph.ok || !integrity.ok) {
  process.stderr.write(`${JSON.stringify({ ok: false, status: 'COGNITIVE_GRAPH_NOT_INTEGRAL', graph, integrity }, null, 2)}\n`);
  process.exit(2);
}
if (!lineage || lineage.schemaVersion !== 'uberbond.cognitive-lineage.v1' || !Array.isArray(lineage.lineages)) {
  process.stderr.write(`${JSON.stringify({ ok: false, status: 'COGNITIVE_LINEAGE_MAP_REQUIRED' }, null, 2)}\n`);
  process.exit(2);
}
const livingIds = new Set(graph.nodes.map(node => node.id));
const invalidLineages = lineage.lineages.filter(row => !Array.isArray(row?.livingOrgans) || row.livingOrgans.some(id => !livingIds.has(id)));
if (invalidLineages.length) {
  process.stderr.write(`${JSON.stringify({ ok: false, status: 'COGNITIVE_LINEAGE_TARGET_INVALID', invalidLineages: invalidLineages.map(row => row?.id || null) }, null, 2)}\n`);
  process.exit(2);
}

const adapted = compileCognitiveEventsFromArtifacts({
  gamechanger,
  genesis,
  capabilityGenome,
  selfMaintenance,
  commercialOutcome,
  refs: {
    gamechanger: 'artifact:gamechanger-mesh-latest',
    genesis: 'artifact:perpetual-frontier-genesis-latest',
    capabilityGenome: paths.capabilityGenome ? `artifact:${paths.capabilityGenome}` : undefined,
    selfMaintenance: paths.selfMaintenance ? `receipt:${paths.selfMaintenance}` : undefined,
    commercialOutcome: paths.commercialOutcome ? `receipt:${paths.commercialOutcome}` : undefined
  }
});
if (!adapted.ok) {
  process.stderr.write(`${JSON.stringify(adapted, null, 2)}\n`);
  process.exit(2);
}

const cycle = compileClosedLoopActivation({ graph, events: adapted.events });
if (!cycle.ok) {
  process.stderr.write(`${JSON.stringify(cycle, null, 2)}\n`);
  process.exit(2);
}

const receipt = {
  schemaVersion: 'uberbond.cognitive-cycle.v1',
  generatedAt: new Date().toISOString(),
  graph: {
    schemaVersion: graph.schemaVersion,
    graphDigest: graph.graphDigest,
    nodeCount: integrity.nodeCount,
    edgeCount: integrity.edgeCount,
    integrityStatus: integrity.status
  },
  lineage: {
    schemaVersion: lineage.schemaVersion,
    lineageCount: lineage.lineages.length,
    donorNameCount: lineage.lineages.reduce((sum, row) => sum + (Array.isArray(row.names) ? row.names.length : 0), 0),
    mappings: lineage.lineages
  },
  sources: {
    gamechanger: Boolean(gamechanger),
    genesis: Boolean(genesis),
    capabilityGenome: Boolean(capabilityGenome),
    selfMaintenance: Boolean(selfMaintenance),
    commercialOutcome: Boolean(commercialOutcome)
  },
  events: adapted.events,
  activationSummary: {
    eventCount: cycle.eventCount,
    activationCount: cycle.activationCount,
    targetCounts: cycle.targetCounts
  },
  routes: cycle.routes,
  businessEffectAuthority: 'NONE',
  externalEffectAuthority: 'NONE',
  truthBoundary: 'THIS_RECEIPT_IS_A COGNITIVE ROUTING AND LINEAGE MAP. ACTIVATION MEANS ATTENTION/CONTEXT FLOW ONLY. HISTORICAL DONOR NAMES DO NOT BECOME LIVE RUNTIMES, AND NO EDGE CREATES EXTERNAL CONSEQUENCE AUTHORITY.'
};

await mkdir(dirname(paths.output), { recursive: true });
await writeFile(paths.output, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify({
  ok: true,
  status: 'UBERBOND_COGNITIVE_CYCLE_COMPILED',
  graphDigest: graph.graphDigest,
  nodes: integrity.nodeCount,
  edges: integrity.edgeCount,
  lineages: lineage.lineages.length,
  donorNames: receipt.lineage.donorNameCount,
  events: cycle.eventCount,
  activations: cycle.activationCount,
  targetCounts: cycle.targetCounts,
  output: paths.output,
  businessEffectAuthority: 'NONE'
}, null, 2)}\n`);
