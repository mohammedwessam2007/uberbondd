#!/usr/bin/env node
// Extracts every concept from every canonical source and compiles the matrix.
//
// The extraction map below is the denominator. A canonical artifact that is not
// listed here contributes nothing, so adding a source is a deliberate edit and
// `--verify` fails when a declared source is missing rather than quietly
// shrinking the count.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileCoverageMatrix } from '../src/sovereign-coverage-matrix.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Every canonical source, and which of its lists carry concepts. `class` shapes
// the state ladder: BOUNDARY, EXTERNAL_GATE and ELAPSED_TIME can never be
// satisfied by code, so they are never scored as if they could be.
const SOURCES = [
  ['artifacts/sovereign-cognitive-continuum-total-north-star.json', 'total-north-star', [
    ['terminalTriad', 'TERMINAL_LAW'], ['canonicalHierarchy', 'HIERARCHY'],
    ['terminalConcepts', 'CONCEPT'], ['containedPersonalCivilizationSystems', 'PERSONAL_CIVILIZATION_ORGAN'],
    ['supportingEconomicAndTechnicalDonors', 'ECONOMIC_DONOR'], ['terminalOntology', 'ONTOLOGY'],
    ['hardBoundaries', 'BOUNDARY']]],
  ['artifacts/sovereign-cognitive-continuum-chat-completeness-aliases.json', 'aliases', [['aliases', 'ALIAS']]],
  ['artifacts/sovereign-cognitive-continuum-north-star.json', 'north-star', [
    ['terminalBoundary', 'BOUNDARY'], ['authorityLaws', 'AUTHORITY_LAW'], ['canonicalHierarchy', 'HIERARCHY'],
    ['coreOrgans', 'ORGAN'], ['containedPersonalCivilizationSystems', 'PERSONAL_CIVILIZATION_ORGAN'],
    ['canonicalLoop', 'LOOP_STAGE']]],
  ['artifacts/sovereign-option-outcome-forecast-engine.json', 'forecast', [
    ['optionUniverseRequirements', 'FORECAST_REQUIREMENT'], ['forecastOutputs', 'FORECAST_OUTPUT'],
    ['forecastStack', 'FORECAST_MECHANISM'], ['uncertaintyDecomposition', 'FORECAST_MECHANISM'],
    ['forecastStrengthDimensions', 'FORECAST_DIMENSION'], ['decisionRobustnessDimensions', 'FORECAST_DIMENSION'],
    ['decisionOutcomeDimensions', 'FORECAST_DIMENSION'], ['antiOverconfidenceLaws', 'AUTHORITY_LAW'],
    ['calibrationLedgerFields', 'CALIBRATION_FIELD'], ['sovereignDecisionPacket', 'DECISION_PACKET_FIELD'],
    ['canonicalLoop', 'LOOP_STAGE']]],
  ['artifacts/personal-civilization-engine-north-star.json', 'personal-civilization', [
    ['hierarchy', 'HIERARCHY'], ['canonicalLifeSystems', 'PERSONAL_CIVILIZATION_ORGAN'],
    ['supportingCognitiveTechnicalSystems', 'CONCEPT'], ['economicInventionSystems', 'ECONOMIC_DONOR'],
    ['farFutureConceptualDonors', 'CONCEPT'], ['lifeDecisionDimensions', 'FORECAST_DIMENSION'],
    ['humanSovereigntyLaws', 'AUTHORITY_LAW'], ['evaluationDimensions', 'FORECAST_DIMENSION']]],
  ['artifacts/perpetual-frontier-genesis.json', 'genesis', [
    ['frontierMechanisms', 'GENESIS_MECHANISM'], ['coreLoop', 'LOOP_STAGE'],
    ['founderFreedomDimensions', 'SOVEREIGNTY_DIMENSION']]],
  ['artifacts/uberbond-total-brain.json', 'total-brain', [
    ['truthPriority', 'AUTHORITY_LAW'], ['truthClasses', 'ONTOLOGY'], ['economicLoop', 'LOOP_STAGE'],
    ['constitutionalSpine', 'HIERARCHY'], ['productFamilies', 'ECONOMIC_DONOR'],
    ['recurringProductLineage', 'ECONOMIC_DONOR'], ['platformDestinations', 'ECONOMIC_DONOR'],
    ['capabilityDomains', 'CAPABILITY_DOMAIN'], ['softwareReferenceSurfaces', 'REFERENCE_SURFACE'],
    ['openModelRuntimes', 'COMPUTE_RUNTIME'], ['permanentTruthLaws', 'AUTHORITY_LAW']]],
  ['artifacts/uberbond-memory-index.json', 'memory-index', [
    ['productFamilies', 'ECONOMIC_DONOR'], ['recurringProducts', 'ECONOMIC_DONOR'],
    ['longTermPlatforms', 'ECONOMIC_DONOR'], ['partnerGatedOfferLineage', 'ECONOMIC_DONOR'],
    ['strategicStages', 'STRATEGIC_STAGE'], ['sharedOperatingSystemDomains', 'CAPABILITY_DOMAIN'],
    ['antiForgettingRules', 'AUTHORITY_LAW']]]
];

// Nested families and object lists, which need a key rather than a bare string.
const NESTED = [
  ['artifacts/uberbond-total-brain.json', 'total-brain', 'namedInitiativeFamilies', 'NAMED_INITIATIVE'],
  ['artifacts/uberbond-memory-index.json', 'memory-index', 'namedInitiatives', 'NAMED_INITIATIVE'],
  ['artifacts/external-skill-plugin-registry.json', 'suppliers', 'entries', 'EXTERNAL_SUPPLIER'],
  ['artifacts/capability-genome/capability-atoms.json', 'capability-atoms', 'atoms', 'CAPABILITY_ATOM']
];

const LANE_BY_CLASS = {
  PERSONAL_CIVILIZATION_ORGAN: 'OMEGA-01',
  FORECAST_REQUIREMENT: 'OMEGA-02', FORECAST_OUTPUT: 'OMEGA-02', FORECAST_MECHANISM: 'OMEGA-02',
  FORECAST_DIMENSION: 'OMEGA-02', CALIBRATION_FIELD: 'OMEGA-13', DECISION_PACKET_FIELD: 'OMEGA-02',
  ONTOLOGY: 'OMEGA-03', SOVEREIGNTY_DIMENSION: 'OMEGA-04', AUTHORITY_LAW: 'OMEGA-04',
  BOUNDARY: 'OMEGA-04', COMPUTE_RUNTIME: 'OMEGA-06', GENESIS_MECHANISM: 'OMEGA-07',
  CAPABILITY_ATOM: 'OMEGA-08', CAPABILITY_DOMAIN: 'OMEGA-08', EXTERNAL_SUPPLIER: 'OMEGA-08',
  REFERENCE_SURFACE: 'OMEGA-09', ECONOMIC_DONOR: 'OMEGA-09', STRATEGIC_STAGE: 'OMEGA-09',
  NAMED_INITIATIVE: 'OMEGA-14', HIERARCHY: 'OMEGA-14', LOOP_STAGE: 'OMEGA-14',
  TERMINAL_LAW: 'OMEGA-14', ALIAS: 'OMEGA-14', CONCEPT: 'OMEGA-14'
};

function walkFiles(dir, extension = '.mjs') {
  const found = [];
  const walk = relative => {
    let entries;
    try { entries = readdirSync(join(root, relative), { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const child = `${relative}/${entry.name}`;
      if (entry.isDirectory()) walk(child);
      else if (entry.name.endsWith(extension)) found.push(child);
    }
  };
  walk(dir);
  return found;
}

function conceptName(value) {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    return value.name || value.alias || value.capabilityId || value.atomId || value.id || value.title || null;
  }
  return null;
}

export function extractConcepts() {
  const concepts = [];
  const missingSources = [];

  for (const [file, source, lists] of SOURCES) {
    if (!existsSync(join(root, file))) { missingSources.push(file); continue; }
    const doc = JSON.parse(readFileSync(join(root, file), 'utf8'));
    for (const [key, klass] of lists) {
      for (const entry of (Array.isArray(doc[key]) ? doc[key] : [])) {
        const name = conceptName(entry);
        if (name) concepts.push({ name, class: klass, source, sourceArtifact: file, sourceList: key });
      }
    }
  }

  for (const [file, source, key, klass] of NESTED) {
    if (!existsSync(join(root, file))) { missingSources.push(file); continue; }
    const doc = JSON.parse(readFileSync(join(root, file), 'utf8'));
    const container = doc[key];
    if (Array.isArray(container)) {
      for (const entry of container) {
        const name = conceptName(entry);
        if (name) concepts.push({ name, class: klass, source, sourceArtifact: file, sourceList: key });
      }
    } else if (container && typeof container === 'object') {
      for (const [family, entries] of Object.entries(container)) {
        for (const entry of (Array.isArray(entries) ? entries : [])) {
          const name = conceptName(entry);
          if (name) concepts.push({ name, class: klass, source, sourceArtifact: file, sourceList: `${key}.${family}` });
        }
      }
    }
  }

  return { concepts, missingSources };
}

function repoIndex() {
  let classification = { modules: {} };
  try { classification = JSON.parse(readFileSync(join(root, 'config/reachability-classification.json'), 'utf8')); } catch { /* absent */ }
  const gated = new Set(Object.keys(classification.modules || {}));
  // src, scripts and api are all implementation surfaces. Indexing only src
  // made every script-hosted concept read SPEC_ONLY -- Mutation War is a
  // scripts/ module with seven suites and a mutation registry behind it, and it
  // was being reported as an idea nobody had built.
  const sourceFiles = [...walkFiles('src'), ...walkFiles('scripts'), ...walkFiles('api')];
  return {
    sourceFiles,
    testFiles: walkFiles('tests'),
    // Approximate rather than pretending: a module carrying a registered gate is
    // deliberately unreached, and anything else with a source file is treated as
    // operator-reachable at worst. The exact production partition lives in the
    // reachability ratchet and is not recomputed here.
    productionReachable: sourceFiles.filter(file => !gated.has(file)),
    operatorReachable: sourceFiles
  };
}

function main() {
  const { concepts, missingSources } = extractConcepts();
  if (missingSources.length) {
    console.error(JSON.stringify({ ok: false, status: 'COVERAGE_SOURCE_MISSING', missingSources }, null, 2));
    return 2;
  }
  let sourceCommit = null;
  try { sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(); } catch { /* no git */ }

  // Absent is fine; malformed is not. A manifest that fails to parse must not
  // read as "no declarations", which would silently drop every concept whose
  // implementation is only discoverable through it.
  let manifest = [];
  const manifestPath = join(root, 'artifacts/sovereign/implementation-manifest.json');
  if (existsSync(manifestPath)) {
    try { manifest = JSON.parse(readFileSync(manifestPath, 'utf8')).entries || []; }
    catch (error) {
      console.error(JSON.stringify({ ok: false, status: 'COVERAGE_MANIFEST_UNREADABLE', detail: error.message }, null, 2));
      return 2;
    }
  }

  const matrix = compileCoverageMatrix({ concepts, repoIndex: repoIndex(), laneMap: LANE_BY_CLASS, manifest, sourceCommit });
  if (!matrix.ok) { console.error(JSON.stringify(matrix, null, 2)); return 2; }

  const output = join(root, 'artifacts/sovereign/implementation-coverage-matrix.json');
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(matrix, null, 2)}\n`, 'utf8');

  console.log(JSON.stringify({
    status: matrix.status,
    extractedConcepts: matrix.counts.extractedConcepts,
    rows: matrix.counts.rows,
    mergedAliasRows: matrix.counts.mergedAliasRows,
    byState: matrix.counts.byState,
    byLane: matrix.counts.byLane,
    output: 'artifacts/sovereign/implementation-coverage-matrix.json',
    businessEffectAuthority: 'NONE'
  }, null, 2));
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = main(); }
  catch (error) {
    console.error(JSON.stringify({ status: 'COVERAGE_MATRIX_CRASHED', reason: String(error?.message || error) }, null, 2));
    process.exitCode = 2;
  }
}
