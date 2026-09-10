import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('terminal realization persists current semantic refusal before returning to self-completion',()=>{
  const source=readFileSync(new URL('../scripts/terminal-realization.mjs',import.meta.url),'utf8');
  assert.match(source,/compileTerminalSemanticRefusalHandoff/);
  assert.match(source,/readJsonMaybe\('artifacts\/sovereign\/semantic-requirement-tribunal\.json'\)/);
  assert.match(source,/if\(semanticRun\?\.exitCode!==0&&semanticTribunal\)/);
  assert.match(source,/return persist\(\{\.\.\.handoff,generatedAt:/);
  assert.match(source,/finiteOpenRequirements:Array\.isArray\(result\.finiteOpenRequirements\)/);
});

test('generic generator failure still writes exact-head incomplete terminal evidence',()=>{
  const source=readFileSync(new URL('../scripts/terminal-realization.mjs',import.meta.url),'utf8');
  assert.match(source,/terminal-source-tribunal-generator-failed/);
  assert.match(source,/sourceCommit:truthReceipt\.headSha/);
  assert.match(source,/finiteEngineeringClosure:'INCOMPLETE'/);
  assert.match(source,/finiteOpenRequirements:\[\]/);
});
