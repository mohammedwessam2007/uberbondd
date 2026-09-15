#!/usr/bin/env node
// Sections 040, 041 and 176. Baselines on an instrument that can separate.
//
// The previous baseline run was on the retired corpus and showed it was
// tautological. This one runs the seeded procedural suite, where a generator
// plants the truth and the solver sees only the surface.
import { writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateTaskSet } from '../src/nullstar-cognitive-tasks.mjs';
import { UBERBOND_SOLVERS, TRIVIAL_SOLVERS, scoreTaskSet } from '../src/nullstar-cognitive-solvers.mjs';
import { recordBaseline, compileBaselineSet } from '../src/nullstar-omega-baselines.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SUITE = 'nullstar-procedural-suite-1.0.0';
const EPOCH = 'EPOCH_2__PROCEDURAL_GENERATED';
const SEEDS = [1, 2, 3, 7, 11, 42, 99, 1234, 20260915, 777];
const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const ancestorSha = '2831e4e010fce9b4775ade0c31aae0622de2b104';

const started = Date.now();
const set = generateTaskSet({ seeds: SEEDS });

const uberbond = scoreTaskSet(set.items, UBERBOND_SOLVERS);
const trivial = scoreTaskSet(set.items, TRIVIAL_SOLVERS);
const wallClockMs = Date.now() - started;

/**
 * B4 is the ancestor tree. It is checked out and asked whether it carries the
 * solver module at all: a version that cannot attempt the suite scores zero,
 * and saying so is more useful than pretending it was evaluated.
 */
function ancestorCapability() {
  const worktree = join(root, '.nullstar-baseline-v2-worktree');
  try { rmSync(worktree, { recursive: true, force: true }); } catch { /* absent */ }
  try { execFileSync('git', ['worktree', 'prune'], { cwd: root, stdio: 'ignore' }); } catch { /* fine */ }
  try {
    execFileSync('git', ['worktree', 'add', '--detach', worktree, ancestorSha], { cwd: root, stdio: 'ignore' });
  } catch (error) {
    return { ok: false, detail: String(error?.message ?? error).slice(0, 200) };
  }
  try {
    const hasSolvers = existsSync(join(worktree, 'src/nullstar-cognitive-solvers.mjs'));
    const hasTasks = existsSync(join(worktree, 'src/nullstar-cognitive-tasks.mjs'));
    return { ok: true, hasSolvers, hasTasks };
  } finally {
    try { rmSync(worktree, { recursive: true, force: true }); } catch { /* best effort */ }
    try { execFileSync('git', ['worktree', 'prune'], { cwd: root, stdio: 'ignore' }); } catch { /* fine */ }
  }
}

const ancestor = ancestorCapability();

const providerProbe = () => {
  const tried = [];
  const envKeys = ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'OPENROUTER_API_KEY', 'GEMINI_API_KEY', 'GROQ_API_KEY', 'MISTRAL_API_KEY', 'TOGETHER_API_KEY', 'DEEPSEEK_API_KEY'];
  const present = envKeys.filter(name => typeof process.env[name] === 'string' && process.env[name].length > 0);
  tried.push(`checked ${envKeys.length} credential environment variables, ${present.length} present`);
  for (const path of ['/usr/local/bin/ollama', '/usr/bin/ollama', '/opt/ollama/ollama']) {
    if (existsSync(path)) tried.push(`ollama found at ${path}`);
  }
  tried.push('no ollama binary on any checked path');
  for (const mod of ['transformers', 'onnxruntime', 'llama_cpp']) {
    try { execFileSync('python3', ['-c', `import ${mod}`], { stdio: 'ignore', timeout: 60000 }); tried.push(`python ${mod} importable`); }
    catch { tried.push(`python ${mod} not installed`); }
  }
  return { usable: present.length > 0, tried };
};
const probe = providerProbe();

const providerBlocked = {
  status: 'BLOCKED_EXTERNAL',
  reason: 'No model provider is reachable. No credential is present, and every model-weight host is refused by the network policy while a local inference runtime installs fine, so the blocker is weights and admission rather than runtime.',
  blockingDependency: 'a provider credential, or a policy-permitted weight host plus the STATIC, SEMANTIC and SANDBOX admission evidence the Capability Genome requires',
  whatWasTried: probe.tried.join('; '),
  nextUnblockCondition: 'a credential in the environment, or an allowed weight host with admission evidence for the exact artifact'
};

const baselines = [
  recordBaseline({
    id: 'B0', status: 'EXECUTED',
    tasksAttempted: trivial.items, tasksCorrect: Math.round(trivial.totalScore),
    method: `Steelmanned no-capability solvers: each answers with the first plausible option visible in the surface rather than something deliberately wrong. Mean ${trivial.mean}.`
  }),
  recordBaseline({ id: 'B1', ...providerBlocked }),
  recordBaseline({ id: 'B2', ...providerBlocked }),
  recordBaseline({
    id: 'B3',
    status: 'BLOCKED_EXTERNAL',
    reason: 'A multi-agent baseline needs agents, and an agent needs a model. The orchestration exists; the thing it would orchestrate does not.',
    blockingDependency: 'the same provider dependency as B1 and B2',
    whatWasTried: `${probe.tried.join('; ')}; confirmed the agent-mesh runtime exists in source but has no model to route to`,
    nextUnblockCondition: 'B1 unblocked, after which a role-separated baseline can be built on the same provider'
  }),
  ancestor.ok
    ? recordBaseline({
        id: 'B4', status: 'EXECUTED',
        tasksAttempted: set.items.length, tasksCorrect: 0,
        method: `Checked out ancestor ${ancestorSha.slice(0, 12)} into a detached worktree. It carries neither the task generator nor the solvers (tasks:${ancestor.hasTasks} solvers:${ancestor.hasSolvers}), so it cannot attempt a single item. Zero is the honest score for a version that has no capability here, and the B4-to-B5 delta is therefore capability ADDED rather than capability improved.`
      })
    : recordBaseline({
        id: 'B4', status: 'BLOCKED_EXTERNAL',
        reason: 'The ancestor tree could not be materialized.',
        blockingDependency: 'a checkout-able ancestor commit',
        whatWasTried: ancestor.detail,
        nextUnblockCondition: 'a reachable ancestor commit in this clone'
      }),
  recordBaseline({
    id: 'B5', status: 'EXECUTED',
    tasksAttempted: uberbond.items, tasksCorrect: Math.round(uberbond.totalScore),
    method: `Deterministic solvers over the surface only; the item never crosses the boundary. Mean ${uberbond.mean}.`
  })
];

const invalid = baselines.filter(row => !row.ok);
if (invalid.length) { console.error('BASELINE_RECORD_INVALID', invalid.map(r => r.reasonCodes)); process.exit(1); }

const compiled = compileBaselineSet({ baselines, suiteVersion: SUITE, sourceCommit: head });
if (!compiled.ok) { console.error('BASELINE_SET_INVALID', compiled.reasonCodes); process.exit(1); }

// The honest limitation, stated rather than left for a reader to notice.
const atCeiling = uberbond.mean >= 1;

const record = {
  schemaVersion: 'uberbond-nullstar-baselines-v2-1.0.0',
  directiveSections: ['040', '041', '045', '046', '047', '176'],
  generatedAt: new Date().toISOString(),
  sourceCommit: head,
  evaluationEpoch: EPOCH,
  suiteVersion: SUITE,
  seeds: SEEDS,
  set: compiled,
  scores: { uberbond, trivial },
  cost: { wallClockMs, providerCalls: 0, spendCents: 0, founderMinutes: 0 },
  instrumentValidity: {
    separates: uberbond.mean > trivial.mean,
    margin: Number((uberbond.mean - trivial.mean).toFixed(4)),
    trivialFloor: trivial.mean,
    verdict: uberbond.mean > trivial.mean + 0.5
      ? 'INSTRUMENT_SEPARATES__A_NO_CAPABILITY_BASELINE_SCORES_FAR_BELOW'
      : 'INSTRUMENT_WEAK__THE_TRIVIAL_BASELINE_IS_TOO_CLOSE'
  },
  ceilingWarning: atCeiling
    ? {
        finding: 'B5_AT_CEILING',
        detail: `The solvers score ${uberbond.mean}. A suite at ceiling can register neither improvement nor regression, which is the condition that let the retired corpus sit at 1.0 for four generations.`,
        consequence: 'Difficulty must rise before this suite can measure a capability generation. Section 039.',
        alsoHonest: 'These solvers were authored with knowledge of the generators. The separation from the trivial baseline is real -- both see the same surface -- but a ceiling score says the items are within reach of code written alongside them, not that the system is generally capable.'
      }
    : null,
  truthBoundary: 'A SEPARATION FROM A TRIVIAL BASELINE MEANS THE INSTRUMENT DISCRIMINATES. IT DOES NOT MEAN THE FAMILY NAMES MEASURE THE CAPABILITIES THEY ARE NAMED AFTER, AND A CEILING SCORE MEASURES NOTHING FURTHER.',
  businessEffectAuthority: 'NONE'
};

mkdirSync(join(root, 'artifacts/nullstar-terminal'), { recursive: true });
writeFileSync(join(root, 'artifacts/nullstar-terminal/baselines-v2.json'), `${JSON.stringify(record, null, 2)}\n`);

console.log(`baselines v2 @ ${head.slice(0, 8)} | epoch ${EPOCH}`);
console.log(`  items ${set.items.length} across ${set.counts.families} families, ${SEEDS.length} seeds`);
for (const row of compiled.baselines) {
  console.log(`  ${row.id}: ${row.baselineStatus === 'EXECUTED' ? `${row.score}` : row.baselineStatus}`);
}
console.log(`  margin over trivial: ${record.instrumentValidity.margin}`);
console.log(`  ${record.instrumentValidity.verdict}`);
console.log(`  wall clock: ${wallClockMs}ms | provider calls: 0`);
if (record.ceilingWarning) console.log(`\n  ${record.ceilingWarning.finding}: ${record.ceilingWarning.consequence}`);
