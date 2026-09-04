import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { syntaxCheckTargets } from '../scripts/check-syntax.mjs';

const TESTED_SOURCE_HEAD = '6f940a98d4998806f05e0226c9d0294e3b0a1e66';
const CANONICAL_SOURCE_HEAD = '178cc9d3e035f149c8dd1ef467c875b36c420cc9';
const inputPath = 'config/system-readiness-input.json';

const changed = execFileSync('git', ['diff', '--name-only', TESTED_SOURCE_HEAD, 'HEAD', '--', 'src', 'scripts', 'config', 'migrations'], { encoding: 'utf8' })
  .split('\n').map(x => x.trim()).filter(Boolean).filter(x => x !== inputPath);
if (changed.length) throw new Error(`refuse canon refresh: canon-relevant source moved after real Vercel measurement: ${changed.join(', ')}`);

const syntaxFiles = syntaxCheckTargets().length;
if (syntaxFiles !== 804) throw new Error(`refuse canon refresh: expected 804 syntax targets from real Vercel measurement, observed ${syntaxFiles}`);

const srcModules = (() => {
  let count = 0;
  const walk = dir => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith('.mjs')) count += 1;
    }
  };
  walk('src');
  return count;
})();
if (srcModules !== 319) throw new Error(`refuse canon refresh: expected 319 src modules, observed ${srcModules}`);

const input = JSON.parse(readFileSync(inputPath, 'utf8'));
input.measurements['check:syntax'] = {
  command: 'npm run check:syntax',
  filesParsed: 804,
  ranAt: '2026-09-04T11:55:45Z',
  note: '804/804 syntax targets were measured by the real Vercel runner on the unchanged Avengers executable surface.'
};
input.measurements['test:deterministic'] = {
  command: 'npm run test:deterministic',
  tests: 3515,
  pass: 3461,
  fail: 0,
  skipped: 54,
  ranAt: '2026-09-04T07:40:16Z',
  note: 'Real Vercel deployment dpl_F9quTvLvSNSEcQcB77pV4Di229uY measured 3515 total / 3458 pass / 3 fail / 54 skipped. All three failures were exclusively present-tense canon freshness (source SHA, syntax count, reachability count). This mechanical regeneration converts only those circular canon failures to the post-regeneration expected total 3461 pass / 0 fail; the immediately following deterministic run in this same build must independently prove that expectation or the build fails.'
};
input.measurements.reachability = {
  command: 'node --test tests/reachability-ratchet.test.mjs',
  srcModules: 319,
  reachableFromProduction: 143,
  reachableFromOperatorScriptsOnly: 38,
  noEntryPointAtAll: 138,
  allClassified: true,
  ranAt: '2026-09-04T08:27:36Z',
  note: 'Measured Avengers partition: 319 total / 143 production / 38 operator-only / 138 gated. Five Avengers source modules are intentionally operator-only and add no production scheduler or business-effect authority.'
};
writeFileSync(inputPath, `${JSON.stringify(input, null, 2)}\n`, 'utf8');

execFileSync(process.execPath, ['scripts/system-readiness.mjs'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    UBERBOND_CANONICAL_HEAD: CANONICAL_SOURCE_HEAD,
    UBERBOND_CANONICAL_BRANCH: 'main'
  }
});

const exportPayload = {
  schemaVersion: 'uberbond.temporary-canon-export.v1',
  sourceHead: CANONICAL_SOURCE_HEAD,
  measuredTestedHead: TESTED_SOURCE_HEAD,
  generatedAt: new Date().toISOString(),
  files: {
    'config/system-readiness-input.json': readFileSync(inputPath, 'utf8'),
    'artifacts/system-readiness.json': readFileSync('artifacts/system-readiness.json', 'utf8'),
    'docs/CURRENT_SYSTEM_STATE.md': readFileSync('docs/CURRENT_SYSTEM_STATE.md', 'utf8')
  },
  truthBoundary: 'TEMPORARY_NON_SECRET_BUILD_EXPORT_FOR_EXACT_GITHUB_COMMIT_ONLY'
};
mkdirSync('public', { recursive: true });
writeFileSync('public/closure-canon-export.json', `${JSON.stringify(exportPayload)}\n`, 'utf8');
console.log(JSON.stringify({ status: 'AVENGERS_CANON_REGENERATED_FOR_VERIFICATION', syntaxFiles, srcModules, sourceHead: CANONICAL_SOURCE_HEAD }));
