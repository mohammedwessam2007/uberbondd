#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildGenesisEvidenceLedger, GENESIS_IMPLEMENTATION_EVIDENCE } from '../src/genesis-implementation-evidence.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const required = [
  'docs/PERPETUAL_FRONTIER_GENESIS_CANON.md',
  'src/genesis-evolution-engine.mjs',
  'src/genesis-implementation-evidence.mjs',
  'tests/genesis-evolution-engine.test.mjs',
  'tests/genesis-evolution-tick.test.mjs',
  'scripts/genesis-evolution-tick.mjs',
  'data/genesis/impossible-tasks.json',
  'data/genesis/architecture-assumptions.json'
];
const missing = required.filter(relative => !fs.existsSync(path.join(root, relative)));
if (missing.length) {
  console.log(JSON.stringify({ ok: false, status: 'GENESIS_EVOLUTION_INVALID', missing }, null, 2));
  process.exit(1);
}

const markdown = fs.readFileSync(path.join(root, 'docs/PERPETUAL_FRONTIER_GENESIS_CANON.md'), 'utf8');
const tasks = JSON.parse(fs.readFileSync(path.join(root, 'data/genesis/impossible-tasks.json'), 'utf8'));
const assumptions = JSON.parse(fs.readFileSync(path.join(root, 'data/genesis/architecture-assumptions.json'), 'utf8'));
const declaredEvidencePaths = [...new Set(Object.values(GENESIS_IMPLEMENTATION_EVIDENCE).flatMap(evidence => [...evidence.sources, ...evidence.tests]))];
const availablePaths = declaredEvidencePaths.filter(relative => fs.existsSync(path.join(root, relative)));
const observedRuntimeReceipts = [...new Set(Object.values(GENESIS_IMPLEMENTATION_EVIDENCE).flatMap(evidence => evidence.runtimeReceipts))]
  .filter(relative => fs.existsSync(path.join(root, relative)));
const ledger = buildGenesisEvidenceLedger({ canonicalMarkdown: markdown, availablePaths, observedRuntimeReceipts });

const validTasks = tasks?.schemaVersion === 'uberbond.genesis-impossible-tasks.v1' && Array.isArray(tasks.tasks) && tasks.tasks.length > 0;
const validAssumptions = assumptions?.schemaVersion === 'uberbond.genesis-architecture-assumptions.v1' && Array.isArray(assumptions.assumptions) && assumptions.assumptions.length > 0;
const missingDeclaredEvidence = ledger.ok ? ledger.entries.flatMap(entry => entry.missingPaths || []) : [];
const ok = ledger.ok && validTasks && validAssumptions && missingDeclaredEvidence.length === 0;
const result = {
  ok,
  status: ok ? 'GENESIS_EVOLUTION_FOUNDATION_HEALTHY' : 'GENESIS_EVOLUTION_INVALID',
  ideaCount: ledger.ideaCount,
  implementationCounts: ledger.counts,
  maturityCounts: ledger.maturityCounts,
  implementedOrPartialCount: ledger.implementedOrPartialCount,
  canonOnlyCount: ledger.canonOnlyCount,
  impossibleTaskCount: Array.isArray(tasks?.tasks) ? tasks.tasks.length : 0,
  antiUberBondAssumptionCount: Array.isArray(assumptions?.assumptions) ? assumptions.assumptions.length : 0,
  observedRuntimeReceiptCount: observedRuntimeReceipts.length,
  missingDeclaredEvidence: [...new Set(missingDeclaredEvidence)],
  businessEffectAuthority: 'NONE',
  truthBoundary: 'DOCTOR_PROVES_INTERNAL_STRUCTURE_AND_DECLARED_FILE_CONTRACTS_ONLY; SOURCE_AND_TEST_PRESENT_IS_NOT_TEST_PASS; RUNTIME_RECEIPTS_AND_EXTERNAL_ECONOMIC_VALUE_REQUIRE_SEPARATE_EVIDENCE'
};
console.log(JSON.stringify(result, null, 2));
if (!ok) process.exitCode = 1;
