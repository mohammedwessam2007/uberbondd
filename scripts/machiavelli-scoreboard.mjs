#!/usr/bin/env node
// Machiavelli Reality Scoreboard.
//   node scripts/machiavelli-scoreboard.mjs [--tournament artifacts/machiavelli/profit-tournament.json] [--experiments artifacts/quant-lab/<file>.json] [--paper <paper-ledger.json>] [--out <file>]
// Combines the quant lab receipts, the profit tournament and any paper or
// realized evidence into: per-tier money reality (never summed across tiers)
// and capital-allocation scenarios for $0..$25k. Sends, trades and spends nothing.
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { allocateCapital, CAPITAL_LEVELS } from '../src/capital-allocation-intelligence.mjs';
import { appendRealityEntry, summarizeReality } from '../src/revenue-reality-ledger.mjs';
import { paperSummary } from '../src/quant-paper-ledger.mjs';

const args = process.argv.slice(2);
const flag = (name, fallback = null) => { const index = args.indexOf(`--${name}`); return index >= 0 ? args[index + 1] : fallback; };
const readJson = path => (path && existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null);

const experiments = readJson(flag('experiments', 'artifacts/quant-lab/experiments-2021-01_2026-09.json'));
const tournament = readJson(flag('tournament', 'artifacts/machiavelli/profit-tournament.json'));
const paper = readJson(flag('paper'));
const at = new Date().toISOString();

// Simulated tier: each research experiment's holdout result on a notional $1,000.
let ledger = [];
const refusals = [];
for (const experiment of experiments?.experiments ?? []) {
  const result = appendRealityEntry(ledger, { tier: 'SIMULATED', mechanismId: experiment.family, amountCents: Math.round((experiment.holdout?.totalReturn ?? 0) * 100_000), evidence: { experimentReceiptSha256: experiment.receiptSha256 }, at });
  if (result.ok) ledger = result.ledger; else refusals.push({ mechanismId: experiment.family, problems: result.problems });
}

const allocation = tournament?.capitalCandidates?.length
  ? allocateCapital({ candidates: tournament.capitalCandidates, levels: CAPITAL_LEVELS, founderHoursPerMonth: Number(flag('founder-hours', 20)), riskFreeAnnual: Number(flag('risk-free', 0.04)) })
  : { ok: false, status: 'NO_TOURNAMENT_CANDIDATES' };

const scoreboard = {
  schema: 'uberbond.machiavelli-scoreboard.v1',
  generatedAt: at,
  reality: summarizeReality(ledger),
  realityRefusals: refusals,
  paper: paper ? paperSummary(paper) : { strategies: {}, note: 'No strategy has earned paper trading: none passed the pre-registered research protocol.' },
  researchVerdicts: (experiments?.experiments ?? []).map(experiment => ({ family: experiment.family, label: experiment.label, failures: experiment.failures })),
  capitalAllocation: allocation,
  honestHeadline: 'Cleared contribution profit to date: $0.00. Everything above SIMULATED is empty until real evidence exists.'
};
const out = flag('out');
if (out) { mkdirSync(dirname(out), { recursive: true }); writeFileSync(out, `${JSON.stringify(scoreboard, null, 2)}\n`); }
console.log(JSON.stringify({ strongestTier: scoreboard.reality.strongestTierWithEvidence, cleared: scoreboard.reality.clearedContributionProfitCents, experiments: scoreboard.researchVerdicts.length, allocation: allocation.ok ? allocation.scenarios.map(s => ({ level: s.capitalLevelUsd, picks: s.portfolio.map(p => p.id) })) : allocation.status }, null, 2));
