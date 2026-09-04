#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildOntogenesisCycle, compressInsight } from '../src/genesis-ontology.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = new Map();
for (let i = 2; i < process.argv.length; i += 1) {
  const arg = process.argv[i];
  if (!arg.startsWith('--')) continue;
  args.set(arg, process.argv[i + 1]?.startsWith('--') ? true : process.argv[++i] ?? true);
}
const scientistPath = resolve(root, String(args.get('--scientist') || 'artifacts/genesis-scientist-latest.json'));
const evolutionPath = resolve(root, String(args.get('--evolution') || 'artifacts/genesis-evolution-latest.json'));
const outputPath = resolve(root, String(args.get('--output') || 'artifacts/genesis-ontology-latest.json'));
const generatedAt = new Date().toISOString();

async function readJson(path) { try { return JSON.parse(await readFile(path, 'utf8')); } catch { return null; } }
const [scientist, evolution] = await Promise.all([readJson(scientistPath), readJson(evolutionPath)]);
if (!scientist && !evolution) {
  console.error(JSON.stringify({ ok: false, status: 'ONTOGENESIS_INPUT_REQUIRED', scientistPath, evolutionPath }, null, 2));
  process.exit(1);
}

const unknowns = [];
const anomalies = [];
const contradictions = [];
const evidenceRefs = [];

for (const lab of (Array.isArray(scientist?.laboratories) ? scientist.laboratories : []).slice(0, 50)) {
  const sourceRef = lab?.signalId ? `receipt:scientist-${String(lab.signalId).slice(0, 120)}` : 'receipt:genesis-scientist';
  evidenceRefs.push(sourceRef);
  if (lab?.primitive) unknowns.push(`Whether and how the frontier primitive '${lab.primitive}' changes economically useful causal structure.`);
  for (const falsifier of (lab?.protocol?.protocol?.falsifiers || []).slice(0, 12)) contradictions.push(`Potential falsifier: ${falsifier}`);
  if (lab?.causal?.genome?.edges) {
    for (const edge of lab.causal.genome.edges.filter(item => item.evidenceClass === 'HYPOTHESIS').slice(0, 12)) {
      unknowns.push(`Unknown causal sign or strength for ${edge.from} -> ${edge.to}.`);
    }
  }
}

for (const cycle of (Array.isArray(evolution?.cycles) ? evolution.cycles : []).filter(item => item?.ok).slice(0, 50)) {
  const sourceRef = cycle?.signalId ? `receipt:evolution-${String(cycle.signalId).slice(0, 120)}` : 'receipt:genesis-evolution';
  evidenceRefs.push(sourceRef);
  for (const item of (cycle?.unknownUnknowns?.agenda || cycle?.unknownUnknowns?.unknownUnknowns?.agenda || []).slice(0, 16)) {
    if (item?.kind === 'ANOMALY') anomalies.push(item.observation);
    else if (item?.kind === 'CONTRADICTION' || item?.kind === 'DISAGREEMENT') contradictions.push(item.observation);
    else if (item?.observation) unknowns.push(item.observation);
  }
  for (const challenge of (cycle?.antiUberBond?.challenges || []).slice(0, 16)) {
    contradictions.push(`Anti-UberBond challenge to assumption '${challenge.assumption}': ${challenge.counterTheory}`);
  }
  if ((cycle?.redQueen?.disagreement ?? false) === true) contradictions.push(`Evaluator disagreement remains unresolved for frontier signal ${cycle.signalId || 'unknown'}.`);
}

if (!unknowns.length && !anomalies.length && !contradictions.length) {
  unknowns.push('No unresolved frontier material was supplied; determine which missing observation would most improve the current ontology.');
  evidenceRefs.push('receipt:ontogenesis-empty-input-fallback');
}

const cycle = buildOntogenesisCycle({
  currentConcepts: [],
  unknowns: [...new Set(unknowns)].slice(0, 128),
  anomalies: [...new Set(anomalies)].slice(0, 128),
  contradictions: [...new Set(contradictions)].slice(0, 128),
  evidenceRefs: [...new Set(evidenceRefs)].slice(0, 128)
});
if (!cycle.ok) {
  console.error(JSON.stringify(cycle, null, 2));
  process.exit(1);
}

const compressed = cycle.candidates.slice(0, 12).map(candidate => compressInsight({
  statement: `Candidate ontology concept: ${candidate.name}. ${candidate.definition}`,
  evidenceRefs: candidate.evidenceRefs,
  implications: ['Evaluate repeated explanatory utility before promotion', 'Search for contradictions and redundant existing concepts'],
  uncertainty: 80,
  contradictions: []
})).filter(result => result.ok).map(result => result.packet);

const receipt = {
  schemaVersion: 'uberbond.genesis-ontology.tick.v1',
  generatedAt,
  inputs: { scientistPath, evolutionPath, scientistPresent: Boolean(scientist), evolutionPresent: Boolean(evolution) },
  unresolvedInputCounts: { unknowns: unknowns.length, anomalies: anomalies.length, contradictions: contradictions.length },
  cycle,
  compressedCandidateInsights: compressed,
  summary: {
    candidateConcepts: cycle.candidates.length,
    promotionProposals: cycle.evolution?.promotions?.length || 0,
    archiveProposals: cycle.evolution?.archives?.length || 0,
    generatedQuestions: cycle.agenda?.agenda?.length || 0
  },
  businessEffectAuthority: 'NONE',
  externalEffectAuthority: 'NONE',
  externalEffectLedger: { messages: 0, moneyMovements: 0, purchases: 0, deployments: 0, customerStateMutations: 0, providerCalls: 0 },
  truthBoundary: 'ONTOGENESIS_OUTPUT_IS_CANDIDATE_VOCABULARY_AND_RESEARCH_STRUCTURE; NO_CONCEPT_IS_EXTERNAL_FACT_OR_CANONICAL_PROMOTION_WITHOUT_SEPARATE_EVIDENCE_AND_UTILITY'
};
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status: 'ONTOGENESIS_TICK_COMPLETE', ...receipt.summary, output: outputPath, businessEffectAuthority: 'NONE' }, null, 2));
