import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

export const SELF_MAINTAINER_SOURCE_CONTEXT_VERSION = 'self-maintainer-source-context-1.1.0';

const execFileAsync = promisify(execFile);
const EXACT_SHA = /^[a-f0-9]{40}$/i;
const MAX_INVENTORY_PATHS = 5000;
const MAX_INVENTORY_BYTES = 160_000;
const MAX_SELECTED_FILES = 12;
const MAX_FILE_BYTES = 48_000;
const MAX_TOTAL_CONTEXT_BYTES = 180_000;
const SKIP_PREFIXES = Object.freeze(['.git/', 'node_modules/', '.cache/']);
const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.pdf', '.zip', '.gz', '.tgz', '.tar',
  '.woff', '.woff2', '.ttf', '.otf', '.mp3', '.mp4', '.mov', '.avi', '.wasm', '.sqlite', '.db'
]);

function text(value, max = 1000) {
  return String(value ?? '').trim().slice(0, max);
}

function digest(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function failure(reasonCodes, status = 'SOURCE_CONTEXT_BLOCKED', extra = {}) {
  return {
    ok: false,
    policyVersion: SELF_MAINTAINER_SOURCE_CONTEXT_VERSION,
    status,
    reasonCodes: [...new Set((reasonCodes || []).filter(Boolean))],
    ...extra
  };
}

export function normalizeSourcePath(value) {
  const raw = text(value, 1000);
  if (!raw || path.isAbsolute(raw) || /^[A-Za-z]:[\\/]/.test(raw)) return null;
  const normalized = path.posix.normalize(raw.replaceAll('\\', '/'));
  if (!normalized || normalized === '.' || normalized === '..' || normalized.startsWith('../') || normalized.includes('/../') || normalized.startsWith('/')) return null;
  if (SKIP_PREFIXES.some(prefix => normalized.toLowerCase().startsWith(prefix))) return null;
  if (BINARY_EXTENSIONS.has(path.posix.extname(normalized).toLowerCase())) return null;
  return normalized;
}

async function defaultRunGit(repoRoot, args) {
  const out = await execFileAsync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 2_000_000,
    env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' }
  });
  return String(out.stdout || '');
}

async function exactCheckout({ repoRoot, expectedSha, runGit }) {
  const sha = text(expectedSha, 80).toLowerCase();
  if (!EXACT_SHA.test(sha)) return failure(['exact-source-sha-required']);
  let observed;
  try { observed = text(await runGit(repoRoot, ['rev-parse', 'HEAD']), 80).toLowerCase(); }
  catch { return failure(['git-head-read-failed']); }
  if (observed !== sha) return failure(['local-checkout-sha-mismatch'], 'SOURCE_CONTEXT_BLOCKED', { expectedSha: sha, observedSha: observed || null });
  return { ok: true, sha };
}

export async function buildLocalSourceInventory({
  repoRoot = process.cwd(),
  expectedSha,
  runGit = defaultRunGit
} = {}) {
  if (typeof runGit !== 'function') return failure(['git-runner-required']);
  const exact = await exactCheckout({ repoRoot, expectedSha, runGit });
  if (!exact.ok) return exact;
  let raw;
  try { raw = await runGit(repoRoot, ['ls-files', '-z']); }
  catch { return failure(['git-ls-files-failed']); }
  const paths = [...new Set(String(raw || '').split('\0').map(normalizeSourcePath).filter(Boolean))].sort();
  if (!paths.length) return failure(['source-inventory-empty']);
  if (paths.length > MAX_INVENTORY_PATHS) return failure(['source-inventory-path-limit']);
  const serialized = JSON.stringify(paths);
  if (Buffer.byteLength(serialized, 'utf8') > MAX_INVENTORY_BYTES) return failure(['source-inventory-byte-limit']);
  return {
    ok: true,
    policyVersion: SELF_MAINTAINER_SOURCE_CONTEXT_VERSION,
    status: 'SOURCE_INVENTORY_READY',
    sourceSha: exact.sha,
    paths,
    pathCount: paths.length,
    inventoryDigest: digest(serialized),
    byteLength: Buffer.byteLength(serialized, 'utf8')
  };
}

export function validateSourceInventoryEnvelope(inventory, expectedSha) {
  const sha = text(expectedSha, 80).toLowerCase();
  const reasons = [];
  if (!inventory || typeof inventory !== 'object' || Array.isArray(inventory)) return failure(['source-inventory-object-required'], 'SOURCE_INVENTORY_REJECTED');
  if (inventory.ok !== true || inventory.status !== 'SOURCE_INVENTORY_READY') reasons.push('source-inventory-ready-envelope-required');
  if (!EXACT_SHA.test(sha) || text(inventory.sourceSha, 80).toLowerCase() !== sha) reasons.push('source-inventory-sha-mismatch');
  if (!Array.isArray(inventory.paths) || inventory.paths.length < 1 || inventory.paths.length > MAX_INVENTORY_PATHS) reasons.push('source-inventory-path-count-invalid');

  const normalized = [];
  for (const [index, raw] of (Array.isArray(inventory.paths) ? inventory.paths : []).entries()) {
    const sourcePath = normalizeSourcePath(raw);
    if (!sourcePath) {
      reasons.push(`source-inventory-path-${index}-invalid`);
      continue;
    }
    if (sourcePath !== raw) reasons.push(`source-inventory-path-${index}-not-canonical`);
    if (normalized.includes(sourcePath)) reasons.push(`source-inventory-path-${index}-duplicate`);
    normalized.push(sourcePath);
  }
  const sorted = [...normalized].sort();
  if (normalized.length && JSON.stringify(normalized) !== JSON.stringify(sorted)) reasons.push('source-inventory-path-order-invalid');
  const serialized = JSON.stringify(normalized);
  const byteLength = Buffer.byteLength(serialized, 'utf8');
  if (byteLength > MAX_INVENTORY_BYTES) reasons.push('source-inventory-byte-limit');
  const expectedDigest = digest(serialized);
  if (!/^[a-f0-9]{64}$/i.test(String(inventory.inventoryDigest || '')) || String(inventory.inventoryDigest).toLowerCase() !== expectedDigest) reasons.push('source-inventory-digest-mismatch');
  if (Number(inventory.pathCount) !== normalized.length) reasons.push('source-inventory-path-count-mismatch');
  if (Number(inventory.byteLength) !== byteLength) reasons.push('source-inventory-byte-length-mismatch');
  if (reasons.length) return failure(reasons, 'SOURCE_INVENTORY_REJECTED');
  return {
    ok: true,
    policyVersion: SELF_MAINTAINER_SOURCE_CONTEXT_VERSION,
    status: 'SOURCE_INVENTORY_VALID',
    sourceSha: sha,
    paths: normalized,
    pathCount: normalized.length,
    inventoryDigest: expectedDigest,
    byteLength
  };
}

export function validateContextSelection({ inventory, selectedPaths } = {}) {
  if (!inventory?.ok || inventory.status !== 'SOURCE_INVENTORY_READY' || !Array.isArray(inventory.paths)) return failure(['valid-source-inventory-required']);
  if (!Array.isArray(selectedPaths) || selectedPaths.length < 1 || selectedPaths.length > MAX_SELECTED_FILES) return failure(['selected-source-path-count-invalid']);
  const allowed = new Set(inventory.paths);
  const normalized = [];
  for (const [index, raw] of selectedPaths.entries()) {
    const candidate = normalizeSourcePath(raw);
    if (!candidate) return failure([`selected-source-path-${index}-invalid`]);
    if (!allowed.has(candidate)) return failure([`selected-source-path-${index}-not-in-exact-inventory`]);
    if (!normalized.includes(candidate)) normalized.push(candidate);
  }
  if (!normalized.length || normalized.length > MAX_SELECTED_FILES) return failure(['selected-source-path-count-invalid']);
  return {
    ok: true,
    policyVersion: SELF_MAINTAINER_SOURCE_CONTEXT_VERSION,
    status: 'SOURCE_SELECTION_VALID',
    sourceSha: inventory.sourceSha,
    paths: normalized,
    inventoryDigest: inventory.inventoryDigest
  };
}

export async function buildLocalSourceContext({
  repoRoot = process.cwd(),
  expectedSha,
  inventory,
  selectedPaths,
  runGit = defaultRunGit,
  readFile = fs.readFile
} = {}) {
  if (typeof readFile !== 'function') return failure(['source-reader-required']);
  const exact = await exactCheckout({ repoRoot, expectedSha, runGit });
  if (!exact.ok) return exact;
  if (inventory?.sourceSha !== exact.sha) return failure(['inventory-source-sha-mismatch']);
  const selection = validateContextSelection({ inventory, selectedPaths });
  if (!selection.ok) return selection;

  const files = [];
  let totalBytes = 0;
  for (const sourcePath of selection.paths) {
    const absolute = path.resolve(repoRoot, sourcePath);
    const relative = path.relative(path.resolve(repoRoot), absolute);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return failure(['source-context-path-escaped-root']);
    let buffer;
    try { buffer = await readFile(absolute); }
    catch { return failure([`source-context-read-failed:${sourcePath}`]); }
    if (!Buffer.isBuffer(buffer)) buffer = Buffer.from(buffer);
    if (buffer.length > MAX_FILE_BYTES) return failure([`source-context-file-too-large:${sourcePath}`]);
    if (buffer.includes(0)) return failure([`source-context-binary-rejected:${sourcePath}`]);
    totalBytes += buffer.length;
    if (totalBytes > MAX_TOTAL_CONTEXT_BYTES) return failure(['source-context-total-byte-limit']);
    const content = buffer.toString('utf8');
    files.push(Object.freeze({
      path: sourcePath,
      sha256: digest(buffer),
      byteLength: buffer.length,
      content
    }));
  }

  const identity = {
    sourceSha: exact.sha,
    inventoryDigest: selection.inventoryDigest,
    files: files.map(file => ({ path: file.path, sha256: file.sha256, byteLength: file.byteLength }))
  };
  return {
    ok: true,
    policyVersion: SELF_MAINTAINER_SOURCE_CONTEXT_VERSION,
    status: 'EXACT_SOURCE_CONTEXT_READY',
    sourceSha: exact.sha,
    inventoryDigest: selection.inventoryDigest,
    sourceContextDigest: digest(JSON.stringify(identity)),
    files,
    totals: { files: files.length, contentBytes: totalBytes },
    businessEffectAuthority: 'NONE'
  };
}

export function validateSourceContextEnvelope(sourceContext, expectedSha) {
  const sha = text(expectedSha, 80).toLowerCase();
  const reasons = [];
  if (!sourceContext || typeof sourceContext !== 'object' || Array.isArray(sourceContext)) return failure(['source-context-object-required']);
  if (sourceContext.ok !== true || sourceContext.status !== 'EXACT_SOURCE_CONTEXT_READY') reasons.push('exact-source-context-required');
  if (!EXACT_SHA.test(sha) || text(sourceContext.sourceSha, 80).toLowerCase() !== sha) reasons.push('source-context-sha-mismatch');
  if (!Array.isArray(sourceContext.files) || sourceContext.files.length < 1 || sourceContext.files.length > MAX_SELECTED_FILES) reasons.push('source-context-file-count-invalid');
  let totalBytes = 0;
  const seen = new Set();
  for (const [index, file] of (Array.isArray(sourceContext.files) ? sourceContext.files : []).entries()) {
    const sourcePath = normalizeSourcePath(file?.path);
    if (!sourcePath) reasons.push(`source-context-file-${index}-path-invalid`);
    if (sourcePath && seen.has(sourcePath)) reasons.push(`source-context-file-${index}-duplicate-path`);
    if (sourcePath) seen.add(sourcePath);
    const content = typeof file?.content === 'string' ? file.content : null;
    if (content == null) reasons.push(`source-context-file-${index}-content-required`);
    const size = content == null ? 0 : Buffer.byteLength(content, 'utf8');
    if (size > MAX_FILE_BYTES) reasons.push(`source-context-file-${index}-too-large`);
    totalBytes += size;
    if (!/^[a-f0-9]{64}$/i.test(String(file?.sha256 || '')) || (content != null && digest(Buffer.from(content, 'utf8')) !== String(file.sha256).toLowerCase())) {
      reasons.push(`source-context-file-${index}-digest-mismatch`);
    }
  }
  if (totalBytes > MAX_TOTAL_CONTEXT_BYTES) reasons.push('source-context-total-byte-limit');
  if (reasons.length) return failure(reasons, 'SOURCE_CONTEXT_REJECTED');
  return {
    ok: true,
    policyVersion: SELF_MAINTAINER_SOURCE_CONTEXT_VERSION,
    status: 'SOURCE_CONTEXT_VALID',
    sourceSha: sha,
    files: sourceContext.files.map(file => ({ path: normalizeSourcePath(file.path), sha256: String(file.sha256).toLowerCase(), byteLength: Buffer.byteLength(file.content, 'utf8'), content: file.content })),
    totals: { files: sourceContext.files.length, contentBytes: totalBytes },
    sourceContextDigest: text(sourceContext.sourceContextDigest, 128) || null,
    inventoryDigest: text(sourceContext.inventoryDigest, 128) || null
  };
}
