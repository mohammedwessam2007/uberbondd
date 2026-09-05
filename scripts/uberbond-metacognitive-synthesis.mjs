#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { synthesizeUberBondMetacognition } from '../src/uberbond-metacognitive-synthesis.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = async (relative, required = false) => {
  try { return JSON.parse(await readFile(resolve(root, relative), 'utf8')); }
  catch (error) {
    if (required) throw new Error(`required metacognitive input missing or invalid: ${relative}`);
    return null;
  }
};

try {
  const [
    featureGenome,
    featureAtomAtlas,
    genesisEvolution,
    genesisOntology,
    eventHorizon,
    capabilityGenome,
    frontierModelTeam,
    computeSovereignty
  ] = await Promise.all([
    readJson('artifacts/uberbond-feature-genome-latest.json', true),
    readJson('artifacts/uberbond-feature-atom-atlas-latest.json', true),
    readJson('artifacts/genesis-evolution-latest.json'),
    readJson('artifacts/genesis-ontology-latest.json'),
    readJson('artifacts/event-horizon/economic-genome-2026-08-31.json', true),
    readJson('artifacts/cognitive/capability-genome-doctor-latest.json'),
    readJson('artifacts/cognitive/frontier-model-team-doctor-latest.json'),
    readJson('artifacts/cognitive/compute-sovereignty-doctor-latest.json')
  ]);
  const outputRelative = process.argv[2] || 'artifacts/uberbond-metacognitive-synthesis-latest.json';
  const output = resolve(root, outputRelative);
  const result = synthesizeUberBondMetacognition({
    featureGenome,
    featureAtomAtlas,
    genesisEvolution,
    genesisOntology,
    eventHorizon,
    capabilityGenome,
    frontierModelTeam,
    computeSovereignty,
    synthesisRef: `artifact:${outputRelative}`
  });
  if (!result.ok) {
    process.stderr.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exit(2);
  }
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify({
    ok: true,
    status: result.status,
    synthesisDigest: result.synthesisDigest,
    featureAtoms: result.inputs.featureAtomCount,
    exportedFeatures: result.inputs.exportedFeatureCount,
    partialGenesisPrimitives: result.inputs.partialGenesisPrimitiveCount,
    sourceOnlyGenesisCandidates: result.inputs.sourceOnlyGenesisCandidateCount,
    provenComputeOffers: result.inputs.provenComputeOfferCount,
    zeroCostAuthorizedTokens: result.inputs.zeroCostAuthorizedTokens,
    unknownUnknowns: result.hypotheses.unknownUnknownCount,
    ideaCandidates: result.hypotheses.ideaCandidateCount,
    missingLawCandidates: result.hypotheses.missingLawCandidateCount,
    repeatedGates: result.hypotheses.repeatedGateCount,
    cognitiveEvents: result.eventCount,
    output,
    businessEffectAuthority: 'NONE'
  }, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${JSON.stringify({ ok: false, status: 'METACOGNITIVE_SYNTHESIS_OPERATOR_FAILED', reason: error?.message || 'unknown-error', businessEffectAuthority: 'NONE' }, null, 2)}\n`);
  process.exit(2);
}
