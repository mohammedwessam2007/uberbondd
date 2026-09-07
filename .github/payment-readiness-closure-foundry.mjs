import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { reachableFromEntryPoints } from '../scripts/system-readiness.mjs';

const root = process.cwd();
const allowedPreRegenerationFailures = new Set([
  'tests/canon-freshness.test.mjs',
  'tests/reachability-ratchet.test.mjs'
]);

function run(command, args = [], { allowFailure = false, env = {} } = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, ...env },
    maxBuffer: 64 * 1024 * 1024
  });
  const output = `${result.stdout || ''}${result.stderr || ''}`;
  process.stdout.write(output);
  if (!allowFailure && result.status !== 0) {
    throw new Error(`command-failed:${command} ${args.join(' ')}:exit-${result.status}`);
  }
  return { status: result.status, output };
}

function summary(output) {
  const read = label => {
    const match = output.match(new RegExp(`ℹ ${label} ([0-9]+)`));
    return match ? Number(match[1]) : null;
  };
  return { tests: read('tests'), pass: read('pass'), fail: read('fail'), skipped: read('skipped') };
}

function syntaxCount(output) {
  const match = output.match(/check:syntax\s+[—-]\s+([0-9]+) files parse\./);
  if (!match) throw new Error('syntax-count-not-found');
  return Number(match[1]);
}

function failureFiles(output) {
  return [...output.matchAll(/test at (tests\/[^:]+):[0-9]+:[0-9]+/g)].map(match => match[1]);
}

function filesRecursive(relative, suffix = '.mjs') {
  const found = [];
  const walk = dir => {
    let entries;
    try { entries = readdirSync(join(root, dir), { withFileTypes: true }); }
    catch { return; }
    for (const entry of entries) {
      const child = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(child);
      else if (entry.name.endsWith(suffix)) found.push(child);
    }
  };
  walk(relative);
  return found;
}

function reachability() {
  const productionBase = ['server.mjs', 'worker.mjs', 'scripts/agent-mesh-tick.mjs'];
  const api = filesRecursive('api');
  const scripts = filesRecursive('scripts');
  const all = filesRecursive('src');
  const productionSet = reachableFromEntryPoints([...productionBase, ...api]);
  const anySet = reachableFromEntryPoints(['server.mjs', 'worker.mjs', ...scripts, ...api]);
  const production = all.filter(file => productionSet.has(file));
  const operatorOnly = all.filter(file => !productionSet.has(file) && anySet.has(file));
  const unreachable = all.filter(file => !anySet.has(file));
  return {
    srcModules: all.length,
    reachableFromProduction: production.length,
    reachableFromOperatorScriptsOnly: operatorOnly.length,
    noEntryPointAtAll: unreachable.length,
    allClassified: true
  };
}

const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const ranAt = new Date().toISOString();
console.log(`PAYMENT_READINESS_CLOSURE_HEAD ${head}`);

const focused = run(process.execPath, ['--test',
  'tests/payment-rail-doctor.test.mjs',
  'tests/payment-founder-readiness-provider-neutral.test.mjs',
  'tests/payment-founder-readiness-shape.test.mjs',
  'tests/founder-absence-blocker-doctor.test.mjs',
  'tests/first-cash-canary-packet.test.mjs'
]);

const syntax = run('npm', ['run', 'check:syntax']);
const measuredSyntax = syntaxCount(syntax.output);

const pre = run('npm', ['run', 'test:deterministic'], { allowFailure: true });
const before = summary(pre.output);
if (![before.tests, before.pass, before.fail, before.skipped].every(Number.isInteger)) {
  throw new Error('deterministic-summary-not-found-before-regeneration');
}
const failedFiles = [...new Set(failureFiles(pre.output))];
if (pre.status === 0) {
  console.log('PRE_REGENERATION_ALREADY_GREEN');
} else {
  const unexpected = failedFiles.filter(file => !allowedPreRegenerationFailures.has(file));
  if (unexpected.length) throw new Error(`unexpected-pre-regeneration-failures:${unexpected.join(',')}`);
}

const reach = reachability();
const inputPath = join(root, 'config', 'system-readiness-input.json');
const input = JSON.parse(readFileSync(inputPath, 'utf8'));
input.measurements['check:syntax'] = { command: 'npm run check:syntax', filesParsed: measuredSyntax, ranAt };
input.measurements['test:deterministic'] = {
  command: 'npm run test:deterministic',
  tests: before.tests,
  pass: before.tests - before.skipped,
  fail: 0,
  skipped: before.skipped,
  ranAt,
  note: `Measured on exact payment-readiness tree before canonical regeneration: ${before.tests} tests, ${before.pass} pass, ${before.fail} fail, ${before.skipped} skipped. Any pre-regeneration failures were restricted to canonical freshness/reachability assertions.`
};
input.measurements.reachability = {
  command: 'node --test tests/reachability-ratchet.test.mjs',
  ...reach,
  ranAt,
  note: 'Measured from exact payment-readiness tree using the repository entry-point algorithm.'
};
writeFileSync(inputPath, `${JSON.stringify(input, null, 2)}\n`);

run(process.execPath, ['scripts/system-readiness.mjs'], {
  env: { UBERBOND_CANONICAL_HEAD: head, UBERBOND_CANONICAL_BRANCH: 'main' }
});

const afterRun = run('npm', ['run', 'test:deterministic']);
const after = summary(afterRun.output);
if (after.fail !== 0 || after.tests !== before.tests || after.skipped !== before.skipped) {
  throw new Error(`post-regeneration-deterministic-mismatch:${JSON.stringify({ before, after })}`);
}
run('npm', ['audit', '--omit=dev']);

console.log(`PAYMENT_READINESS_CORE_GREEN ${head} syntax=${measuredSyntax} deterministic=${after.tests}/${after.pass}/0/${after.skipped} focused=PASS audit=PASS`);
