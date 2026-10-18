// These are *live generator* tests, not checks against a previously generated
// artifact. Every synthetic Git repo and artifact is disposable; nothing writes
// to the operator's checkout or promotes simulated evidence to external proof.
import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const source = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const json = file => JSON.parse(readFileSync(file, 'utf8'));
const put = (root, name, content) => {
  const p = join(root, name);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, typeof content === 'string' ? content : JSON.stringify(content));
};
const git = (root, ...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', timeout: 12000 }).trim();

async function sandbox(script, callback, { withGap = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'ub-v7-falsify-'));
  try {
    put(root, 'package.json', '{"type":"module"}');
    const file = join('scripts', script);
    mkdirSync(join(root, 'scripts'), { recursive: true });
    cpSync(join(source, file), join(root, file));
    if (withGap) {
      mkdirSync(join(root, 'src'), { recursive: true });
      cpSync(join(source, 'src/v7-gap-ledger.mjs'), join(root, 'src/v7-gap-ledger.mjs'));
    }
    git(root, 'init', '-q', '--initial-branch=main');
    git(root, 'add', '.');
    git(root, '-c', 'user.name=Falsification Sandbox', '-c', 'user.email=tests@example.invalid', 'commit', '-q', '-m', 'baseline');
    git(root, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
    await callback({ root, path: join(root, file), run: () => execFileSync(process.execPath, [join(root, file)], { cwd: root, timeout: 18000, encoding: 'utf8' }) });
  } finally { rmSync(root, { recursive: true, force: true }); }
}

test('live proof generator never turns permissions into debt or mentions into proven mutation guards', async () => {
  await sandbox('v7-proof-obligations.mjs', ({ root, run }) => {
    put(root, 'artifacts/constitution/directives.json', { directives: [
      { id:'PERMISSION-SYNTH', class:'PERMISSION', authorityClass:'EXTERNAL_EFFECT', tests:['mention'] },
      { id:'MUTATION-SYNTH', class:'PROHIBITION', authorityClass:'EXTERNAL_EFFECT', tests:['mention'], mutationGuards:[] }
    ] });
    run();
    const rows = json(join(root, 'artifacts/v7/proof-obligations.json')).rows;
    assert.equal(rows.find(x => x.id === 'PERMISSION-SYNTH').discharged, null);
    assert.equal(rows.find(x => x.id === 'MUTATION-SYNTH').discharged, false);
  });
});

test('live claim registry detects real source drift and never treats headless deployment proof as exact-head', async () => {
  await sandbox('v7-claim-evidence-registry.mjs', ({ root, run }) => {
    put(root, 'src/probe.mjs', 'export const proof = 1;');
    git(root, 'add', 'src/probe.mjs');
    git(root, '-c', 'user.name=Sandbox', '-c', 'user.email=tests@example.invalid', 'commit', '-q', '-m', 'source-v1');
    const oldSha = git(root, 'rev-parse', 'HEAD');
    put(root, 'src/probe.mjs', 'export const proof = 2;');
    git(root, 'add', 'src/probe.mjs');
    git(root, '-c', 'user.name=Sandbox', '-c', 'user.email=tests@example.invalid', 'commit', '-q', '-m', 'source-v2');
    put(root, 'artifacts/v7/gap-ledger.json', { sourceSha: oldSha, summary: {softwareOpen: 2}, gaps: [] });
    put(root, 'artifacts/ubercel/deployment-signals.json', { signals: [] });
    run();
    const rows = json(join(root, 'artifacts/v7/claim-evidence-registry.json')).rows;
    assert.equal(rows.find(r => r.id === 'CLM-SOFTWARE-OPEN').freshness, 'STALE_AGAINST_CURRENT_HEAD');
    assert.ok(rows.find(r => r.id === 'CLM-SOFTWARE-OPEN').sourceChangedSince.includes('src/probe.mjs'));
    const deployment = rows.find(r => r.id === 'CLM-DEPLOYMENT-STATE');
    assert.equal(deployment.freshness, 'NOT_HEAD_BOUND');
    assert.equal(deployment.producedAtSha, null);
  });
});

test('live artifact index records actual empty files rather than claiming generation from existence alone', async () => {
  await sandbox('v7-artifact-index.mjs', ({root,run}) => {
    put(root, 'artifacts/v7/gap-ledger.json', '');
    run();
    const row = json(join(root, 'artifacts/v7/artifact-index.json')).rows.find(r => r.artifact === 'artifacts/v7/gap-ledger.json');
    assert.equal(row.state, 'GENERATED');
    assert.equal(row.nonEmpty, false);
  });
});

test('unclassified missing artifacts must not be disguised as computable work', async () => {
  const module = await import('../scripts/v7-artifact-index.mjs');
  assert.equal(module.absenceReasonFor({}), 'UNCLASSIFIED');
  assert.equal(module.absenceReasonFor({ absenceReason: 'NEEDS_EXTERNAL_REALITY' }), 'NEEDS_EXTERNAL_REALITY');
});

test('git-backed gap check flags actual uncommitted source without counting regenerated artifacts', async () => {
  for (const [scenario, dirty, expected] of [
    ['real source', 'src/local-only.mjs', 'OPEN'],
    ['generated artifact', 'artifacts/system-readiness.json', 'CLOSED']
  ]) {
    await sandbox('v7-gap-ledger.mjs', async ({ root, path }) => {
      put(root, dirty, 'not committed');
      const { GAPS } = await import(pathToFileURL(path).href + '?case=' + scenario.replaceAll(' ', '-'));
      const gap = GAPS.find(row => row.id === 'V7G005-VERIFIED-WORK-STRANDED-OFF-MAIN');
      assert.ok(gap, 'source-stranding check must exist');
      const result = gap.check();
      assert.equal(result.status, expected, scenario);
      assert.equal(result.measured.ahead, 0);
      assert.equal(result.measured.uncommittedSource, expected === 'OPEN' ? 1 : 0);
      assert.equal(Object.hasOwn(result.measured, 'uncommittedArtifacts'), false, 'generator output is not dirty source');
    }, {withGap:true});
  }
});
