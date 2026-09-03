#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildGenesisImplementationLedger } from '../src/genesis-evolution-engine.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const required = [
  'docs/PERPETUAL_FRONTIER_GENESIS_CANON.md',
  'src/genesis-evolution-engine.mjs',
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
const runtimeReceipt = fs.existsSync(path.join(root, 'artifacts/genesis-evolution-latest.json'));
const ledger = buildGenesisImplementationLedger({
  canonicalMarkdown: markdown,
  sourcePaths: ['src/genesis-evolution-engine.mjs'],
  testPaths: ['tests/genesis-evolution-engine.test.mjs'],
  runtimeReceiptPaths: runtimeReceipt ? ['artifacts/genesis-evolution-latest.json'] : []
});

const validTasks = tasks?.schemaVersion === 'uberbond.genesis-impossible-tasks.v1' && Array.isArray(tasks.tasks) && tasks.tasks.length > 0;
const validAssumptions = assumptions?.schemaVersion === 'uberbond.genesis-architecture-assumptions.v1' && Array.isArray(assumptions.assumptions) && assumptions.assumptions.length > 0;
const ok = ledger.ok && validTasks && validAssumptions;
const result = {
  ok,
  status: ok ? 'GENESIS_EVOLUTION_FOUNDATION_HEALTHY' : 'GENESIS_EVOLUTION_INVALID',
  ideaCount: ledger.ideaCount,
  implementationCounts: ledger.counts,
  impossibleTaskCount: Array.isArray(tasks?.tasks) ? tasks.tasks.length : 0,
  antiUberBondAssumptionCount: Array.isArray(assumptions?.assumptions) ? assumptions.assumptions.length : 0,
  runtimeReceiptPresent: runtimeReceipt,
  businessEffectAuthority: 'NONE',
  truthBoundary: 'DOCTOR_PROVES_INTERNAL_STRUCTURE_AND_FILE_CONTRACTS_ONLY; TEST_PASS_RUNTIME_SUCCESS_AND_EXTERNAL_ECONOMIC_VALUE_REQUIRE_SEPARATE_EVIDENCE'
};
console.log(JSON.stringify(result, null, 2));
if (!ok) process.exitCode = 1;
