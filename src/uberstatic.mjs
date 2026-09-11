import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const UBERSTATIC_SCHEMA = 'uberbond.uberstatic.deployment.v1';
export const UBERSTATIC_POINTER_SCHEMA = 'uberbond.uberstatic.pointer.v1';
export const UBERSTATIC_POLICY = 'uberstatic-1.0.0';

const SHA40 = /^[0-9a-f]{40}$/;
const LABEL = /^[a-z0-9][a-z0-9._-]{1,24}$/;
const MAX_FILES = 4096;
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_BYTES = 64 * 1024 * 1024;

const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const canonical = value => JSON.stringify(value);

function exactObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export function normalizeStaticPath(input) {
  const raw = String(input ?? '').replaceAll('\\', '/').trim();
  if (!raw || raw.startsWith('/') || raw.includes('\0')) throw new Error('uberstatic-relative-path-required');
  const normalized = path.posix.normalize(raw);
  if (normalized === '.' || normalized === '..' || normalized.startsWith('../') || normalized.includes('/../')) {
    throw new Error('uberstatic-path-traversal-refused');
  }
  if (normalized.split('/').some(part => !part || part === '.' || part === '..')) {
    throw new Error('uberstatic-path-segment-refused');
  }
  return normalized;
}

function normalizeLabels(labels = []) {
  if (!Array.isArray(labels) || labels.length > 32) throw new Error('uberstatic-label-list-invalid');
  const out = [...new Set(labels.map(item => String(item).trim().toLowerCase()))];
  if (out.some(item => !LABEL.test(item))) throw new Error('uberstatic-label-invalid');
  return out.sort();
}

function normalizeSourceCommit(sourceCommit) {
  if (sourceCommit == null || sourceCommit === '') return null;
  const value = String(sourceCommit).trim().toLowerCase();
  if (!SHA40.test(value)) throw new Error('uberstatic-source-commit-invalid');
  return value;
}

function toBuffer(file) {
  if (Buffer.isBuffer(file?.content)) return Buffer.from(file.content);
  if (typeof file?.content !== 'string') throw new Error('uberstatic-file-content-required');
  if (file.encoding === 'base64') return Buffer.from(file.content, 'base64');
  if (file.encoding && file.encoding !== 'utf-8') throw new Error('uberstatic-file-encoding-invalid');
  return Buffer.from(file.content, 'utf8');
}

export function compileUberStaticDeployment({ files, labels = [], sourceCommit = null } = {}) {
  if (!Array.isArray(files) || files.length < 1 || files.length > MAX_FILES) throw new Error('uberstatic-file-count-invalid');
  const seen = new Set();
  let totalBytes = 0;
  const normalizedFiles = files.map(file => {
    const filePath = normalizeStaticPath(file?.path);
    if (seen.has(filePath)) throw new Error('uberstatic-duplicate-path-refused');
    seen.add(filePath);
    const bytes = toBuffer(file);
    if (bytes.byteLength > MAX_FILE_BYTES) throw new Error('uberstatic-file-too-large');
    totalBytes += bytes.byteLength;
    if (totalBytes > MAX_TOTAL_BYTES) throw new Error('uberstatic-total-too-large');
    return {
      path: filePath,
      bytes,
      size: bytes.byteLength,
      digest: `sha256:${sha256(bytes)}`
    };
  }).sort((a, b) => a.path.localeCompare(b.path));

  const manifestBody = {
    schemaVersion: UBERSTATIC_SCHEMA,
    policyVersion: UBERSTATIC_POLICY,
    sourceCommit: normalizeSourceCommit(sourceCommit),
    labels: normalizeLabels(labels),
    fileCount: normalizedFiles.length,
    totalBytes,
    files: normalizedFiles.map(({ path: filePath, size, digest }) => ({ path: filePath, size, digest }))
  };
  const deploymentDigest = sha256(canonical(manifestBody));
  const manifest = {
    ...manifestBody,
    deploymentId: `uberstatic_${deploymentDigest.slice(0, 32)}`,
    deploymentDigest: `sha256:${deploymentDigest}`,
    businessEffectAuthority: 'NONE'
  };
  return { manifest, files: normalizedFiles };
}

function deploymentDir(rootDir, deploymentId) {
  const id = String(deploymentId || '').trim();
  if (!/^uberstatic_[0-9a-f]{32}$/.test(id)) throw new Error('uberstatic-deployment-id-invalid');
  return path.join(path.resolve(rootDir), 'deployments', id);
}

function safeJsonRead(file) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 2_000_000) throw new Error('uberstatic-unsafe-json-file');
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function atomicJsonWrite(file, value, mode = 0o600) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp.${process.pid}.${crypto.randomBytes(6).toString('hex')}`;
  fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { mode });
  fs.renameSync(temp, file);
}

function verifyManifestShape(manifest) {
  if (!exactObject(manifest) || manifest.schemaVersion !== UBERSTATIC_SCHEMA || manifest.policyVersion !== UBERSTATIC_POLICY) return false;
  if (!/^uberstatic_[0-9a-f]{32}$/.test(String(manifest.deploymentId || ''))) return false;
  if (!/^sha256:[0-9a-f]{64}$/.test(String(manifest.deploymentDigest || ''))) return false;
  if (!Array.isArray(manifest.files) || manifest.files.length !== manifest.fileCount || manifest.files.length < 1) return false;
  if (!Array.isArray(manifest.labels) || !Number.isSafeInteger(manifest.totalBytes) || manifest.totalBytes < 0) return false;
  if (manifest.sourceCommit !== null && !SHA40.test(String(manifest.sourceCommit || ''))) return false;
  if (manifest.businessEffectAuthority !== 'NONE') return false;
  let total = 0;
  const seen = new Set();
  for (const file of manifest.files) {
    if (!exactObject(file)) return false;
    let filePath;
    try { filePath = normalizeStaticPath(file.path); } catch { return false; }
    if (filePath !== file.path || seen.has(filePath)) return false;
    seen.add(filePath);
    if (!Number.isSafeInteger(file.size) || file.size < 0 || file.size > MAX_FILE_BYTES) return false;
    if (!/^sha256:[0-9a-f]{64}$/.test(String(file.digest || ''))) return false;
    total += file.size;
  }
  if (total !== manifest.totalBytes || total > MAX_TOTAL_BYTES) return false;
  const body = {
    schemaVersion: manifest.schemaVersion,
    policyVersion: manifest.policyVersion,
    sourceCommit: manifest.sourceCommit,
    labels: manifest.labels,
    fileCount: manifest.fileCount,
    totalBytes: manifest.totalBytes,
    files: manifest.files
  };
  const digest = sha256(canonical(body));
  return manifest.deploymentDigest === `sha256:${digest}` && manifest.deploymentId === `uberstatic_${digest.slice(0, 32)}`;
}

export function verifyUberStaticDeployment({ rootDir, deploymentId } = {}) {
  try {
    const dir = deploymentDir(rootDir, deploymentId);
    const manifest = safeJsonRead(path.join(dir, 'manifest.json'));
    if (!verifyManifestShape(manifest)) return { ok: false, status: 'UBERSTATIC_DEPLOYMENT_REFUSED', reasonCodes: ['manifest-integrity-failed'] };
    for (const entry of manifest.files) {
      const file = path.join(dir, 'payload', ...entry.path.split('/'));
      const stat = fs.lstatSync(file);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== entry.size) {
        return { ok: false, status: 'UBERSTATIC_DEPLOYMENT_REFUSED', reasonCodes: [`payload-shape:${entry.path}`] };
      }
      const digest = `sha256:${sha256(fs.readFileSync(file))}`;
      if (digest !== entry.digest) return { ok: false, status: 'UBERSTATIC_DEPLOYMENT_REFUSED', reasonCodes: [`payload-digest:${entry.path}`] };
    }
    return { ok: true, status: 'UBERSTATIC_DEPLOYMENT_VERIFIED', deploymentId: manifest.deploymentId, manifest, businessEffectAuthority: 'NONE' };
  } catch (error) {
    return { ok: false, status: 'UBERSTATIC_DEPLOYMENT_REFUSED', reasonCodes: [error?.message || 'unknown-error'] };
  }
}

export function writeUberStaticDeployment({ rootDir, deployment } = {}) {
  if (!deployment?.manifest || !Array.isArray(deployment?.files) || !verifyManifestShape(deployment.manifest)) throw new Error('uberstatic-compiled-deployment-required');
  const root = path.resolve(rootDir);
  const target = deploymentDir(root, deployment.manifest.deploymentId);
  if (fs.existsSync(target)) {
    const verified = verifyUberStaticDeployment({ rootDir: root, deploymentId: deployment.manifest.deploymentId });
    if (!verified.ok) throw new Error('uberstatic-existing-deployment-corrupt');
    return { ...verified, status: 'UBERSTATIC_DEPLOYMENT_ALREADY_PRESENT' };
  }
  const parent = path.dirname(target);
  fs.mkdirSync(parent, { recursive: true });
  const temp = `${target}.tmp.${process.pid}.${crypto.randomBytes(6).toString('hex')}`;
  fs.mkdirSync(path.join(temp, 'payload'), { recursive: true, mode: 0o700 });
  try {
    for (const entry of deployment.files) {
      const file = path.join(temp, 'payload', ...entry.path.split('/'));
      fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
      fs.writeFileSync(file, entry.bytes, { mode: 0o600 });
    }
    atomicJsonWrite(path.join(temp, 'manifest.json'), deployment.manifest, 0o600);
    fs.renameSync(temp, target);
  } catch (error) {
    fs.rmSync(temp, { recursive: true, force: true });
    throw error;
  }
  const verified = verifyUberStaticDeployment({ rootDir: root, deploymentId: deployment.manifest.deploymentId });
  if (!verified.ok) throw new Error(`uberstatic-postwrite-verification-failed:${verified.reasonCodes.join(',')}`);
  return { ...verified, status: 'UBERSTATIC_DEPLOYMENT_WRITTEN' };
}

function accessPolicy(password) {
  if (password == null || password === '') return { protected: false, salt: null, passwordDigest: null };
  const raw = String(password);
  if (raw.length < 6 || raw.length > 128) throw new Error('uberstatic-password-length-invalid');
  const salt = crypto.randomBytes(16).toString('hex');
  const passwordDigest = crypto.scryptSync(raw, salt, 32).toString('hex');
  return { protected: true, salt, passwordDigest };
}

export function verifyUberStaticPassword(pointer, candidate) {
  const policy = pointer?.accessPolicy;
  if (!policy?.protected) return true;
  if (typeof candidate !== 'string') return false;
  const expected = Buffer.from(String(policy.passwordDigest || ''), 'hex');
  if (expected.length !== 32 || !/^[0-9a-f]{32}$/.test(String(policy.salt || ''))) return false;
  const actual = crypto.scryptSync(candidate, policy.salt, 32);
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

export function readUberStaticPointer({ rootDir } = {}) {
  const file = path.join(path.resolve(rootDir), 'state', 'current.json');
  if (!fs.existsSync(file)) return null;
  const pointer = safeJsonRead(file);
  if (!exactObject(pointer) || pointer.schemaVersion !== UBERSTATIC_POINTER_SCHEMA || !/^uberstatic_[0-9a-f]{32}$/.test(String(pointer.deploymentId || ''))) {
    throw new Error('uberstatic-pointer-invalid');
  }
  return pointer;
}

export function activateUberStaticDeployment({ rootDir, deploymentId, password = null, activatedAt = new Date() } = {}) {
  const root = path.resolve(rootDir);
  const verified = verifyUberStaticDeployment({ rootDir: root, deploymentId });
  if (!verified.ok) throw new Error(`uberstatic-activation-target-invalid:${verified.reasonCodes.join(',')}`);
  const previous = readUberStaticPointer({ rootDir: root });
  const at = (activatedAt instanceof Date ? activatedAt : new Date(activatedAt)).toISOString();
  const body = {
    schemaVersion: UBERSTATIC_POINTER_SCHEMA,
    deploymentId,
    previousDeploymentId: previous?.deploymentId || null,
    activatedAt: at,
    accessPolicy: accessPolicy(password),
    sourceCommit: verified.manifest.sourceCommit,
    deploymentDigest: verified.manifest.deploymentDigest,
    businessEffectAuthority: 'STATIC_CONTENT_ONLY'
  };
  const activationDigest = sha256(canonical(body));
  const pointer = { ...body, activationId: `uberstatic_activation_${activationDigest.slice(0, 32)}`, activationDigest: `sha256:${activationDigest}` };
  const historyFile = path.join(root, 'activations', `${pointer.activationId}.json`);
  if (fs.existsSync(historyFile)) {
    const existing = safeJsonRead(historyFile);
    if (canonical(existing) !== canonical(pointer)) throw new Error('uberstatic-activation-history-conflict');
  } else {
    atomicJsonWrite(historyFile, pointer, 0o600);
  }
  atomicJsonWrite(path.join(root, 'state', 'current.json'), pointer, 0o600);
  return { ok: true, status: 'UBERSTATIC_DEPLOYMENT_ACTIVATED', pointer };
}

export function rollbackUberStaticDeployment({ rootDir, activatedAt = new Date() } = {}) {
  const current = readUberStaticPointer({ rootDir });
  if (!current?.previousDeploymentId) throw new Error('uberstatic-no-rollback-target');
  return activateUberStaticDeployment({ rootDir, deploymentId: current.previousDeploymentId, activatedAt });
}

export function listUberStaticDeployments({ rootDir } = {}) {
  const dir = path.join(path.resolve(rootDir), 'deployments');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && /^uberstatic_[0-9a-f]{32}$/.test(entry.name))
    .map(entry => verifyUberStaticDeployment({ rootDir, deploymentId: entry.name }))
    .filter(result => result.ok)
    .map(result => result.manifest)
    .sort((a, b) => a.deploymentId.localeCompare(b.deploymentId));
}

export function deleteUberStaticDeployment({ rootDir, deploymentId, confirmDeploymentId } = {}) {
  if (String(confirmDeploymentId || '') !== String(deploymentId || '')) throw new Error('uberstatic-delete-confirmation-required');
  const current = readUberStaticPointer({ rootDir });
  if (current?.deploymentId === deploymentId) throw new Error('uberstatic-active-deployment-delete-refused');
  const dir = deploymentDir(rootDir, deploymentId);
  const verified = verifyUberStaticDeployment({ rootDir, deploymentId });
  if (!verified.ok) throw new Error('uberstatic-delete-target-invalid');
  fs.rmSync(dir, { recursive: true, force: false });
  return { ok: true, status: 'UBERSTATIC_DEPLOYMENT_DELETED', deploymentId };
}

export function readUberStaticAsset({ rootDir, deploymentId, assetPath } = {}) {
  const verified = verifyUberStaticDeployment({ rootDir, deploymentId });
  if (!verified.ok) throw new Error('uberstatic-asset-deployment-invalid');
  const normalized = normalizeStaticPath(assetPath);
  const entry = verified.manifest.files.find(file => file.path === normalized);
  if (!entry) return null;
  return {
    entry,
    bytes: fs.readFileSync(path.join(deploymentDir(rootDir, deploymentId), 'payload', ...normalized.split('/')))
  };
}
