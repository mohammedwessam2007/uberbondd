import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateSkill } from '../scripts/ubermind-claude-ai-skill-pack.mjs';

const skill = readFileSync(new URL('../integrations/claude-ai/ubermind-lean/SKILL.md', import.meta.url), 'utf8');

test('shipped claude.ai skill passes validation', () => {
  const v = validateSkill(skill);
  assert.equal(v.ok, true, v.errors.join('; '));
  assert.equal(v.name, 'ubermind-lean');
});

test('rejects missing frontmatter, long description, dropped 890 anchor', () => {
  assert.equal(validateSkill('# no frontmatter').ok, false);
  assert.equal(validateSkill(skill.replace(/description: .*/, `description: ${'x'.repeat(201)}`)).ok, false);
  assert.equal(validateSkill(skill.replaceAll('founder-moonshot-0001', 'idea-1')).ok, false);
});

test('project instructions stay compact and keep truth law', () => {
  const p = readFileSync(new URL('../integrations/claude-ai/PROJECT_INSTRUCTIONS.md', import.meta.url), 'utf8');
  assert.ok(p.length < 4000);
  for (const s of ['UNKNOWN', '890', 'Reality Court', 'PHOENIX']) assert.ok(p.includes(s), s);
});
