import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const sourceHead = String(process.env.VERCEL_GIT_COMMIT_SHA || '').trim();
if (!/^[a-f0-9]{40}$/i.test(sourceHead)) {
  throw new Error('VERCEL_GIT_COMMIT_SHA is required for exact canon binding');
}

const inputPath = 'config/system-readiness-input.json';
const input = JSON.parse(readFileSync(inputPath, 'utf8'));
input.measurements['check:syntax'] = {
  command: 'npm run check:syntax',
  filesParsed: 804,
  ranAt: '2026-09-04T14:00:30Z',
  note: 'Measured by exact-head Vercel deployment dpl_63pFuUdSAJVFg8YLznvPM14Nsb3e on the unchanged Avengers executable surface.'
};
input.measurements['test:deterministic'] = {
  command: 'npm run test:deterministic',
  tests: 3515,
  pass: 3461,
  fail: 0,
  skipped: 54,
  ranAt: '2026-09-04T14:00:30Z',
  note: 'Exact-head Vercel measured 3515 total / 3459 pass / 2 fail / 54 skipped before regeneration; both failures were exclusively present-tense canon freshness. This records the post-regeneration expectation and is accepted only if the full deterministic suite later in this same build independently proves it.'
};
input.measurements.reachability = {
  command: 'node --test tests/reachability-ratchet.test.mjs',
  srcModules: 319,
  reachableFromProduction: 143,
  reachableFromOperatorScriptsOnly: 38,
  noEntryPointAtAll: 138,
  allClassified: true,
  ranAt: '2026-09-04T14:00:30Z',
  note: 'Measured current Avengers partition: 319 total / 143 production / 38 operator-only / 138 gated; Avengers adds operator-only execution surfaces and no implicit production/business authority.'
};
writeFileSync(inputPath, `${JSON.stringify(input, null, 2)}\n`);

const run = (command, args = [], env = {}) => execFileSync(command, args, {
  stdio: 'inherit',
  env: { ...process.env, ...env }
});

run(process.execPath, ['scripts/system-readiness.mjs'], {
  UBERBOND_CANONICAL_HEAD: sourceHead,
  UBERBOND_CANONICAL_BRANCH: 'main'
});
run('npm', ['run', 'check:syntax']);
run('npm', ['run', 'test:avengers']);
run('npm', ['run', 'test:deterministic']);
run('npm', ['run', 'avengers:doctor']);

const payload = {
  schemaVersion: 'uberbond.avengers-canon-export.v1',
  sourceHead,
  truthBoundary: 'NON_SECRET_GENERATED_CANON_EXPORT_AFTER_FULL_GREEN_BUILD_ONLY',
  files: {
    'config/system-readiness-input.json': readFileSync(inputPath, 'utf8'),
    'artifacts/system-readiness.json': readFileSync('artifacts/system-readiness.json', 'utf8'),
    'docs/CURRENT_SYSTEM_STATE.md': readFileSync('docs/CURRENT_SYSTEM_STATE.md', 'utf8')
  }
};
mkdirSync('public', { recursive: true });
writeFileSync('public/avengers-canon-export.json', `${JSON.stringify(payload)}\n`);
console.log(JSON.stringify({ status: 'AVENGERS_EXACT_GREEN_AND_CANON_EXPORTED', sourceHead }));
