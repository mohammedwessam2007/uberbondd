import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { compileUberBondProjectContext } from '../src/uberbond-brain-context.mjs';
import { ZERO_EXTERNAL_EFFECTS } from '../src/effect-ledgers.mjs';

export const UBERBOND_BRAIN_BOOTSTRAP_CLI_VERSION = 'uberbond-brain-bootstrap-cli-1.0.0';

const MAX_HANDOFF_ITEMS = 120;
const MAX_HANDOFF_TEXT = 1200;

function text(value, max = MAX_HANDOFF_TEXT) {
  const string = String(value ?? '').trim();
  return string && string.length <= max ? string : null;
}

function boundedStrings(value, maxItems = MAX_HANDOFF_ITEMS, maxText = MAX_HANDOFF_TEXT) {
  if (!Array.isArray(value) || value.length > maxItems) return null;
  const result = [];
  for (const item of value) {
    const normalized = text(item, maxText);
    if (!normalized) return null;
    result.push(normalized);
  }
  return result;
}

function readJson(filePath, label) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    const wrapped = new Error(`${label}-read-failed`);
    wrapped.cause = error;
    throw wrapped;
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    const wrapped = new Error(`${label}-json-invalid`);
    wrapped.cause = error;
    throw wrapped;
  }
}

function resolveSourceCommit(rootDir, explicitCommit = null) {
  const supplied = text(explicitCommit, 64);
  if (supplied) return supplied.toLowerCase();
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5000
    }).trim().toLowerCase();
  } catch {
    throw new Error('source-commit-unavailable');
  }
}

function normalizeHandoff(handoff = {}) {
  if (!handoff || typeof handoff !== 'object' || Array.isArray(handoff)) {
    throw new Error('handoff-object-required');
  }
  const activeMission = text(handoff.activeMission);
  const completed = boundedStrings(handoff.completed || []);
  const blockers = boundedStrings(handoff.blockers || []);
  const nextActions = boundedStrings(handoff.nextActions || []);
  if (!activeMission || !completed || !blockers || !nextActions) {
    throw new Error('handoff-core-fields-invalid');
  }
  const handoffBasis = text(handoff.sourceCommit || handoff.sourceMainShaAtMissionStart, 64);
  return {
    schemaVersion: text(handoff.schemaVersion, 80),
    handoffBasisSha: handoffBasis ? handoffBasis.toLowerCase() : null,
    activeBranch: handoff.activeBranch == null ? null : text(handoff.activeBranch, 240),
    activePullRequest: Number.isSafeInteger(handoff.activePullRequest) ? handoff.activePullRequest : null,
    activeMission,
    completed,
    blockers,
    nextActions,
    unresolvedNames: Array.isArray(handoff.unresolvedNames)
      ? handoff.unresolvedNames.slice(0, 128).map(item => ({
          name: text(item?.name, 240),
          status: text(item?.status, 80),
          next: text(item?.next || item?.requiredAction, 1000)
        })).filter(item => item.name && item.status)
      : []
  };
}

function assertSafeRelativePath(relativePath) {
  const value = text(relativePath, 300);
  if (!value || path.isAbsolute(value) || value.split(/[\\/]+/).includes('..')) {
    throw new Error('unsafe-canon-pointer');
  }
  return value;
}

export function loadUberBondBrainFromRepository({ rootDir, sourceCommit = null, now = new Date() } = {}) {
  const root = path.resolve(rootDir || path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
  const bootstrapPath = path.join(root, 'UBERBOND_BOOTSTRAP.json');
  const bootstrap = readJson(bootstrapPath, 'bootstrap');
  const memoryRelative = assertSafeRelativePath(bootstrap.memoryIndexPath || 'artifacts/uberbond-memory-index.json');
  const handoffRelative = assertSafeRelativePath(bootstrap?.continuity?.handoffPath || 'docs/CURRENT_HANDOFF.json');
  const memoryIndex = readJson(path.join(root, memoryRelative), 'memory-index');
  const handoff = normalizeHandoff(readJson(path.join(root, handoffRelative), 'handoff'));
  const commit = resolveSourceCommit(root, sourceCommit);

  const declaredPaths = [...new Set([
    'UBERBOND_BOOTSTRAP.json',
    ...(Array.isArray(bootstrap.canonPointers) ? bootstrap.canonPointers : [])
  ])].map(assertSafeRelativePath);
  const missingPaths = declaredPaths.filter(relative => !fs.existsSync(path.join(root, relative)));
  if (missingPaths.length) {
    const error = new Error('declared-canon-file-missing');
    error.missingPaths = missingPaths;
    throw error;
  }

  const compiled = compileUberBondProjectContext({
    bootstrap,
    memoryIndex,
    sourceCommit: commit,
    availablePaths: declaredPaths,
    now
  });
  if (!compiled.ok) {
    const error = new Error('project-context-validation-failed');
    error.reasonCodes = compiled.reasonCodes;
    throw error;
  }

  const handoffFreshAgainstSource = Boolean(handoff.handoffBasisSha && handoff.handoffBasisSha === commit);
  const packet = {
    schemaVersion: 'uberbond-repository-brain-packet-1.0.0',
    cliVersion: UBERBOND_BRAIN_BOOTSTRAP_CLI_VERSION,
    project: 'UberBond',
    sourceCommit: commit,
    contextDigest: compiled.context.contextDigest,
    memoryDigest: compiled.context.memoryDigest,
    objective: compiled.context.objective,
    economicNorthStar: compiled.context.finalGoal?.economicNorthStar || null,
    endState: compiled.context.finalGoal?.endState || null,
    productFamilies: compiled.context.productFamilies,
    namedInitiativeCount: compiled.context.namedInitiatives.length,
    namedInitiatives: compiled.context.namedInitiatives.map(item => ({ id: item.id, name: item.name, status: item.status })),
    unresolvedNames: compiled.context.unresolvedNames,
    externalProofGates: compiled.context.externalProofGates,
    currentHandoff: {
      ...handoff,
      freshAgainstSourceCommit: handoffFreshAgainstSource,
      authority: handoffFreshAgainstSource
        ? 'CURRENT_SHORT_HORIZON_HINT_STILL_REQUIRES_GITHUB_DEDUPE'
        : 'STALE_OR_BRANCH_RELATIVE_HINT_RECONCILE_AGAINST_LIVE_GITHUB_BEFORE_ACTING'
    },
    startupProtocol: compiled.startupProtocol,
    requiredNextReads: [
      'Inspect live main and open/recent PRs before selecting work.',
      'Read current readiness/state for present-tense software truth.',
      'Dedupe requested work against current code and active shared branches.',
      'Leave a durable handoff and update Master Memory when new lasting history appears.'
    ],
    truthLaw: compiled.context.externalTruthLaw,
    memoryLaw: compiled.context.memoryLaw,
    businessEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS }
  };
  return packet;
}

export function formatUberBondBrainPacket(packet) {
  return [
    `UberBond brain ready @ ${packet.sourceCommit}`,
    `context: ${packet.contextDigest}`,
    `memory: ${packet.memoryDigest}`,
    `initiatives: ${packet.namedInitiativeCount}`,
    `unresolved: ${packet.unresolvedNames.map(item => item.name).join(', ') || 'none'}`,
    `handoff: ${packet.currentHandoff.freshAgainstSourceCommit ? 'fresh' : 'reconcile against live GitHub'}`,
    `mission: ${packet.currentHandoff.activeMission}`,
    'authority: NONE (bootstrap is read-only)'
  ].join('\n');
}

function isMainModule() {
  if (!process.argv[1]) return false;
  return path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isMainModule()) {
  try {
    const packet = loadUberBondBrainFromRepository({});
    if (process.argv.includes('--json')) process.stdout.write(`${JSON.stringify(packet, null, 2)}\n`);
    else process.stdout.write(`${formatUberBondBrainPacket(packet)}\n`);
  } catch (error) {
    const failure = {
      ok: false,
      status: 'UBERBOND_BRAIN_BOOTSTRAP_FAILED',
      reason: error?.message || 'unknown-error',
      reasonCodes: error?.reasonCodes || [],
      missingPaths: error?.missingPaths || [],
      businessEffectAuthority: 'NONE',
      externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS }
    };
    process.stderr.write(`${JSON.stringify(failure, null, 2)}\n`);
    process.exitCode = 1;
  }
}
