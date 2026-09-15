#!/usr/bin/env node
// G2: recompute the bottleneck from scratch and run the successor's test.
//
// G1 refuted the difficulty hypothesis. The successor diagnosis says the local
// corpus measures repository consistency rather than capability, and names its
// own discriminating test: configure any model provider, or serve one task from
// a local runtime. G2 executes that test rather than assuming its answer.
//
// If no provider and no local runtime exist, the honest result is not a lower
// score -- it is that the gap is external, and the generation records
// NO_PROMOTION with an external-gate classification. Scoring a capability
// dimension without anything capable of the judgement would be fabricating the
// number this whole spine exists to avoid.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileHoldoutCorpus } from '../src/nullstar-omega-holdout.mjs';
import { recordGeneration, compareGenerations } from '../src/nullstar-omega-generation.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const GEN_DIR = 'artifacts/nullstar-omega/generations';
const SUITE_VERSION = 'omega-capability-probe-suite-1.0.0';

const readJson = relative => {
  try { return JSON.parse(readFileSync(join(root, relative), 'utf8')); } catch { return null; }
};

/**
 * Does anything here can actually render a judgement the repository does not
 * already compute?
 *
 * Checked, not assumed. Each probe is a real observation of this environment,
 * and every one failing is the finding rather than an error.
 */
function probeJudgementCapability() {
  const probes = [];

  const providerEnv = ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'OPENROUTER_API_KEY', 'GEMINI_API_KEY', 'GROQ_API_KEY']
    .filter(name => typeof process.env[name] === 'string' && process.env[name].length > 0);
  probes.push({ probe: 'PROVIDER_CREDENTIAL', available: providerEnv.length > 0, detail: providerEnv.length ? `${providerEnv.length} credential(s) present` : 'no provider credential in environment' });

  let doctorStatus = 'UNKNOWN';
  try {
    const out = execFileSync('npm', ['run', 'providers:doctor', '--silent'], { cwd: root, encoding: 'utf8', timeout: 120000 });
    doctorStatus = (out.match(/"status":\s*"([A-Z_]+)"/) || [, 'UNKNOWN'])[1];
  } catch { doctorStatus = 'DOCTOR_FAILED'; }
  probes.push({ probe: 'PROVIDER_DOCTOR', available: doctorStatus !== 'NO_MODEL_PROVIDER_CONFIGURED' && doctorStatus !== 'DOCTOR_FAILED', detail: doctorStatus });

  let localRuntime = false;
  try { execFileSync('python3', ['-c', 'import transformers'], { stdio: 'ignore', timeout: 60000 }); localRuntime = true; } catch { /* absent */ }
  probes.push({ probe: 'LOCAL_TRANSFORMERS_RUNTIME', available: localRuntime, detail: localRuntime ? 'python transformers importable' : 'python transformers not installed' });

  const ollama = existsSync('/usr/local/bin/ollama') || existsSync('/usr/bin/ollama');
  probes.push({ probe: 'LOCAL_OLLAMA', available: ollama, detail: ollama ? 'ollama binary present' : 'no ollama binary' });

  return probes;
}

function main() {
  const probes = probeJudgementCapability();
  const anyCapable = probes.some(probe => probe.available);

  // The corpus exists either way: a generation that could not run a task still
  // pins what it would have run, so a later environment can execute exactly it.
  const corpus = compileHoldoutCorpus({
    suiteVersion: SUITE_VERSION,
    tasks: [{
      taskId: 'c.judgement.novel-mechanism',
      family: 'INVENTION',
      tier: 'SEALED_HOLDOUT',
      difficulty: 0.9,
      prompt: 'Given a repository that can measure its own consistency but not its own capability, propose a measurement that separates the two without a model provider, or state that none exists and why.',
      answer: 'REQUIRES_JUDGEMENT_NOT_COMPUTED_BY_THIS_REPOSITORY'
    }]
  });
  if (!corpus.ok) { console.error(JSON.stringify(corpus, null, 2)); return 1; }

  let sourceCommit = null;
  try { sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(); } catch { /* no git */ }

  // Carry forward the dimensions G1 measured, unchanged, because nothing in
  // this generation changed the system -- and record the capability dimension
  // as unmeasured rather than scoring it. A number here would be invented.
  const g1 = readJson(`${GEN_DIR}/G1.json`);
  const generation = recordGeneration({
    generationId: 'G2',
    sourceCommit,
    suiteVersion: SUITE_VERSION,
    corpusDigest: corpus.corpusDigest,
    vector: anyCapable ? { invention: null } : { ...(g1?.vector || {}), invention: null },
    baselines: {
      B0: { description: 'G1 derived-answer corpus, which saturated at 1.0 across nine dimensions.' },
      B4: { description: 'G1 at the same commit lineage.' },
      B5: { description: 'Current UberBond at this exact commit.' }
    },
    cost: { usdCents: 0, founderMinutes: 0 },
    environment: {
      node: process.version,
      judgementProbes: probes,
      providerModelsConfigured: anyCapable
    },
    failures: anyCapable ? [] : [{
      taskId: 'c.judgement.novel-mechanism',
      family: 'INVENTION',
      reason: 'NOT_RUN__NO_JUDGEMENT_CAPABILITY_AVAILABLE',
      detail: 'No provider credential, no configured provider, no local transformers runtime and no ollama binary in this environment.'
    }]
  });
  if (!generation.ok) { console.error(JSON.stringify(generation, null, 2)); return 1; }

  mkdirSync(join(root, GEN_DIR), { recursive: true });
  writeFileSync(join(root, `${GEN_DIR}/G2.json`), `${JSON.stringify(generation, null, 2)}\n`);

  const comparison = g1 ? compareGenerations(g1, generation) : null;
  if (comparison) writeFileSync(join(root, 'artifacts/nullstar-omega/G1-to-G2.json'), `${JSON.stringify(comparison, null, 2)}\n`);

  const verdict = anyCapable
    ? 'JUDGEMENT_CAPABILITY_AVAILABLE__RUN_THE_CAPABILITY_TASK'
    : 'EXTERNAL_GATE_CONFIRMED__NO_JUDGEMENT_CAPABILITY_IN_THIS_ENVIRONMENT';

  writeFileSync(join(root, 'artifacts/nullstar-omega/G2-discriminating-test.json'), `${JSON.stringify({
    schemaVersion: 'uberbond-nullstar-omega-discriminating-test-1.0.0',
    diagnosis: 'BN-EVAL-MEASURES-CONSISTENCY-NOT-CAPABILITY',
    discriminatingTest: 'Configure any model provider and run one task whose answer the repository does not compute. If a local runtime can serve it, the gap was authorship rather than the provider.',
    probes,
    verdict,
    promotion: 'NO_PROMOTION',
    classification: anyCapable ? 'SOFTWARE_GAP' : 'EXTERNAL_BLOCKED',
    consequence: anyCapable
      ? 'A capability task can be authored and scored here.'
      : 'The gap is the provider, not the corpus. Further local corpus authorship cannot close it, and scoring a capability dimension without anything capable of the judgement would fabricate the number.',
    businessEffectAuthority: 'NONE'
  }, null, 2)}\n`);

  console.log(JSON.stringify({
    status: generation.status,
    generationId: 'G2',
    probes,
    verdict,
    promotion: 'NO_PROMOTION',
    classification: anyCapable ? 'SOFTWARE_GAP' : 'EXTERNAL_BLOCKED',
    coverage: generation.coverage,
    comparison: comparison ? { comparable: comparison.counts.comparable, regressed: comparison.regressedDimensions, netDelta: comparison.netDelta } : null,
    businessEffectAuthority: 'NONE'
  }, null, 2));
  return 0;
}

process.exit(main());
