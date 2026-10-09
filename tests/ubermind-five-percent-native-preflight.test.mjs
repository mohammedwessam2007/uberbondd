import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {calculateUberMindFivePercent} from '../src/ubermind-five-percent-compression-gate.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const preflight=readFileSync(resolve(root,'scripts/ubermind-five-percent-preflight.mjs'),'utf8');
const graph=readFileSync(resolve(root,'docs/architecture/UBERMIND_OMEGA_V13_5PCT_REALITY_ENGINE.mmd'),'utf8');
const prompt=readFileSync(resolve(root,'docs/prompts/UBERMIND_OMEGA_V13_5PCT_INSTRUCTIONS_2026-10-10.md'),'utf8');
test('W35 script executes existing verified source work, not new API tool',()=>{
 assert.match(preflight,/import \{runUberMindLiveSourceWork\} from '\.\.\/src\/ubermind-exact-source-work\.mjs'/);
 assert.match(preflight,/runUberMindLiveSourceWork\(\{root:at\}\)/);
 assert.match(preflight,/auditDirectClaudeImports\(\{repoRoot:at\}\)/);
});
test('W35 keeps reported actual /usage null until observed',()=>{
 assert.match(preflight,/actualFiveHourUsagePercent:null/);
 assert.match(preflight,/novelTaskFrontierQualityProven:false/);
 assert.match(preflight,/acceptedQualityParityForArbitraryTasksVerified:false/);
});
test('W35 local CLI never sends paid inference, makes no source write',()=>{
 assert.match(preflight,/providerCallsPerformed:0,paidInferenceAuthorized:false/);
 assert.match(preflight,/externalEffectAuthority:'NONE'/);
 assert.doesNotMatch(preflight,/https:\/\//);
});
test('W35 complete graph preserves 890 + JEV + GENESIS and source proof',()=>{
 for(const re of [/890/,/GENESIS/,/JEV/,/HAIKU/,/SONNET/,/OPUS/,/PHOENIX/,/EXACT/,/FIVE-HOUR/])
   assert.match(graph,re);
});
test('W35 model claims require total usage and quality, not source bytes',()=>{
 assert.match(prompt,/43\.75%/);
 assert.match(prompt,/five-hour/);
 assert.match(prompt,/quality/i);
 assert.match(prompt,/UNKNOWN/);
});
test('W35 no-amputation original corpus, existing native auditor and skill intact',()=>{
 for(const path of [
   'artifacts/research/founder-moonshot-literal-corpus/manifest.json',
   'scripts/ubermind-startup-context-audit.mjs',
   'src/ubermind-exact-source-work.mjs',
   '.claude/skills/ubermind-lean/SKILL.md'
 ])assert.ok(existsSync(resolve(root,path)),path);
});
test('W35 95% metered delegation threshold remains mathematical only',()=>{
 const v=calculateUberMindFivePercent();
 assert.equal(v.minimumRequiredReuseShare,.95);
 assert.equal(v.observedClaudeUsagePoints,null);
 assert.equal(v.qualifiedEmpiricalSuccess,false);
});
