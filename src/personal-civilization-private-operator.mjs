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

export const PERSONAL_CIVILIZATION_PRIVATE_OPERATOR_VERSION = 'uberbond.personal-civilization-private-operator.v1';
export const PRIVATE_STATE_SCHEMA = 'uberbond.personal-civilization-private-state.v1';

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
 * directory symlink gap: `/outside/private/life.json` may look outside the repo
 * while `/outside/private` is actually a symlink back into the repository.
 * Reads use the resolved file and refuse any resolved target inside Git.
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

export function loadPrivateState({ filePath = DEFAULT_FILE, authorization = null, repoRoot = MODULE_REPO_ROOT } = {}) {
  if (!founderAuthorized(authorization)) return fail('PRIVATE_STATE_FOUNDER_AUTHORITY_REQUIRED', ['founder-authorization-required']);
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

  let parsed;
  try { parsed = JSON.parse(fs.readFileSync(target.readPath, 'utf8')); }
  catch { return fail('PRIVATE_STATE_READ_REFUSED', ['private-state-json-invalid']); }
  const shaped = validateStateShape(parsed);
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

export function savePrivateState({ state = null, filePath = DEFAULT_FILE, authorization = null, repoRoot = MODULE_REPO_ROOT, now = new Date() } = {}) {
  if (!founderAuthorized(authorization)) return fail('PRIVATE_STATE_FOUNDER_AUTHORITY_REQUIRED', ['founder-authorization-required']);
  const shaped = validateStateShape(state);
  if (!shaped.ok) return shaped;
  const at = iso(now);
  if (!at) return fail('PRIVATE_STATE_WRITE_REFUSED', ['valid-clock-required']);
  const persisted = { ...shaped.state, updatedAt: at };
  const written = atomicPrivateWrite(filePath, `${JSON.stringify(persisted, null, 2)}\n`, { repoRoot });
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
export function executePrivateCommand({ state = defaultPrivateState(), command = {}, authorization = null, privateFilePath = DEFAULT_FILE, repoRoot = MODULE_REPO_ROOT, now = new Date() } = {}) {
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
 * Loads, executes and durably commits one command. Export is written to the
 * founder-selected private destination; ordinary mutations update only the
 * configured private state file.
 */
export function runPrivateCommand({ command = {}, authorization = null, filePath = DEFAULT_FILE, repoRoot = MODULE_REPO_ROOT, now = new Date() } = {}) {
  const loaded = loadPrivateState({ filePath, authorization, repoRoot });
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
      schemaVersion: 'uberbond.personal-civilization-private-export.v1',
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
    const written = atomicPrivateWrite(executed.destination, `${JSON.stringify(exportPayload, null, 2)}\n`, { repoRoot });
    if (!written.ok) return written;
    return {
      ...executed,
      exportWritten: true,
      exportDestination: written.filePath,
      stateDigest,
      hypothesisCount: loaded.state.hypotheses.length,
      edgeCount: loaded.state.edges.length
    };
  }

  if (!executed.mutation) return executed;
  const saved = savePrivateState({ state: executed.state, filePath: loaded.filePath, authorization, repoRoot, now });
  if (!saved.ok) return saved;
  return { ...executed, state: saved.state, persisted: true, privateFilePath: loaded.filePath };
}

export function founderAuthorization(now = new Date()) {
  const issuedAt = iso(now);
  return issuedAt ? { subject: 'FOUNDER', grant: 'PRIVATE_LIFE_STATE', issuedAt } : null;
}

export const DEFAULT_PRIVATE_STATE_FILE = DEFAULT_FILE;
