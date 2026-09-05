#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compileUberBondCognitiveGraph, cognitiveGraphIntegrity } from '../src/uberbond-cognitive-graph.mjs';
import { compileClosedLoopActivation } from '../src/uberbond-cognitive-bus.mjs';
import { compileCognitiveEventsFromArtifacts } from '../src/uberbond-cognitive-adapters.mjs';
import { eventFromEventHorizonDoctor } from '../src/event-horizon-cognitive-adapter.mjs';
import { compileGenesisLobeEvents } from '../src/genesis-cognitive-adapters.mjs';
import { compileWallbreakerReflexes } from '../src/wallbreaker-cognitive-reflex.mjs';
import { eventFromFeatureGenome, eventFromFrontierModelTeamDoctor } from '../src/whole-brain-cognitive-adapters.mjs';

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
const optionalPath = (flag, fallback) => resolve(root, String(args.get(flag) || fallback));

const paths = {
  gamechanger: optionalPath('--gamechanger', 'artifacts/gamechanger-mesh-latest.json'),
  genesis: optionalPath('--genesis', 'artifacts/perpetual-frontier-genesis-latest.json'),
  evolution: optionalPath('--genesis-evolution', 'artifacts/genesis-evolution-latest.json'),
  scientist: optionalPath('--genesis-scientist', 'artifacts/genesis-scientist-latest.json'),
  ontology: optionalPath('--genesis-ontology', 'artifacts/genesis-ontology-latest.json'),
  metabolism: optionalPath('--genesis-metabolism', 'artifacts/genesis-metabolism-latest.json'),
  lineage: optionalPath('--lineage', 'config/uberbond-cognitive-lineage.json'),
  capabilityGenome: args.get('--capability-genome') ? resolve(root, String(args.get('--capability-genome'))) : null,
  eventHorizon: args.get('--event-horizon') ? resolve(root, String(args.get('--event-horizon'))) : null,
  featureGenome: args.get('--feature-genome') ? resolve(root, String(args.get('--feature-genome'))) : null,
  frontierModelTeam: args.get('--frontier-model-team') ? resolve(root, String(args.get('--frontier-model-team'))) : null,
  selfMaintenance: args.get('--self-maintenance') ? resolve(root, String(args.get('--self-maintenance'))) : null,
  commercialOutcome: args.get('--commercial-outcome') ? resolve(root, String(args.get('--commercial-outcome'))) : null,
  output: optionalPath('--output', 'artifacts/uberbond-cognitive-cycle-latest.json')
};

const [gamechanger, genesis, evolution, scientist, ontology, metabolism, lineage, capabilityGenome, eventHorizon, featureGenome, frontierModelTeam, selfMaintenance, commercialOutcome] = await Promise.all([
  readJson(paths.gamechanger), readJson(paths.genesis), readJson(paths.evolution), readJson(paths.scientist),
  readJson(paths.ontology), readJson(paths.metabolism), readJson(paths.lineage),
  paths.capabilityGenome ? readJson(paths.capabilityGenome) : null,
  paths.eventHorizon ? readJson(paths.eventHorizon) : null,
  paths.featureGenome ? readJson(paths.featureGenome) : null,
  paths.frontierModelTeam ? readJson(paths.frontierModelTeam) : null,
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
  gamechanger, genesis, capabilityGenome, selfMaintenance, commercialOutcome,
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
const genesisLobes = compileGenesisLobeEvents({
  evolution, scientist, ontology, metabolism,
  refs: {
    evolution: 'artifact:genesis-evolution-latest', scientist: 'artifact:genesis-scientist-latest',
    ontology: 'artifact:genesis-ontology-latest', metabolism: 'artifact:genesis-metabolism-latest'
  }
});
if (!genesisLobes.ok) {
  process.stderr.write(`${JSON.stringify(genesisLobes, null, 2)}\n`);
  process.exit(2);
}
const eventHorizonEvent = eventHorizon ? eventFromEventHorizonDoctor(eventHorizon, { ref: `artifact:${paths.eventHorizon}` }) : null;
if (eventHorizonEvent && !eventHorizonEvent.ok) {
  process.stderr.write(`${JSON.stringify(eventHorizonEvent, null, 2)}\n`);
  process.exit(2);
}
const featureGenomeEvent = featureGenome ? eventFromFeatureGenome(featureGenome, { ref: `artifact:${paths.featureGenome}` }) : null;
if (featureGenomeEvent && !featureGenomeEvent.ok) {
  process.stderr.write(`${JSON.stringify(featureGenomeEvent, null, 2)}\n`);
  process.exit(2);
}
const frontierModelEvent = frontierModelTeam ? eventFromFrontierModelTeamDoctor(frontierModelTeam, { ref: `artifact:${paths.frontierModelTeam}` }) : null;
if (frontierModelEvent && !frontierModelEvent.ok) {
  process.stderr.write(`${JSON.stringify(frontierModelEvent, null, 2)}\n`);
  process.exit(2);
}
const events = [
  ...adapted.events,
  ...genesisLobes.events,
  ...(eventHorizonEvent ? [eventHorizonEvent] : []),
  ...(featureGenomeEvent ? [featureGenomeEvent] : []),
  ...(frontierModelEvent ? [frontierModelEvent] : [])
];
const wallbreaker = compileWallbreakerReflexes(events);
if (!wallbreaker.ok) {
  process.stderr.write(`${JSON.stringify(wallbreaker, null, 2)}\n`);
  process.exit(2);
}
const cycle = compileClosedLoopActivation({ graph, events });
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
    integrityStatus: integrity.status,
    nodes: graph.nodes,
    edges: graph.edges
  },
  lineage: {
    schemaVersion: lineage.schemaVersion,
    lineageCount: lineage.lineages.length,
    donorNameCount: lineage.lineages.reduce((sum, row) => sum + (Array.isArray(row.names) ? row.names.length : 0), 0),
    mappings: lineage.lineages
  },
  sources: {
    gamechanger: Boolean(gamechanger), genesis: Boolean(genesis), genesisEvolution: Boolean(evolution),
    genesisScientist: Boolean(scientist), genesisOntology: Boolean(ontology), genesisMetabolism: Boolean(metabolism),
    capabilityGenome: Boolean(capabilityGenome), eventHorizon: Boolean(eventHorizon),
    featureGenome: Boolean(featureGenome), frontierModelTeam: Boolean(frontierModelTeam),
    selfMaintenance: Boolean(selfMaintenance), commercialOutcome: Boolean(commercialOutcome)
  },
  featureGenome: featureGenome ? {
    genomeDigest: featureGenome.genomeDigest || null,
    repositoryArtifactCount: featureGenome.repositoryArtifactCount || 0,
    sourceDependencyEdgeCount: featureGenome.sourceDependencyEdgeCount || 0,
    readinessCapabilityCount: featureGenome.readinessCapabilityCount || 0,
    genesisIdeaCount: featureGenome.genesisIdeaCount || 0,
    donorLineageCount: featureGenome.donorLineageCount || 0,
    semanticReviewQueueCount: featureGenome.fallbackArtifactCount || 0
  } : null,
  frontierModelTeam: frontierModelTeam ? {
    status: frontierModelTeam.status || null,
    candidateCount: frontierModelTeam?.candidateRegistry?.candidateCount || 0,
    configuredCandidateCount: frontierModelTeam.configuredCandidateCount || 0,
    callableCandidateCount: frontierModelTeam.callableCandidateCount || 0,
    missionDigest: frontierModelTeam?.teamMission?.missionDigest || null
  } : null,
  events,
  activationSummary: { eventCount: cycle.eventCount, activationCount: cycle.activationCount, targetCounts: cycle.targetCounts },
  wallbreaker: {
    reflexCount: wallbreaker.reflexCount,
    failureClassCounts: wallbreaker.failureClassCounts,
    countermoveCounts: wallbreaker.countermoveCounts,
    reflexes: wallbreaker.reflexes
  },
  routes: cycle.routes,
  businessEffectAuthority: 'NONE',
  externalEffectAuthority: 'NONE',
  truthBoundary: 'THIS RECEIPT IS A COGNITIVE ROUTING, FEATURE-COVERAGE, MODEL-ROSTER, LINEAGE AND RECOVERY-REFLEX MAP. ACTIVATION AND WALLBREAKER COUNTERMOVES ARE ATTENTION/PLANNING ONLY. FEATURE CLASSIFICATION DOES NOT PROVE BEHAVIOR, MODEL CATALOG PRESENCE DOES NOT PROVE CALLABILITY, HISTORICAL DONOR NAMES DO NOT BECOME LIVE RUNTIMES, ALLOCATION SCORES DO NOT BECOME DEMAND, COUNTERFACTUAL GENESIS OUTPUT DOES NOT BECOME EXTERNAL FACT, AND NO EDGE OR RECOVERY REFLEX CREATES EXTERNAL CONSEQUENCE AUTHORITY.'
};

await mkdir(dirname(paths.output), { recursive: true });
await writeFile(paths.output, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify({
  ok: true, status: 'UBERBOND_COGNITIVE_CYCLE_COMPILED', graphDigest: graph.graphDigest,
  nodes: integrity.nodeCount, edges: integrity.edgeCount, lineages: lineage.lineages.length,
  donorNames: receipt.lineage.donorNameCount, events: cycle.eventCount, activations: cycle.activationCount,
  featureArtifacts: receipt.featureGenome?.repositoryArtifactCount || 0,
  frontierModelCandidates: receipt.frontierModelTeam?.candidateCount || 0,
  wallbreakerReflexes: wallbreaker.reflexCount, targetCounts: cycle.targetCounts, output: paths.output,
  businessEffectAuthority: 'NONE'
}, null, 2)}\n`);
