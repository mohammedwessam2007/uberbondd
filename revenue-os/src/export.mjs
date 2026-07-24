// Delivery ZIP exporter. Same idempotent-export design proven in this session's sibling missions:
// no export-time randomness, fixed entry mtimes, so identical inputs produce a byte-identical zip
// archive across repeated runs.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { sha256Hex } from './utils.mjs';

const execFileAsync = promisify(execFile);

export class ExportError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = 'ExportError';
    this.code = code;
  }
}

export function buildDeliveryFiles({ reportHtml, reportMarkdown, reportJson, proposalJson, onboardingJson, qaResultJson }) {
  return {
    'report.html': reportHtml, 'report.md': reportMarkdown, 'report.json': reportJson,
    'proposal.json': proposalJson, 'onboarding.json': onboardingJson, 'qa-result.json': qaResultJson
  };
}

function canonicalize(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonicalize(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}

export function buildDeliveryManifest(projectId, files, secret, { generatedAt } = {}) {
  if (!generatedAt) throw new ExportError('generated-at-required');
  if (!secret || String(secret).length < 16) throw new ExportError('manifest-secret-not-configured');
  const fileList = Object.keys(files).sort().map(name => ({ path: name, sha256: sha256Hex(files[name]), bytes: Buffer.byteLength(files[name], 'utf8') }));
  const body = { projectId, generatedAt, files: fileList };
  const signature = crypto.createHmac('sha256', String(secret)).update(canonicalize(body)).digest('hex');
  return { ...body, signature };
}

export function verifyDeliveryManifest(projectId, files, manifest, secret, { generatedAt } = {}) {
  const recomputed = buildDeliveryManifest(projectId, files, secret, { generatedAt: generatedAt || manifest.generatedAt });
  const a = Buffer.from(String(manifest.signature || ''), 'hex'), b = Buffer.from(recomputed.signature, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function exportDelivery({ outDir, zipPath, files, manifest }) {
  await fs.rm(outDir, { recursive: true, force: true });
  await fs.mkdir(outDir, { recursive: true });
  for (const [name, content] of Object.entries(files)) await fs.writeFile(path.join(outDir, name), content);
  await fs.writeFile(path.join(outDir, 'MANIFEST.json'), JSON.stringify(manifest, null, 2));
  const checksumLines = [...Object.keys(files), 'MANIFEST.json'].sort()
    .map(name => `${sha256Hex(name === 'MANIFEST.json' ? JSON.stringify(manifest, null, 2) : files[name])}  ./${name}`);
  await fs.writeFile(path.join(outDir, 'CHECKSUMS.sha256'), checksumLines.join('\n') + '\n');

  const FIXED_MTIME = '202001010000.00';
  const entries = (await fs.readdir(outDir)).sort();
  for (const entry of entries) await execFileAsync('touch', ['-t', FIXED_MTIME, path.join(outDir, entry)]);

  await fs.rm(zipPath, { force: true });
  await execFileAsync('zip', ['-X', '-q', '-D', zipPath, ...entries], { cwd: outDir });
  const zipBytes = await fs.readFile(zipPath);
  return { outDir, zipPath, zipSha256: sha256Hex(zipBytes), fileCount: entries.length };
}
