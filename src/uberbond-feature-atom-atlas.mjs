import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import { extractGenesisIdeaRegistry } from './perpetual-frontier-genesis.mjs';

export const UBERBOND_FEATURE_ATOM_ATLAS_SCHEMA = 'uberbond.feature-atom-atlas.v1';
export const UBERBOND_FEATURE_ATOM_ATLAS_POLICY_VERSION = 'uberbond-feature-atom-atlas-1.0.0';

function zeroEffects() { return structuredClone(ZERO_EXTERNAL_EFFECTS); }
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
}
function digest(value) { return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex'); }
function clean(value, max = 2000) { return String(value ?? '').trim().slice(0, max); }
function safeRead(file) { try { return fs.readFileSync(file, 'utf8'); } catch { return ''; } }

export function deriveExportedFeatureSymbols(sourceText = '') {
  const symbols = new Map();
  const push = (name, kind) => {
    const id = clean(name, 240);
    if (id && /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(id) && !symbols.has(id)) symbols.set(id, kind);
  };
  const declarationPatterns = [
    [/\bexport\s+(?:async\s+)?function\s+([A-Za-z_$][A-Za-z0-9_$]*)/g, 'FUNCTION'],
    [/\bexport\s+class\s+([A-Za-z_$][A-Za-z0-9_$]*)/g, 'CLASS'],
    [/\bexport\s+(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)/g, 'VALUE']
  ];
  for (const [regex, kind] of declarationPatterns) {
    let match;
    while ((match = regex.exec(sourceText))) push(match[1], kind);
  }
  const named = /\bexport\s*\{([^}]+)\}/g;
  let group;
  while ((group = named.exec(sourceText))) {
    for (const entry of group[1].split(',')) {
      const normalized = entry.trim().replace(/^type\s+/, '');
      const parts = normalized.split(/\s+as\s+/i).map(item => item.trim()).filter(Boolean);
      if (parts.length) push(parts.at(-1), 'RE_EXPORT_OR_ALIAS');
    }
  }
  if (/\bexport\s+default\b/.test(sourceText)) push('default', 'DEFAULT_EXPORT');
  return [...symbols.entries()].map(([name, kind]) => ({ name, kind }));
}

function sourceFeatureAtoms(root, featureGenome) {
  const atoms = [];
  for (const artifact of featureGenome?.artifactNodes || []) {
    if (!['SOURCE_MODULE', 'API_ENTRYPOINT', 'OPERATOR_SCRIPT', 'RUNTIME_SURFACE'].includes(artifact.kind)) continue;
    const source = safeRead(path.join(root, artifact.path));
    for (const symbol of deriveExportedFeatureSymbols(source)) {
      atoms.push({
        id: `export:${artifact.path}#${symbol.name}`,
        class: 'EXPORTED_CODE_FEATURE',
        name: symbol.name,
        exportKind: symbol.kind,
        sourcePath: artifact.path,
        primaryFamily: artifact.primaryFamily,
        families: artifact.families,
        organs: artifact.organs,
        truthClass: 'REPOSITORY_DECLARATION'
      });
    }
  }
  return atoms;
}

function genesisIdeaAtoms(root) {
  const markdown = safeRead(path.join(root, 'docs/PERPETUAL_FRONTIER_GENESIS_CANON.md'));
  return extractGenesisIdeaRegistry(markdown).map(idea => ({
    id: `genesis-idea:${idea.id}`,
    class: 'GENESIS_IDEA',
    ordinal: idea.id,
    name: idea.name,
    sourcePath: 'docs/PERPETUAL_FRONTIER_GENESIS_CANON.md',
    organs: ['genesis', 'genesis-evolution', 'genesis-ontology', 'idea-generator'],
    truthClass: 'CHAT_SPEC_GOAL_OR_INTERNAL_RESEARCH'
  }));
}

function operatorAtoms(featureGenome) {
  return (featureGenome?.packageScripts || []).map(operator => ({
    id: operator.id,
    class: 'OPERATOR_COMMAND',
    name: operator.name,
    command: operator.command,
    organs: operator.classification?.organs || [],
    families: operator.classification?.families || [],
    truthClass: 'REPOSITORY_DECLARATION'
  }));
}

function readinessAtoms(featureGenome) {
  return (featureGenome?.readinessCapabilities || []).map(capability => ({
    id: `readiness:${capability.id}`,
    class: 'READINESS_CAPABILITY',
    name: capability.id,
    status: capability.status,
    level: capability.level,
    evidence: capability.evidence,
    tests: capability.tests,
    externalBlocker: capability.externalBlocker,
    truthClass: 'CANONICAL_READINESS_CLAIM'
  }));
}

function gateAtoms(featureGenome) {
  return (featureGenome?.activationGates || []).map(gate => ({
    id: `activation-gate:${gate.id}`,
    class: 'ACTIVATION_GATE',
    name: gate.id,
    description: gate.description,
    releasedBy: gate.releasedBy,
    truthClass: 'CANONICAL_GOVERNANCE_GATE'
  }));
}

function totalBrainAtoms(featureGenome) {
  return (featureGenome?.totalBrainAtoms || []).map((atom, index) => ({
    id: `total-brain:${index + 1}`,
    class: 'TOTAL_BRAIN_MEMORY_ATOM',
    name: atom.value,
    sourcePath: atom.source,
    sourceField: atom.path,
    truthClass: 'ANTI_AMPUTATION_MEMORY_NOT_PRESENT_TENSE_PROOF'
  }));
}

function donorAtoms(featureGenome) {
  const atoms = [];
  for (const lineage of featureGenome?.donorLineages || []) {
    for (const [index, name] of (Array.isArray(lineage.names) ? lineage.names : []).entries()) {
      atoms.push({
        id: `donor:${lineage.id}:${index + 1}`,
        class: 'HISTORICAL_DONOR',
        name,
        lineageId: lineage.id,
        livingOrgans: lineage.livingOrgans || [],
        truthClass: 'HISTORICAL_DONOR'
      });
    }
  }
  return atoms;
}

export function buildUberBondFeatureAtomAtlas({ root = process.cwd(), featureGenome } = {}) {
  if (!featureGenome?.ok || !Array.isArray(featureGenome?.artifactNodes)) {
    return { ok: false, status: 'FEATURE_ATOM_ATLAS_BLOCKED', reasonCodes: ['valid-feature-genome-required'], businessEffectAuthority: 'NONE', externalEffectLedger: zeroEffects() };
  }
  const classes = {
    exportedCodeFeatures: sourceFeatureAtoms(root, featureGenome),
    operatorCommands: operatorAtoms(featureGenome),
    genesisIdeas: genesisIdeaAtoms(root),
    readinessCapabilities: readinessAtoms(featureGenome),
    activationGates: gateAtoms(featureGenome),
    totalBrainMemoryAtoms: totalBrainAtoms(featureGenome),
    historicalDonors: donorAtoms(featureGenome)
  };
  const allAtoms = Object.values(classes).flat();
  const ids = new Set();
  const duplicates = [];
  for (const atom of allAtoms) {
    if (ids.has(atom.id)) duplicates.push(atom.id);
    ids.add(atom.id);
  }
  if (duplicates.length) return { ok: false, status: 'FEATURE_ATOM_ATLAS_INVALID', reasonCodes: duplicates.map(id => `duplicate-feature-atom:${id}`), businessEffectAuthority: 'NONE', externalEffectLedger: zeroEffects() };
  const classCounts = Object.fromEntries(Object.entries(classes).map(([key, value]) => [key, value.length]));
  const core = {
    schemaVersion: UBERBOND_FEATURE_ATOM_ATLAS_SCHEMA,
    featureGenomeDigest: featureGenome.genomeDigest,
    atomCount: allAtoms.length,
    classCounts,
    classes,
    allAtoms
  };
  return {
    ok: true,
    policyVersion: UBERBOND_FEATURE_ATOM_ATLAS_POLICY_VERSION,
    status: 'FEATURE_ATOM_ATLAS_READY',
    ...core,
    atlasDigest: digest(core),
    businessEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects(),
    truthBoundary: 'FEATURE ATOMS ARE ADDRESSABLE REPOSITORY DECLARATIONS, CANON CLAIMS, GENESIS IDEAS, GATES OR MEMORY. AN EXPORTED SYMBOL IS NOT PROOF IT IS REACHABLE OR CORRECT; A GENESIS IDEA OR TOTAL-BRAIN MEMORY ATOM IS NOT PRESENT-TENSE IMPLEMENTATION OR COMMERCIAL TRUTH.'
  };
}

export function queryFeatureAtomAtlas(atlas, { text: query = '', classes = [], organs = [], limit = 100 } = {}) {
  if (!atlas?.ok || !Array.isArray(atlas?.allAtoms)) return { ok: false, status: 'FEATURE_ATLAS_QUERY_BLOCKED', reasonCodes: ['valid-atlas-required'] };
  const needle = clean(query, 300).toLowerCase();
  const classSet = new Set((Array.isArray(classes) ? classes : []).map(item => String(item).toUpperCase()));
  const organSet = new Set(Array.isArray(organs) ? organs : []);
  const cap = Number.isSafeInteger(Number(limit)) ? Math.max(1, Math.min(1000, Number(limit))) : 100;
  const matches = atlas.allAtoms.filter(atom => {
    if (classSet.size && !classSet.has(String(atom.class || '').toUpperCase())) return false;
    if (organSet.size && !(atom.organs || atom.livingOrgans || []).some(organ => organSet.has(organ))) return false;
    if (!needle) return true;
    return JSON.stringify(atom).toLowerCase().includes(needle);
  }).slice(0, cap);
  return { ok: true, status: 'FEATURE_ATLAS_QUERY_COMPLETE', query: needle || null, matchCount: matches.length, matches };
}
