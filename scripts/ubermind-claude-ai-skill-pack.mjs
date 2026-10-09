#!/usr/bin/env node
// Validates and packages the claude.ai-uploadable ubermind-lean skill.
// Usage: node scripts/ubermind-claude-ai-skill-pack.mjs [outDir]
// No network, no provider calls. Writes only the zip into outDir (default: dist/claude-ai).
import { readFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const SKILL_DIR = join(ROOT, 'integrations/claude-ai/ubermind-lean');

export function validateSkill(text) {
  const errors = [];
  const m = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!m) return { ok: false, errors: ['missing YAML frontmatter'] };
  const fields = Object.fromEntries(m[1].split('\n').map((l) => {
    const i = l.indexOf(':');
    return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
  }));
  if (!/^[a-z0-9-]{1,64}$/.test(fields.name || '')) errors.push('name must be lowercase/hyphen, <=64 chars');
  if (!fields.description || fields.description.length > 200) errors.push('description required, <=200 chars');
  for (const must of ['founder-moonshot-0001', 'UNKNOWN', 'Reality Court', 'PHOENIX', '.claude/skills/ubermind-lean/SKILL.md']) {
    if (!text.includes(must)) errors.push(`missing required anchor: ${must}`);
  }
  if (/sk-ant-|api[_-]?key\s*=/i.test(text)) errors.push('looks like a secret');
  return { ok: errors.length === 0, errors, name: fields.name };
}

function main() {
  const outDir = resolve(process.argv[2] || join(ROOT, 'dist/claude-ai'));
  const skillPath = join(SKILL_DIR, 'SKILL.md');
  const text = readFileSync(skillPath, 'utf8');
  const v = validateSkill(text);
  if (!v.ok) { console.error(JSON.stringify(v, null, 2)); process.exit(1); }
  mkdirSync(outDir, { recursive: true });
  const zip = join(outDir, 'ubermind-lean.zip');
  if (existsSync(zip)) rmSync(zip);
  // -X strips extra attributes; zip contains ubermind-lean/SKILL.md as claude.ai expects.
  execFileSync('zip', ['-X', '-q', zip, 'ubermind-lean/SKILL.md'], { cwd: join(ROOT, 'integrations/claude-ai') });
  console.log(JSON.stringify({
    status: 'PACKAGED',
    zip,
    skillSha256: createHash('sha256').update(text).digest('hex'),
    uploadedToClaudeAi: false,
    paidProviderCalls: 0,
  }, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) main();
