import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>readFileSync(resolve(root,p),'utf8');
const haiku=read('.claude/agents/ubermind-haiku-scout.md');
const sonnet=read('.claude/agents/ubermind-sonnet-falsifier.md');
const opus=read('.claude/agents/ubermind-opus-frontier-judge.md');
const arch=read('docs/architecture/UBERMIND_OMEGA_V18_PRECISION_EFFORT_AGENT_TREE_2026-10-10.md');

test('W39 does not replace existing narrow Haiku scout',()=>{
 assert.match(haiku,/model: haiku/);
 assert.match(haiku,/effort: low/);
 assert.match(haiku,/maxTurns: 6/);
 assert.match(haiku,/tools: Read, Grep, Glob/);
});
test('W39 independent Sonnet falsifier is explicitly bounded and read-only',()=>{
 assert.match(sonnet,/name: ubermind-sonnet-falsifier/);
 assert.match(sonnet,/model: sonnet\neffort: high\ntools: Read, Grep, Glob\nmaxTurns: 6/);
 assert.match(sonnet,/ONLY for an unresolved correctness/);
 assert.match(sonnet,/No shell execution, writes/);
});
test('W39 Opus Crown is high effort, read-only and invoked only when necessary',()=>{
 assert.match(opus,/model: opus\neffort: high\ntools: Read, Grep, Glob\nmaxTurns: 8/);
 assert.match(opus,/genuinely novel\/high-consequence reasoning/);
 assert.match(opus,/never always-running/);
});
test('W39 explicit fallback to full Opus worker and no fictitious Max switch',()=>{
 assert.match(opus,/PRIMARY WORKER/);
 assert.match(opus,/where supported by active account\/model/);
});
test('W39 preserve 890 literal/Genesis/source and current security boundary',()=>{
 assert.match(arch,/all 890 literal founder ideas/);
 assert.match(arch,/GENESIS/);
 assert.match(arch,/PHOENIX/);
 assert.match(arch,/No extra API provider spend/);
});
test('W39 conditional team avoids fixed giant swarm and quality downgrades',()=>{
 assert.match(arch,/Max two peer agents initially/);
 assert.match(arch,/if a review is required to pass, it MUST run/);
 assert.match(arch,/five-hour\/weekly metered usage savings are UNKNOWN/);
});
test('W39 economics expose assumptions separately from subscription truth',()=>{
 assert.match(arch,/\$3\.66\*\(1-R\)\+\$0\.03512/);
 assert.match(arch,/\$1\.49912 \/ 81\.261%/);
 assert.match(arch,/USD \$20\/month/);
});
