import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  founderAuthorized,
  privateDestinationAllowed,
  deletePrivateRecords,
  exportPrivateState,
  derivedClosure
} from './personal-civilization-core.mjs';
import { captureWillEvent, promoteCapture } from './personal-civilization-capture.mjs';
import { registerHypothesis } from './personal-civilization-model-graph.mjs';
import { composeDecisionPacket } from './personal-civilization-decision-loop.mjs';
import { encryptJson, decryptJson } from './crypto.mjs';

export const PERSONAL_CIVILIZATION_PRIVATE_OPERATOR_VERSION = 'uberbond.personal-civilization-private-operator.v1.1';
export const PRIVATE_STATE_SCHEMA = 'uberbond.personal-civilization-private-state.v1';
export const PRIVATE_ENVELOPE_SCHEMA = 'uberbond.personal-civilization-private-envelope.v1';
export const PRIVATE_EXPORT_SCHEMA = 'uberbond.personal-civilization-private-export.v1';
export const PRIVATE_LIFE_KEY_ENV = 'UBERBOND_PRIVATE_LIFE_KEY';

const PRIVATE_STATE_PURPOSE = 'PRIVATE_LIFE_STATE';
const PRIVATE_EXPORT_PURPOSE = 'PRIVATE_LIFE_EXPORT';
const DEFAULT_FILE = path.join(os.homedir(), '.uberbond-private', 'life-state.json');
const MODULE_REPO_ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

const fail = (status, reasonCodes, extra = {}) => ({
  ok: false,
  status,
  reasonCodes: [...new Set((reasonCodes || []).filter(Boolean))],
  businessEffectAuthority: 'NONE',
  ...extra
});

const iso = value => {
  const date = value instanceof Date ? value : new Date(String(value ?? ''));
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
};

function inside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function keyReady(privateKey) {
  return /^[a-f0-9]{64}$/i.test(String(privateKey || ''));
}

function requirePrivateKey(privateKey) {
  if (keyReady(privateKey)) return { ok: true };
  return fail('PRIVATE_STATE_KEY_REQUIRED', ['private-life-key-must-be-64-hex-characters']);
}

function seal(value, privateKey, purpose) {
  const key = requirePrivateKey(privateKey);
  if (!key.ok) return key;
  let encrypted;
  try {
    encrypted = encryptJson({ purpose, value }, privateKey);
  } catch {
    return fail('PRIVATE_STATE_ENCRYPTION_REFUSED', ['private-state-encryption-failed']);
  }
  return {
    ok: true,
    envelope: {
      schemaVersion: PRIVATE_ENVELOPE_SCHEMA,
      cipher: 'AES-256-GCM',
      iv: encrypted.iv,
      tag: encrypted.tag,
      data: encrypted.data
    }
  };
}

function openEnvelope(envelope, privateKey, expectedPurpose) {
  const key = requirePrivateKey(privateKey);
  if (!key.ok) return key;
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) {
    return fail('PRIVATE_STATE_READ_REFUSED', ['private-state-encrypted-envelope-required']);
  }
  if (envelope.schemaVersion !== PRIVATE_ENVELOPE_SCHEMA || envelope.cipher !== 'AES-256-GCM') {
    return fail('PRIVATE_STATE_READ_REFUSED', ['private-state-encrypted-envelope-required']);
  }
  if (![envelope.iv, envelope.tag, envelope.data].every(value => typeof value === 'string' && value.length > 0)) {
    return fail('PRIVATE_STATE_READ_REFUSED', ['private-state-encrypted-envelope-incomplete']);
  }
  let opened;
  try {
    opened = decryptJson({ iv: envelope.iv, tag: envelope.tag, data: envelope.data }, privateKey);
  } catch {
    return fail('PRIVATE_STATE_READ_REFUSED', ['private-state-authentication-failed']);
  }
  if (!opened || opened.purpose !== expectedPurpose || !Object.hasOwn(opened, 'value')) {
    return fail('PRIVATE_STATE_READ_REFUSED', ['private-state-envelope-purpose-mismatch']);
  }
  return { ok: true, value: opened.value };
}

export function defaultPrivateState() {
  return {
    schemaVersion: PRIVATE_STATE_SCHEMA,
    records: [],
    hypotheses: [],
    edges: [],
    updatedAt: null
  };
}

/**
 * Private founder state may live only at an absolute local filesystem path
 * outside the repository. Network URLs, repository paths and direct symlink
 * targets are refused before any content is read or written.
 */
export function validatePrivateStatePath(filePath = DEFAULT_FILE, { repoRoot = MODULE_REPO_ROOT } = {}) {
  const raw = String(filePath || '').trim();
  if (!raw) return fail('PRIVATE_STATE_PATH_REFUSED', ['private-state-path-required']);
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) || raw.startsWith('//') || raw.startsWith('\\\\')) {
    return fail('PRIVATE_STATE_PATH_REFUSED', ['private-state-must-be-local-filesystem-only']);
  }
  if (!path.isAbsolute(raw)) return fail('PRIVATE_STATE_PATH_REFUSED', ['private-state-path-must-be-absolute']);

  const resolved = path.resolve(raw);
  const root = path.resolve(repoRoot);
  if (inside(root, resolved)) return fail('PRIVATE_STATE_PATH_REFUSED', ['private-state-may-not-enter-repository']);

  const coreCheck = privateDestinationAllowed(resolved);
  if (!coreCheck.allowed) return fail('PRIVATE_STATE_PATH_REFUSED', coreCheck.reasonCodes);

  try {
    if (fs.existsSync(resolved) && fs.lstatSync(resolved).isSymbolicLink()) {
      return fail('PRIVATE_STATE_PATH_REFUSED', ['private-state-file-symlink-refused']);
    }
  } catch {
    return fail('PRIVATE_STATE_PATH_REFUSED', ['private-state-path-inspection-failed']);
  }

  return { ok: true, status: 'PRIVATE_STATE_PATH_ALLOWED', filePath: resolved, businessEffectAuthority: 'NONE' };
}

/**
 * Resolve an existing private file before reading it. This closes the parent-
 * directory symlink gap: an apparent outside path can otherwise resolve back
 * into the repository. Reads use the resolved target and refuse Git ancestry.
 */
function resolveExistingPrivateReadTarget(filePath, { repoRoot = MODULE_REPO_ROOT } = {}) {
  const checked = validatePrivateStatePath(filePath, { repoRoot });
  if (!checked.ok) return checked;
  if (!fs.existsSync(checked.filePath)) {
    return {
      ok: true,
      status: 'PRIVATE_STATE_TARGET_ABSENT',
      exists: false,
      filePath: checked.filePath,
      readPath: null,
      businessEffectAuthority: 'NONE'
    };
  }

  let realFile;
  let realRoot;
  try {
    realFile = fs.realpathSync(checked.filePath);
    realRoot = fs.existsSync(repoRoot) ? fs.realpathSync(repoRoot) : path.resolve(repoRoot);
  } catch {
    return fail('PRIVATE_STATE_READ_REFUSED', ['private-state-realpath-failed']);
  }
  if (inside(realRoot, realFile)) {
    return fail('PRIVATE_STATE_PATH_REFUSED', ['private-state-resolved-into-repository']);
  }

  return {
    ok: true,
    status: 'PRIVATE_STATE_READ_TARGET_RESOLVED',
    exists: true,
    filePath: checked.filePath,
    readPath: realFile,
    businessEffectAuthority: 'NONE'
  };
}

function validateStateShape(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail('PRIVATE_STATE_INVALID', ['private-state-object-required']);
  if (value.schemaVersion !== PRIVATE_STATE_SCHEMA) return fail('PRIVATE_STATE_INVALID', ['private-state-schema-mismatch']);
  for (const key of ['records', 'hypotheses', 'edges']) {
    if (!Array.isArray(value[key])) return fail('PRIVATE_STATE_INVALID', [`private-state-${key}-array-required`]);
  }
  return {
    ok: true,
    status: 'PRIVATE_STATE_VALID',
    state: {
      schemaVersion: PRIVATE_STATE_SCHEMA,
      records: value.records,
      hypotheses: value.hypotheses,
      edges: value.edges,
      updatedAt: iso(value.updatedAt) || null
    },
    businessEffectAuthority: 'NONE'
  };
}

export function loadPrivateState({
  filePath = DEFAULT_FILE,
  authorization = null,
  privateKey = null,
  repoRoot = MODULE_REPO_ROOT
} = {}) {
  if (!founderAuthorized(authorization)) return fail('PRIVATE_STATE_FOUNDER_AUTHORITY_REQUIRED', ['founder-authorization-required']);
  const key = requirePrivateKey(privateKey);
  if (!key.ok) return key;
  const target = resolveExistingPrivateReadTarget(filePath, { repoRoot });
  if (!target.ok) return target;
  if (!target.exists) {
    return { ok: true, status: 'PRIVATE_STATE_EMPTY', filePath: target.filePath, state: defaultPrivateState(), businessEffectAuthority: 'NONE' };
  }

  let stat;
  try { stat = fs.statSync(target.readPath); }
  catch { return fail('PRIVATE_STATE_READ_REFUSED', ['private-state-stat-failed']); }
  if (!stat.isFile()) return fail('PRIVATE_STATE_READ_REFUSED', ['private-state-path-is-not-file']);
  if (process.platform !== 'win32' && (stat.mode & 0o077) !== 0) {
    return fail('PRIVATE_STATE_READ_REFUSED', ['private-state-file-permissions-too-open']);
  }

  let envelope;
  try { envelope = JSON.parse(fs.readFileSync(target.readPath, 'utf8')); }
  catch { return fail('PRIVATE_STATE_READ_REFUSED', ['private-state-json-invalid']); }
  const opened = openEnvelope(envelope, privateKey, PRIVATE_STATE_PURPOSE);
  if (!opened.ok) return opened;
  const shaped = validateStateShape(opened.value);
  if (!shaped.ok) return shaped;
  return { ok: true, status: 'PRIVATE_STATE_LOADED', filePath: target.filePath, state: shaped.state, businessEffectAuthority: 'NONE' };
}

function atomicPrivateWrite(filePath, payload, { repoRoot = MODULE_REPO_ROOT } = {}) {
  const checked = validatePrivateStatePath(filePath, { repoRoot });
  if (!checked.ok) return checked;
  const dir = path.dirname(checked.filePath);
  let temp = null;
  try {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    if (process.platform !== 'win32') fs.chmodSync(dir, 0o700);
    const realDir = fs.realpathSync(dir);
    const root = fs.existsSync(repoRoot) ? fs.realpathSync(repoRoot) : path.resolve(repoRoot);
    if (inside(root, path.join(realDir, path.basename(checked.filePath)))) {
      return fail('PRIVATE_STATE_PATH_REFUSED', ['private-state-resolved-into-repository']);
    }
    if (fs.existsSync(checked.filePath) && fs.lstatSync(checked.filePath).isSymbolicLink()) {
      return fail('PRIVATE_STATE_PATH_REFUSED', ['private-state-file-symlink-refused']);
    }
    temp = path.join(realDir, `.${path.basename(checked.filePath)}.${process.pid}.${Date.now()}.tmp`);
    fs.writeFileSync(temp, payload, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    if (process.platform !== 'win32') fs.chmodSync(temp, 0o600);
    fs.renameSync(temp, checked.filePath);
    temp = null;
    if (process.platform !== 'win32') fs.chmodSync(checked.filePath, 0o600);
  } catch {
    if (temp) {
      try { fs.rmSync(temp, { force: true }); } catch {}
    }
    return fail('PRIVATE_STATE_WRITE_REFUSED', ['private-state-atomic-write-failed']);
  }
  return { ok: true, status: 'PRIVATE_STATE_WRITTEN', filePath: checked.filePath, businessEffectAuthority: 'NONE' };
}

export function savePrivateState({
  state = null,
  filePath = DEFAULT_FILE,
  authorization = null,
  privateKey = null,
  repoRoot = MODULE_REPO_ROOT,
  now = new Date()
} = {}) {
  if (!founderAuthorized(authorization)) return fail('PRIVATE_STATE_FOUNDER_AUTHORITY_REQUIRED', ['founder-authorization-required']);
  const shaped = validateStateShape(state);
  if (!shaped.ok) return shaped;
  const at = iso(now);
  if (!at) return fail('PRIVATE_STATE_WRITE_REFUSED', ['valid-clock-required']);
  const persisted = { ...shaped.state, updatedAt: at };
  const sealed = seal(persisted, privateKey, PRIVATE_STATE_PURPOSE);
  if (!sealed.ok) return sealed;
  const written = atomicPrivateWrite(filePath, `${JSON.stringify(sealed.envelope, null, 2)}\n`, { repoRoot });
  if (!written.ok) return written;
  return { ...written, state: persisted };
}

function commandName(command) {
  return String(command?.action || '').trim().toLowerCase();
}

/**
 * Executes one founder-authorized private command against in-memory state.
 * No function here sends a message, calls a provider, writes the repository,
 * chooses a life decision or grants business-effect authority.
 */
export function executePrivateCommand({
  state = defaultPrivateState(),
  command = {},
  authorization = null,
  privateFilePath = DEFAULT_FILE,
  repoRoot = MODULE_REPO_ROOT,
  now = new Date()
} = {}) {
  if (!founderAuthorized(authorization)) return fail('PRIVATE_STATE_FOUNDER_AUTHORITY_REQUIRED', ['founder-authorization-required']);
  const shaped = validateStateShape(state);
  if (!shaped.ok) return shaped;
  const current = shaped.state;
  const action = commandName(command);
  const at = iso(now);
  if (!at) return fail('PRIVATE_COMMAND_REFUSED', ['valid-clock-required']);

  if (action === 'status') {
    return {
      ok: true,
      status: 'PRIVATE_STATUS_READY',
      mutation: false,
      summary: {
        recordCount: current.records.length,
        hypothesisCount: current.hypotheses.length,
        edgeCount: current.edges.length,
        updatedAt: current.updatedAt
      },
      state: current,
      businessEffectAuthority: 'NONE'
    };
  }

  if (action === 'list') {
    return {
      ok: true,
      status: 'PRIVATE_RECORDS_LISTED',
      mutation: false,
      records: current.records,
      hypotheses: current.hypotheses,
      edges: current.edges,
      state: current,
      businessEffectAuthority: 'NONE'
    };
  }

  if (action === 'capture') {
    const captured = captureWillEvent({
      store: current.records,
      utterance: command.utterance,
      willEventType: command.willEventType,
      consent: command.consent,
      authorization,
      destination: privateFilePath,
      occurredAt: command.occurredAt,
      now
    });
    if (!captured.ok) return { ...captured, mutation: false };
    return {
      ...captured,
      mutation: captured.persisted === true && captured.duplicate !== true,
      state: { ...current, records: captured.store }
    };
  }

  if (action === 'promote') {
    const promoted = promoteCapture({
      store: current.records,
      captureId: command.captureId,
      target: command.target,
      commitmentBody: command.commitmentBody,
      authorization,
      destination: privateFilePath,
      now
    });
    if (!promoted.ok) return { ...promoted, mutation: false };
    return {
      ...promoted,
      mutation: true,
      state: { ...current, records: promoted.store }
    };
  }

  if (action === 'hypothesis') {
    const registered = registerHypothesis({
      store: current.records,
      hypothesisStore: current.hypotheses,
      subjectId: command.subjectId || 'FOUNDER',
      dimension: command.dimension,
      type: command.type,
      statement: command.statement,
      derivedFrom: command.derivedFrom,
      evidenceStrength: command.evidenceStrength,
      authorization,
      now
    });
    if (!registered.ok) return { ...registered, mutation: false };
    return {
      ...registered,
      mutation: true,
      state: { ...current, records: registered.store, hypotheses: registered.hypothesisStore }
    };
  }

  if (action === 'decision') {
    const composed = composeDecisionPacket({ ...(command.packet || {}), now });
    if (!composed.ok) return { ...composed, mutation: false };
    return {
      ...composed,
      mutation: false,
      state: current,
      truthBoundary: 'THE PRIVATE OPERATOR MAY COMPOSE A DECISION AID; ONLY THE FOUNDER MAY CHOOSE OR COMMIT.'
    };
  }

  if (action === 'delete') {
    const requested = Array.isArray(command.ids) ? command.ids : [];
    const present = new Set(current.records.map(row => row.id));
    const roots = requested.filter(id => present.has(id));
    const closure = derivedClosure(current.records, roots);
    const deleted = deletePrivateRecords({ store: current.records, ids: requested, authorization, now });
    if (!deleted.ok) return { ...deleted, mutation: false };
    const hypotheses = current.hypotheses.filter(row => !closure.has(row.recordId) && !(row.derivedFrom || []).some(id => closure.has(id)));
    const edges = current.edges.filter(row => !closure.has(row?.provenance?.sourceRecordId));
    return {
      ...deleted,
      mutation: deleted.deletedIds.length > 0,
      prunedHypothesisCount: current.hypotheses.length - hypotheses.length,
      prunedEdgeCount: current.edges.length - edges.length,
      state: { ...current, records: deleted.store, hypotheses, edges }
    };
  }

  if (action === 'export') {
    const destination = command.destination;
    const checked = validatePrivateStatePath(destination, { repoRoot });
    if (!checked.ok) return { ...checked, mutation: false };
    const exported = exportPrivateState({ store: current.records, authorization, destination: checked.filePath, now });
    if (!exported.ok) return { ...exported, mutation: false };
    return { ...exported, mutation: false, state: current };
  }

  return fail('PRIVATE_COMMAND_REFUSED', ['known-private-command-required'], { mutation: false });
}

/**
 * Loads, executes and durably commits one command. The state and export files
 * are authenticated ciphertext. The life key is process-only and is never
 * included in state, receipts, exports, logs or returned command results.
 */
export function runPrivateCommand({
  command = {},
  authorization = null,
  privateKey = null,
  filePath = DEFAULT_FILE,
  repoRoot = MODULE_REPO_ROOT,
  now = new Date()
} = {}) {
  const loaded = loadPrivateState({ filePath, authorization, privateKey, repoRoot });
  if (!loaded.ok) return loaded;
  const executed = executePrivateCommand({ state: loaded.state, command, authorization, privateFilePath: loaded.filePath, repoRoot, now });
  if (!executed.ok) return executed;

  if (commandName(command) === 'export') {
    const fullState = {
      records: executed.records,
      hypotheses: loaded.state.hypotheses,
      edges: loaded.state.edges
    };
    const stateDigest = createHash('sha256').update(JSON.stringify(fullState)).digest('hex');
    const exportPayload = {
      schemaVersion: PRIVATE_EXPORT_SCHEMA,
      exportedAt: executed.exportedAt,
      recordCount: executed.recordCount,
      hypothesisCount: loaded.state.hypotheses.length,
      edgeCount: loaded.state.edges.length,
      completeness: {
        ...executed.completeness,
        completePrivateOperatorState: true
      },
      recordDigest: executed.digest,
      stateDigest,
      records: executed.records,
      hypotheses: loaded.state.hypotheses,
      edges: loaded.state.edges
    };
    const sealed = seal(exportPayload, privateKey, PRIVATE_EXPORT_PURPOSE);
    if (!sealed.ok) return sealed;
    const written = atomicPrivateWrite(executed.destination, `${JSON.stringify(sealed.envelope, null, 2)}\n`, { repoRoot });
    if (!written.ok) return written;
    return {
      ...executed,
      exportWritten: true,
      exportDestination: written.filePath,
      stateDigest,
      hypothesisCount: loaded.state.hypotheses.length,
      edgeCount: loaded.state.edges.length,
      encryption: 'AES-256-GCM'
    };
  }

  if (!executed.mutation) return executed;
  const saved = savePrivateState({ state: executed.state, filePath: loaded.filePath, authorization, privateKey, repoRoot, now });
  if (!saved.ok) return saved;
  return { ...executed, state: saved.state, persisted: true, privateFilePath: loaded.filePath, encryption: 'AES-256-GCM' };
}

export function founderAuthorization(now = new Date()) {
  const issuedAt = iso(now);
  return issuedAt ? { subject: 'FOUNDER', grant: 'PRIVATE_LIFE_STATE', issuedAt } : null;
}

/** Test/operator helper that reveals no key and grants no effect authority. */
export function decryptPrivateEnvelopeForOwner({ envelope = null, privateKey = null, purpose = PRIVATE_EXPORT_PURPOSE } = {}) {
  const opened = openEnvelope(envelope, privateKey, purpose);
  if (!opened.ok) return opened;
  return { ok: true, status: 'PRIVATE_ENVELOPE_OPENED', value: opened.value, businessEffectAuthority: 'NONE' };
}

export const DEFAULT_PRIVATE_STATE_FILE = DEFAULT_FILE;
