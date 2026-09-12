import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const status=fs.readFileSync(path.join(root,'PRIVATE_ASI_STATUS.md'),'utf8');
const match=status.match(/`(docs\/prompts\/UBERBOND_8H_REVENUE_SINGULARITY_2026-09-12\.md)`/);

test('private ASI status points to an existing revenue mission entry point',()=>{
  assert.ok(match,'PRIVATE_ASI_STATUS must name the canonical revenue mission path');
  assert.equal(fs.existsSync(path.join(root,match[1])),true,`missing referenced mission: ${match[1]}`);
});

test('reconstructed revenue mission never masquerades as recovered verbatim history',()=>{
  const mission=fs.readFileSync(path.join(root,'docs/prompts/UBERBOND_8H_REVENUE_SINGULARITY_2026-09-12.md'),'utf8');
  assert.match(mission,/truth-labeled recovery entry point/i);
  assert.match(mission,/not a claim that the missing original text was recovered/i);
  assert.match(mission,/No fake first cash/i);
  assert.match(mission,/No fake sovereign-cut closure/i);
  assert.match(mission,/No unapproved paid commitment/i);
});
