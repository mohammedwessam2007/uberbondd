#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildGenesisCycle } from '../src/perpetual-frontier-genesis.mjs';
import { buildIdeationActivationPlan } from '../src/million-branch-ideation-genome.mjs';
import { buildExpansionEnvelope } from '../src/sovereign-expansion-kernel.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = new Map();
for (let i = 2; i < process.argv.length; i += 1) {
  const arg = process.argv[i];
  if (!arg.startsWith('--')) continue;
  args.set(arg, process.argv[i + 1]?.startsWith('--') ? true : process.argv[++i] ?? true);
}

const inputPath = resolve(root, String(args.get('--input') || 'artifacts/gamechanger-mesh-latest.json'));
const outputPath = resolve(root, String(args.get('--output') || 'artifacts/perpetual-frontier-genesis-latest.json'));
const dormantPath = args.get('--dormant') ? resolve(root, String(args.get('--dormant'))) : null;
const dryRun = args.has('--dry-run');
const generatedAt = new Date().toISOString();

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return fallback;
  }
}

const gamechanger = await readJson(inputPath, null);
if (!gamechanger || typeof gamechanger !== 'object') {
  console.error(JSON.stringify({ ok: false, status: 'GENESIS_GAMECHANGER_INPUT_REQUIRED', input: inputPath }, null, 2));
  process.exit(1);
}

const dormantRaw = dormantPath ? await readJson(dormantPath, []) : [];
const dormantOpportunities = Array.isArray(dormantRaw)
  ? dormantRaw
  : Array.isArray(dormantRaw?.opportunities)
    ? dormantRaw.opportunities
    : [];

const signals = Array.isArray(gamechanger.frontierSignals) ? gamechanger.frontierSignals : [];
const intelligenceBySignal = new Map(
  (Array.isArray(gamechanger.intelligencePackets) ? gamechanger.intelligencePackets : [])
    .filter(packet => packet?.signalId)
    .map(packet => [String(packet.signalId), packet])
);

function text(value, max = 4000) {
  const output = String(value ?? '').trim();
  return output && output.length <= max ? output : null;
}

function stringList(value, max = 512) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(item => text(item, 1000)).filter(Boolean))].slice(0, max);
}

function signalEvidence(signal) {
  const refs = stringList(signal?.evidenceRefs || signal?.evidence || []);
  if (refs.length) return refs;
  const source = text(signal?.sourceUrl || signal?.url, 3000);
  return source ? [source] : [];
}

function changedPrimitives(signal, intelligence) {
  const claims = stringList(signal?.claims || []);
  if (claims.length) return claims;
  const atomCandidates = intelligence?.atomization?.candidateAtoms;
  if (Array.isArray(atomCandidates)) {
    const fromAtoms = atomCandidates
      .map(item => text(item?.primitive || item?.capability || item?.name || item, 1000))
      .filter(Boolean);
    if (fromAtoms.length) return [...new Set(fromAtoms)].slice(0, 256);
  }
  const summary = text(signal?.summary, 4000);
  return summary ? [summary] : [];
}

const cycles = [];
for (const signal of signals.slice(0, 500)) {
  const signalId = text(signal?.id, 240);
  const summary = text(signal?.summary, 4000);
  if (!signalId || !summary) {
    cycles.push({ signalId: signalId || null, ok: false, status: 'GENESIS_SIGNAL_INVALID', reasonCodes: ['signal-id-and-summary-required'] });
    continue;
  }
  const intelligence = intelligenceBySignal.get(String(signal.id));
  const primitives = changedPrimitives(signal, intelligence);
  const evidenceRefs = signalEvidence(signal);
  const domains = stringList(signal?.domains || signal?.domainTags || []);
  const observedAt = text(signal?.observedAt, 100);
  const publishedAt = text(signal?.publishedAt, 100);
  const t0 = publishedAt || observedAt || null;
  const t1 = observedAt || null;
  const cycle = buildGenesisCycle({
    signal: { id: signalId, summary, evidenceRefs },
    changedPrimitives: primitives,
    affectedDomains: domains,
    opportunityIds: [],
    dormantOpportunities,
    changedConditions: primitives,
    anomalies: [],
    contradictions: stringList(intelligence?.reasonCodes || []),
    blindSpots: evidenceRefs.length ? [] : ['frontier signal lacks an evidence reference'],
    disagreements: [],
    timestamps: { t0, t1 }
  });
  const ideation = cycle.ok
    ? buildIdeationActivationPlan({
        context: summary,
        affectedDomains: domains,
        maxGenerators: 12,
        candidateBudgetPerGenerator: 50,
        seed: signalId
      })
    : null;
  const expansion = cycle.ok && ideation?.ok
    ? buildExpansionEnvelope({
        context: summary,
        affectedDomains: domains,
        changedPrimitives: primitives,
        ideationGeneratorKeys: ideation.selectedGenerators.map(item => item.key),
        maxLenses: 16,
        seed: signalId
      })
    : null;
  cycles.push({ signalId, ...cycle, ideation, expansion });
}

const successful = cycles.filter(cycle => cycle.ok).length;
const invalid = cycles.length - successful;
const receipt = {
  schemaVersion: 'uberbond.perpetual-frontier-genesis.tick.v3',
  generatedAt,
  dryRun,
  source: {
    gamechangerInput: inputPath,
    gamechangerGeneratedAt: gamechanger.generatedAt || null,
    gamechangerSchemaVersion: gamechanger.schemaVersion || null,
    frontierSignalCount: signals.length
  },
  dormantOpportunityInput: dormantPath,
  dormantOpportunityCount: dormantOpportunities.length,
  cycles,
  summary: {
    cycles: cycles.length,
    successful,
    invalid,
    resurrectionReviewCandidates: cycles.reduce((sum, cycle) => sum + (cycle.resurrection?.candidates?.length || 0), 0),
    ideationActivations: cycles.filter(cycle => cycle.ideation?.ok).length,
    selectedIdeationGenerators: cycles.reduce((sum, cycle) => sum + (cycle.ideation?.selectedGeneratorCount || 0), 0),
    projectedFirstGenerationCapacity: cycles.reduce((sum, cycle) => sum + (cycle.ideation?.selectedFirstGenerationCapacity || 0), 0),
    expansionActivations: cycles.filter(cycle => cycle.expansion?.ok).length,
    selectedExpansionLenses: cycles.reduce((sum, cycle) => sum + (cycle.expansion?.selectedLensCount || 0), 0)
  },
  businessEffectAuthority: 'NONE',
  externalEffectAuthority: 'NONE',
  externalEffectLedger: {
    messages: 0,
    moneyMovements: 0,
    purchases: 0,
    deployments: 0,
    customerStateMutations: 0,
    providerCalls: 0
  },
  truthBoundary: 'GENESIS_CYCLES_IDEATION_BRANCHES_AND_EXPANSION_LENSES_ARE_INTERNAL_RESEARCH_AND_PROPOSAL_RECEIPTS_NOT_TECHNOLOGY_MARKET_CUSTOMER_REVENUE_LIFE_OUTCOME_OR_ASI_PROOF'
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  status: 'PERPETUAL_FRONTIER_GENESIS_TICK_COMPLETE',
  cycles: cycles.length,
  successful,
  invalid,
  resurrectionReviewCandidates: receipt.summary.resurrectionReviewCandidates,
  ideationActivations: receipt.summary.ideationActivations,
  selectedIdeationGenerators: receipt.summary.selectedIdeationGenerators,
  projectedFirstGenerationCapacity: receipt.summary.projectedFirstGenerationCapacity,
  expansionActivations: receipt.summary.expansionActivations,
  selectedExpansionLenses: receipt.summary.selectedExpansionLenses,
  output: outputPath,
  businessEffectAuthority: 'NONE'
}, null, 2));
