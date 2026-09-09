import test from 'node:test';
import assert from 'node:assert/strict';
import { parseGitPorcelainPaths, truthInputDirtyPaths, newlyDirtyPaths, parseTrackedPaths } from '../scripts/current-truth-regeneration.mjs';

test('porcelain parser preserves a first-line leading status column',()=>{const paths=parseGitPorcelainPaths(' M artifacts/sovereign/implementation-coverage-matrix.json\n M artifacts/system-readiness.json\n M docs/CURRENT_SYSTEM_STATE.md\n');assert.deepEqual(paths,['artifacts/sovereign/implementation-coverage-matrix.json','artifacts/system-readiness.json','docs/CURRENT_SYSTEM_STATE.md']);});
test('porcelain parser returns rename destination',()=>{assert.deepEqual(parseGitPorcelainPaths('R  docs/old.md -> docs/CURRENT_SYSTEM_STATE.md\n'),['docs/CURRENT_SYSTEM_STATE.md']);});
test('platform workspace dirt is ignored only when it is outside truth inputs',()=>{const dirty=['vercel.json','.vercel/project.json','src/core.mjs','tests/x.test.mjs','config/a.json','artifacts/x.json','docs/CURRENT_HANDOFF.json'];assert.deepEqual(truthInputDirtyPaths(dirty),['artifacts/x.json','config/a.json','docs/CURRENT_HANDOFF.json','src/core.mjs','tests/x.test.mjs']);});
test('package entrypoints and scripts are protected truth inputs',()=>{assert.deepEqual(truthInputDirtyPaths(['package.json','server.mjs','worker.mjs','scripts/x.mjs','.vercel/x']),['package.json','scripts/x.mjs','server.mjs','worker.mjs']);});
test('post-run mutation check subtracts harmless preexisting workspace dirt',()=>{assert.deepEqual(newlyDirtyPaths(['vercel.json','.vercel/'],['vercel.json','.vercel/','artifacts/system-readiness.json','docs/CURRENT_SYSTEM_STATE.md']),['artifacts/system-readiness.json','docs/CURRENT_SYSTEM_STATE.md']);});
test('tracked-tree parser is deterministic deduplicated and preserves repository paths',()=>{assert.deepEqual(parseTrackedPaths('src/z.mjs\ntests/a.test.mjs\nsrc/z.mjs\nartifacts/a.json\n'),['artifacts/a.json','src/z.mjs','tests/a.test.mjs']);});
