#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyEnforcementManifestAdmission } from '../src/enforcement-manifest-admission.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const path = join(root, 'artifacts/sovereign/enforcement-manifest.json');

let entries;
try {
  const parsed = JSON.parse(readFileSync(path, 'utf8'));
  entries = parsed.entries;
} catch (error) {
  console.error(JSON.stringify({ ok: false, status: 'ENFORCEMENT_MANIFEST_ADMISSION_REFUSED', problems: [{ reason: 'enforcement-manifest-unreadable', detail: String(error?.message || error) }], businessEffectAuthority: 'NONE', externalEffectAuthority: 'NONE' }, null, 2));
  process.exitCode = 2;
}

if (!process.exitCode) {
  const verdict = verifyEnforcementManifestAdmission({ entries, fileExists: relative => {
    try { readFileSync(join(root, relative)); return true; } catch { return false; }
  } });
  console.log(JSON.stringify(verdict, null, 2));
  if (!verdict.ok) process.exitCode = 2;
}
