import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=path=>readFileSync(resolve(root,path),'utf8');
const main=read('CLAUDE.md');
const skill=read('.claude/skills/ubermind-lean/SKILL.md');
const graph=read('docs/architecture/UBERMIND_OMEGA_V12_ULTRALEAN_EXECUTION_TREE.mmd');
const terminal=read('docs/architecture/UBERMIND_OMEGA_V12_ULTRALEAN_TERMINAL.txt');
const prompt=read('docs/prompts/UBERMIND_OMEGA_V12_GIVE_THIS_TO_CLAUDE_2026-10-09.md');
const scout=read('.claude/agents/ubermind-haiku-scout.md');

test('W34 native project skill is discoverable with exact frontmatter',()=>{
 assert.match(skill,/^---\nname: ubermind-lean\n/);
 assert.match(skill,/description: Minimize the ACTUAL Claude Pro five-hour/);
 assert.match(skill,/\n---\n\n# UBERMIND/);
});
test('W34 root original W30 mandatory import count and founder law intact',()=>{
 assert.equal((main.match(/^@\S+/gm)||[]).length,18);
 assert.match(main,/@docs\/FOUNDER_890_UNIVERSAL_CROSS_CHAT_INTEGRATION.md/);
 assert.match(main,/@AGENTS.md/);
 assert.match(main,/@NORTH_STAR.md/);
 assert.match(main,/\/ubermind-lean/);
});
test('W34 source preserves original 890 literal corpus and GENESIS lineage',()=>{
 assert.ok(existsSync(resolve(root,'artifacts/research/founder-moonshot-literal-corpus/manifest.json')));
 assert.match(skill,/#0001–#0890/);
 assert.match(skill,/ten shards/);
 assert.match(skill,/GENESIS/);
});
test('W34 source explicitly minimizes five-hour and weekly Pro consumption',()=>{
 assert.match(skill,/five-hour and weekly/);
 assert.match(skill,/minimum cumulative Claude Pro allowance/);
 assert.match(skill,/No paid provider calls|No JEV provider inference|No JEV provider/);
});
test('W34 no autonomous paid JEV/Fable/API fallback path',()=>{
 assert.match(skill,/No JEV provider inference/);
 assert.match(skill,/No JEV provider inference, Fable/);
 assert.match(prompt,/No API, JEV, Fable or outside spend/);
});
test('W34 quality gate and strong Opus fallback remain explicit',()=>{
 assert.match(skill,/quality cannot be maintained/);
 assert.match(skill,/Reality Court/);
 assert.match(skill,/Opus 5\.5 high-effort/);
});
test('W34 optional scout retains narrow read-only permissions',()=>{
 assert.match(scout,/model: haiku/);
 assert.match(scout,/tools: Read, Grep, Glob/);
 assert.match(scout,/maxTurns: 6/);
 assert.match(scout,/omitClaudeMd: true/);
});
test('W34 graph and terminal begin from prompt and retain 890 and PHOENIX',()=>{
 assert.match(graph,/flowchart TB/);
 for(const pattern of [/ORDINARY PROMPT/,/890 ORIGINAL/,/JEV 1\.13/,/OPUS/,/PHOENIX/,/FIVE-HOUR/])assert.match(graph,pattern);
 assert.match(terminal,/YOUR NORMAL PROMPT/);
 assert.match(terminal,/NO HIDDEN MODEL SWITCH/);
});
test('W34 bootstrap is usable in Claude Code and separates normal chat limitations',()=>{
 assert.match(prompt,/## Paste this entire prompt in Claude Code once/);
 assert.match(prompt,/\.claude\/skills\/ubermind-lean\/SKILL.md/);
 assert.match(prompt,/## Short version for normal claude\.ai Project Instructions/);
 assert.match(prompt,/usage is not accessible|private usage is not accessible/i);
});
test('W34 no invented 30 percent savings or account telemetry',()=>{
 assert.match(skill,/not a fixed 30%/);
 assert.match(skill,/actual_5h_usage: UNKNOWN/);
 assert.match(prompt,/UNKNOWN/);
});
