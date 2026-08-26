// CLI entrypoint for the governed overnight capability loop.
//
// It consumes a caller-supplied JSON capability/economics packet and prints a
// tournament plus a GPT -> Claude -> test -> review task graph. It never calls
// the network, writes a repository, invokes a model, sends, spends, deploys,
// changes DNS, or promotes a capability.

import { readFile } from 'node:fs/promises';
import { runCapabilityTournament } from '../src/overnight/control/capability-tournament.mjs';
import { compileUpgradeTaskPlan } from '../src/overnight/control/upgrade-task-compiler.mjs';

const USAGE = `Usage:
  npm run overnight:plan -- --input capabilities.json --source-commit <sha> --budget-cents <n> --founder-minutes <n>

Input JSON must be either an array of capability records or an object with a capabilities array.
The command emits JSON to stdout and performs no external effect.
`;

function argumentMap(argv) {
  const map = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith('--')) {
      map.set(key, next);
      index += 1;
    } else {
      map.set(key, true);
    }
  }
  return map;
}

function integerArgument(map, key) {
  const value = Number(map.get(key));
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function fail(message, status = 2) {
  process.stderr.write(`${message}\n${USAGE}`);
  process.exitCode = status;
}

const args = argumentMap(process.argv.slice(2));
if (args.has('help') || args.size === 0) {
  process.stdout.write(USAGE);
  process.exitCode = args.has('help') ? 0 : 2;
} else {
  const inputPath = String(args.get('input') || '').trim();
  const sourceCommit = String(args.get('source-commit') || '').trim();
  const budgetCents = integerArgument(args, 'budget-cents');
  const founderMinuteBudget = integerArgument(args, 'founder-minutes');

  if (!inputPath) fail('--input is required');
  else if (!sourceCommit) fail('--source-commit is required');
  else if (budgetCents == null) fail('--budget-cents must be a non-negative integer');
  else if (founderMinuteBudget == null) fail('--founder-minutes must be a non-negative integer');
  else {
    try {
      const raw = JSON.parse(await readFile(inputPath, 'utf8'));
      const capabilities = Array.isArray(raw) ? raw : raw?.capabilities;
      const date = raw?.date || new Date().toISOString();
      const tournament = runCapabilityTournament({
        capabilities,
        sourceCommit,
        budgetCents,
        founderMinuteBudget,
        date
      });
      const taskPlan = tournament.ok && tournament.status === 'TOURNAMENT_COMPLETE'
        ? compileUpgradeTaskPlan({ tournament, date })
        : { ok: false, status: 'NOT_COMPILED', reasonCodes: ['tournament-not-complete'], tasks: [] };
      process.stdout.write(`${JSON.stringify({ tournament, taskPlan }, null, 2)}\n`);
      if (!tournament.ok || !taskPlan.ok) process.exitCode = 1;
    } catch (error) {
      fail(`input or compilation failed: ${error instanceof Error ? error.message : 'unknown-error'}`, 1);
    }
  }
}

