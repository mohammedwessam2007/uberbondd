#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { compileUberOsManifest } from '../src/uberos/system-compiler.mjs';

const root = resolve(new URL('..', import.meta.url).pathname);
const manifestPath = process.argv[2] ? resolve(process.cwd(), process.argv[2]) : resolve(root, 'artifacts/uberos/generation-0-manifest.json');
let raw;
try { raw = JSON.parse(readFileSync(manifestPath, 'utf8')); }
catch (error) {
  console.error(JSON.stringify({ ok: false, status: 'UBEROS_DOCTOR_INPUT_ERROR', manifestPath, error: String(error?.message || error) }, null, 2));
  process.exit(2);
}
const report = compileUberOsManifest(raw);
console.log(JSON.stringify({ ...report, manifestPath }, null, 2));
process.exit(report.ok ? 0 : 1);
