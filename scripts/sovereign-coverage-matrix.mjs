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
import { verifyCoverageStateEvidenceIntegrity } from '../src/coverage-state-evidence-integrity.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Every canonical source, and which of its lists carry concepts. `class` shapes
// the state ladder: BOUNDARY, EXTERNAL_GATE and ELAPSED_TIME can never be
// satisfied by code, so they are never scored as if they could be.
const FORECAST_ENGINE = 'Sovereign Option & Outcome Forecast Engine';

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
    // The third element names the organ a field belongs to. Supplied only where
    // a real organ exists: fields that are merely evaluation vocabulary are
    // typed as ontology below rather than being smuggled into a build queue.
    ['optionUniverseRequirements', 'FORECAST_REQUIREMENT', FORECAST_ENGINE],
    ['forecastOutputs', 'FORECAST_OUTPUT', FORECAST_ENGINE],
    ['forecastStack', 'FORECAST_MECHANISM', FORECAST_ENGINE],
    ['uncertaintyDecomposition', 'FORECAST_MECHANISM', FORECAST_ENGINE],
    ['forecastStrengthDimensions', 'FORECAST_DIMENSION', FORECAST_ENGINE],
    ['decisionRobustnessDimensions', 'FORECAST_DIMENSION', FORECAST_ENGINE],
    ['decisionOutcomeDimensions', 'FORECAST_DIMENSION', FORECAST_ENGINE],
    ['antiOverconfidenceLaws', 'AUTHORITY_LAW'],
    ['calibrationLedgerFields', 'CALIBRATION_FIELD', 'Calibration Memory'],
    ['sovereignDecisionPacket', 'DECISION_PACKET_FIELD', FORECAST_ENGINE],
    ['canonicalLoop', 'LOOP_STAGE']]],
  ['artifacts/personal-civilization-engine-north-star.json', 'personal-civilization', [
    ['hierarchy', 'HIERARCHY'], ['canonicalLifeSystems', 'PERSONAL_CIVILIZATION_ORGAN'],
    ['supportingCognitiveTechnicalSystems', 'CONCEPT'], ['economicInventionSystems', 'ECONOMIC_DONOR'],
    // The source artifact literally calls these conceptual donors and marks
    // itself CHAT_SPEC_GOAL / implementedClaim:false. Keep every name, but do
    // not convert a far-future donor into a finite engineering obligation merely
    // because the semantic tribunal now treats SPEC_ONLY as FINITE_BEHAVIOR.
    // NAMED_INITIATIVE has the desired donor semantics without pretending these
    // are economically implemented: real implementation evidence can still
    // promote a donor later, while no-evidence rows remain preserved donors.
    ['farFutureConceptualDonors', 'NAMED_INITIATIVE'],
    ['lifeDecisionDimensions', 'FORECAST_DIMENSION', 'Value Manifold'],
    ['humanSovereigntyLaws', 'AUTHORITY_LAW'],
    // These are criteria for a human reviewing UberBond, not outputs any module
    // computes. The repository history explicitly records that distinction.
    // Treat them as evaluation ontology so they stay in the no-drop denominator
    // without becoming 18 fake finite modules in terminal realization.
    ['evaluationDimensions', 'ONTOLOGY']]],
  ['artifacts/perpetual-frontier-genesis.json', 'genesis', [
    ['frontierMechanisms', 'GENESIS_MECHANISM'], ['coreLoop', 'LOOP_STAGE'],
    ['founderFreedomDimensions', 'SOVEREIGNTY_DIMENSION']]],
  ['artifacts/uberbond-total-brain.json', 'total-brain', [
    // truthPriority is an ordered evidence ranking, not a set of rules --
    // "HYPOTHESIS" and "DRAFT_BRANCH_EVIDENCE" are rungs, and asking what
    // module enforces a rung is a category error. Its sibling truthClasses was
    // already typed ONTOLOGY; this was measuring the same thing as six
    // unenforced laws.
    ['truthPriority', 'ONTOLOGY'], ['truthClasses', 'ONTOLOGY'], ['economicLoop', 'LOOP_STAGE'],
    ['constitutionalSpine', 'HIERARCHY'], ['productFamilies', 'ECONOMIC_DONOR'],
    ['recurringProductLineage', 'ECONOMIC_DONOR'], ['platformDestinations', 'ECONOMIC_DONOR'],
    // Capability domains are taxonomy buckets containing many mechanisms, not
    // one executable unit. Keep every literal name while refusing to create a
    // fake module obligation for the bucket itself.
    ['capabilityDomains', 'ONTOLOGY'], ['softwareReferenceSurfaces', 'REFERENCE_SURFACE'],
    // Named open runtimes are replaceable supplier/reference surfaces. UberBond
    // may integrate them but must not pretend it owes an internal reimplementation.
    ['openModelRuntimes', 'REFERENCE_SURFACE'], ['permanentTruthLaws', 'AUTHORITY_LAW']]],
  ['artifacts/uberbond-memory-index.json', 'memory-index', [
    ['productFamilies', 'ECONOMIC_DONOR'], ['recurringProducts', 'ECONOMIC_DONOR'],
    ['longTermPlatforms', 'ECONOMIC_DONOR'], ['partnerGatedOfferLineage', 'ECONOMIC_DONOR'],
    // Shared operating-system domains are index categories, not individual
    // executable organs. Their descendants carry implementation evidence.
    ['strategicStages', 'STRATEGIC_STAGE'], ['sharedOperatingSystemDomains', 'ONTOLOGY'],
    ['antiForgettingRules', 'AUTHORITY_LAW']]]
];

// Nested families and object lists, which need a key rather than a bare string.
const NESTED = [
  ['artifacts/uberbond-total-brain.json', 'total-brain', 'namedInitiativeFamilies', 'NAMED_INITIATIVE'],
  ['artifacts/uberbond-memory-index.json', 'memory-index', 'namedInitiatives', 'NAMED_INITIATIVE'],
  // External supplier entries are preserved literal references. Their adapters,
  // packages and callability have separate evidence; the supplier name itself is
  // not a missing internal product that UberBond must clone.
  ['artifacts/external-skill-plugin-registry.json', 'suppliers', 'entries', 'REFERENCE_SURFACE'],
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
    for (const [key, klass, parent = null] of lists) {
      for (const entry of (Array.isArray(doc[key]) ? doc[key] : [])) {
        const name = conceptName(entry);
        if (name) concepts.push({ name, class: klass, source, sourceArtifact: file, sourceList: key, parent });
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

export function repoIndex() {
  let classification = { modules: {} };
  try { classification = JSON.parse(readFileSync(join(root, 'config', 'reachability-classification.json'), 'utf8')); } catch { /* absent */ }
  const gated = new Set(Object.keys(classification.modules || {}));
  // src, scripts and api are all implementation surfaces. Indexing only src
  // made every script-hosted concept read SPEC_ONLY -- Mutation War is a
  // scripts/ module with seven suites and a mutation registry behind it, and it
  // was being reported as an idea nobody had built.
  // Project-native skills are an implementation surface too. Indexing only
  // src/scripts/api reported Find Skills, Task Observer, Strix and Agent Reach
  // as unbuilt while their skill packages sit in the tree -- and would have
  // pushed them toward being labelled externally blocked, which they are not.
  const sourceFiles = [
    ...walkFiles('src'), ...walkFiles('scripts'), ...walkFiles('api'),
    ...walkFiles('.claude/skills', '.md')
  ];
  const testFiles = walkFiles('tests').filter(file => file.endsWith('.test.mjs'));
  return {
    sourceFiles,
    testFiles,
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

  let enforcement = [];
  const enforcementPath = join(root, 'artifacts/sovereign/enforcement-manifest.json');
  if (existsSync(enforcementPath)) {
    try { enforcement = JSON.parse(readFileSync(enforcementPath, 'utf8')).entries || []; }
    catch (error) {
      console.error(JSON.stringify({ ok: false, status: 'COVERAGE_ENFORCEMENT_UNREADABLE', detail: error.message }, null, 2));
      return 2;
    }
  }

  let externalGates = [];
  const gatePath = join(root, 'artifacts/sovereign/external-gate-manifest.json');
  if (existsSync(gatePath)) {
    try { externalGates = JSON.parse(readFileSync(gatePath, 'utf8')).entries || []; }
    catch (error) {
      console.error(JSON.stringify({ ok: false, status: 'COVERAGE_EXTERNAL_GATES_UNREADABLE', detail: error.message }, null, 2));
      return 2;
    }
  }

  const matrix = compileCoverageMatrix({ concepts, repoIndex: repoIndex(), laneMap: LANE_BY_CLASS, manifest, enforcement, externalGates, sourceCommit });
  if (!matrix.ok) { console.error(JSON.stringify(matrix, null, 2)); return 2; }

  // Do not persist a matrix whose state labels cannot be independently
  // reconstructed from the row evidence and semantic class. This is a second,
  // non-promoting tribunal over the compiler output: it can only refuse an
  // overclaim, and the same verifier is re-run by current-truth regeneration.
  const stateEvidenceIntegrity = verifyCoverageStateEvidenceIntegrity(matrix);
  if (!stateEvidenceIntegrity.ok) {
    console.error(JSON.stringify({
      ok: false,
      status: 'COVERAGE_STATE_EVIDENCE_INTEGRITY_REFUSED',
      reasonCodes: stateEvidenceIntegrity.reasonCodes,
      violations: stateEvidenceIntegrity.violations,
      businessEffectAuthority: 'NONE'
    }, null, 2));
    return 2;
  }

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
    stateEvidenceIntegrity: stateEvidenceIntegrity.status,
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