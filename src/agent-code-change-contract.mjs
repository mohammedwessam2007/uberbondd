import crypto from 'node:crypto';
import { containsSecretValue } from './secret-patterns.mjs';
import path from 'node:path';

export const AGENT_CODE_CHANGE_POLICY_VERSION = 'agent-code-change-1.6.0';

const MAX_CHANGES = 20;
// Keep an entire change-set comfortably below the cloud relay's 250KB result
// ceiling so verified engineering artifacts can travel through the canonical
// result path without a second unbounded blob channel.
const MAX_FILE_BYTES = 80_000;
const MAX_TOTAL_BYTES = 180_000;
const MAX_TEXT = 4_000;
const OPS = new Set(['CREATE', 'UPDATE', 'DELETE']);

const PROTECTED_PREFIXES = Object.freeze([
  '.git',
  '.env',
  'credentials',
  'lite',
  'node_modules',
  '.github/workflows',
  // The autonomous verifier intentionally invokes root npm scripts. An
  // untrusted engineering edit must not be able to rewrite the command graph
  // or project-level npm execution policy immediately before verification.
  'package.json',
  'package-lock.json',
  '.npmrc',
  // Protecting package.json alone left the door open one level down: the
  // scripts it names are what actually decide which tests run and which files
  // are parsed. An edit that rewrote the discovery script could hide its own
  // failures from the gate that was about to check it.
  'scripts/run-tests.mjs',
  'scripts/check-syntax.mjs'
]);

// Sovereignty: the modules that define what this system is allowed to do.
//
// The list above protects the build and verification graph -- how a change gets
// checked. This one protects the limits themselves. A probe compiled a
// well-formed change set, with a bland rationale and a passing verification
// command, that replaced each of these files with a single comment. Every one
// was ACCEPTED, including src/agent-code-change-contract.mjs itself: the
// self-improvement path could delete its own guard and then, on the next pass,
// anything at all.
//
// These are deliberately absolute. A module here can never be edited by the
// autonomous path, only by a person -- which is the whole content of the rule
// that a system may not widen its own authority. The cost is real: genuine
// improvements to these files need a human. That is the intended price.
const SOVEREIGNTY_PREFIXES = Object.freeze([
  // The rules about changing files, including this list.
  'src/agent-code-change-contract.mjs',
  // Whether a message may be sent to a real person, and on whose authority.
  'src/deliverability-guard.mjs',
  'src/send-safety.mjs',
  'src/consequence-boundary.mjs',
  // The gate that decides whether a provider may be called at all.
  'src/agent-mesh-activation-gate.mjs',
  // What an autonomous run may do, and how authority narrows into children.
  'src/agent-autonomy-loop.mjs',
  // What may enter and leave the relay, and what counts as no effect at all.
  'src/cloud-agent-relay.mjs',
  'src/effect-ledgers.mjs',
  'src/chatgpt-relay-client.mjs',
  'src/github-relay.mjs',
  // What counts as a credential, and what counts as finished work.
  'src/secret-patterns.mjs',
  'src/agent-worker-result-truth.mjs',
  // The isolation the engineering path runs inside.
  'src/claude-code-sandbox-provisioner.mjs',
  // Customer acceptance, contractual timing and retained-customer truth.
  // The mutation war already treats this module as sovereignty-critical through
  // ACCEPT/TIME guards; leaving the file editable would make those protections
  // detectable-after-the-fact rather than impossible to widen autonomously.
  'src/service-fulfillment.mjs',
  // Whether owner absence is safe depends on real escalation deliverability.
  'src/founder-absence-readiness.mjs',
  // Recovery truth cannot be allowed to turn partial history into complete
  // history or overwrite a newer irreversible outbound reservation state.
  'src/durable-audit-scan.mjs',
  'src/reservation-recovery.mjs',
  // Evidence provenance and source clamping decide whether commercial inputs
  // may be treated as stronger than their witnesses. These remain dormant
  // until their activation gates open, but the autonomous path must not be
  // able to weaken the clamps before that happens.
  'src/prospect-evidence-reconciliation.mjs',
  'src/market-signal.mjs',
  // What may be claimed about money.
  //
  // Three modules, and for a while only two of them. `payments.mjs` decides what
  // "cleared" means and `payment-renewal-truth.mjs` decides what may be
  // reconciled from it -- but `revenue.mjs` is what actually writes the order
  // row, the revenue row and the classification receipt that those two then
  // read. Protecting the reader and leaving the writer editable is a one-step
  // bypass, not a two-step one: an autonomous change could not alter what
  // clearing means, and could put the raw customer payload back into durable
  // state, or drop `amountCents` from the receipt and blind the third witness
  // again. Both of those are mutations in the war (PRIV-01, MONEY-12) precisely
  // because they are the moves worth making.
  'src/payment-renewal-truth.mjs',
  'src/payments.mjs',
  'src/revenue.mjs',
  // The only path by which the owner learns anything is wrong.
  'src/operator-escalation.mjs',
  'src/operator-escalation-transport.mjs',
  // The record of what is deliberately unwired, and the test that enforces it.
  'config/reachability-classification.json',
  'tests/reachability-ratchet.test.mjs',
  // The tests that prove the guards above still guard, and the runner that
  // decides whether they still do.
  //
  // This section existed with four entries and rotted. The four were right when
  // they were written; every killing test added afterwards was left out, and by
  // the time a probe checked, fifteen of the twenty suites that prove a
  // sovereignty guard still guards were editable by the autonomous path -- as
  // was scripts/mutation-war.mjs, the single artifact that decides whether any
  // of them still kill. Deleting one entry from its list removes the proof that
  // a guard works and reports a smaller number that nobody cross-checks.
  //
  // Protecting the guard and leaving its proof editable protects nothing on the
  // second move. So the membership of this section is derived rather than
  // remembered: `sovereignty-proof-closure.test.mjs` fails if any suite the
  // mutation war names for a file listed above is missing from it. Adding a
  // mutation for a sovereignty file now forces its suite in here.
  'scripts/mutation-war.mjs',
  'tests/sovereignty-proof-closure.test.mjs',
  'tests/autonomy-constraint-monotonicity-property.test.mjs',
  'tests/deliverability-guard.test.mjs',
  'tests/effect-state-vocabulary.test.mjs',
  'tests/founder-absence-deliverability.test.mjs',
  'tests/fulfillment-evidence-referent.test.mjs',
  'tests/fulfillment-forward-time.test.mjs',
  'tests/service-fulfillment.test.mjs',
  'tests/superseded-fulfillment-invariants.test.mjs',
  'tests/zero-effect-agreement.test.mjs',
  'tests/github-relay.test.mjs',
  'tests/durable-audit-scan-ceiling.test.mjs',
  'tests/reservation-recovery-race.test.mjs',
  'tests/evidence-class-laundering.test.mjs',
  'tests/market-signal.test.mjs',
  'tests/operator-escalation-episodes.test.mjs',
  'tests/operator-escalation-transport.test.mjs',
  'tests/outbound-stale-authorization.test.mjs',
  'tests/payment-currency-truth.test.mjs',
  'tests/payment-receipt-witnesses-money.test.mjs',
  'tests/provider-payload-minimization.test.mjs',
  'tests/provider-payload-minimization-source-guard.test.mjs',
  'tests/payment-recovery-war.test.mjs',
  'tests/payment-webhook-recovery.test.mjs',
  'tests/revenue-report-email-recovery.test.mjs',
  'tests/payment-renewal-truth.test.mjs',
  'tests/payment-truth-double-count.test.mjs',
  'tests/payment-truth-lead-scope.test.mjs',
  'tests/payment-truth-reversal.test.mjs',
  'tests/payment-witness-integrity-mutation.test.mjs',
  'tests/pipeline-deliverability-guard.test.mjs',
  'tests/recovery-war-boundaries.test.mjs',
  'tests/secret-cookie-jwt.test.mjs',
  'tests/secret-format-coverage.test.mjs',
  'tests/sovereignty-self-modification.test.mjs',
  'tests/worker-result-terminal-truth.test.mjs'
]);

function text(value, max = MAX_TEXT) {
  return String(value ?? '').trim().slice(0, max);
}

function hash(value) {
  return crypto.createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
}

function bytes(value) {
  return Buffer.byteLength(String(value ?? ''), 'utf8');
}

function fail(reasonCodes, status = 'REJECTED', extra = {}) {
  return {
    ok: false,
    policyVersion: AGENT_CODE_CHANGE_POLICY_VERSION,
    status,
    reasonCodes: [...new Set((reasonCodes || []).filter(Boolean))],
    businessEffectAuthority: 'NONE',
    ...extra
  };
}

function normalizedRelativePath(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const original = value.trim();
  if (path.isAbsolute(original) || /^[A-Za-z]:[\\/]/.test(original)) return null;
  const slash = original.replaceAll('\\', '/');
  const normalized = path.posix.normalize(slash);
  if (!normalized || normalized === '.' || normalized === '..' || normalized.startsWith('../') || normalized.includes('/../')) return null;
  if (normalized.startsWith('/')) return null;
  return normalized;
}

function matchesPrefix(lower, prefix) {
  const p = prefix.toLowerCase();
  if (p === '.env') return lower === '.env' || lower.startsWith('.env.') || lower.startsWith('.env/');
  return lower === p || lower.startsWith(`${p}/`);
}

function protectedPath(filePath) {
  const lower = filePath.toLowerCase();
  return PROTECTED_PREFIXES.some(prefix => matchesPrefix(lower, prefix));
}

function sovereigntyPath(filePath) {
  const lower = filePath.toLowerCase();
  return SOVEREIGNTY_PREFIXES.some(prefix => matchesPrefix(lower, prefix));
}

function secretMaterial(content) {
  return containsSecretValue(content);
}

function sha256(value) {
  return /^[a-f0-9]{64}$/i.test(String(value || '').trim()) ? String(value).trim().toLowerCase() : null;
}

function normalizedTests(values) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map(value => text(value, 500)).filter(Boolean))].slice(0, 20);
}

function normalizeChange(change, index) {
  const reasons = [];
  if (!change || typeof change !== 'object' || Array.isArray(change)) {
    return { ok: false, reasons: [`change-${index}-object-required`] };
  }

  const operation = text(change.operation, 20).toUpperCase();
  if (!OPS.has(operation)) reasons.push(`change-${index}-operation-invalid`);
  const filePath = normalizedRelativePath(change.path);
  if (!filePath) reasons.push(`change-${index}-path-invalid`);
  // A separate reason code from `protected-path`. They are refused for
  // different reasons and an operator reading a refusal should be able to tell
  // "you tried to edit the build graph" from "you tried to edit your own
  // limits", which is a far more serious thing to have attempted.
  else if (sovereigntyPath(filePath)) reasons.push(`change-${index}-sovereignty-path`);
  else if (protectedPath(filePath)) reasons.push(`change-${index}-protected-path`);

  const beforeSha256 = sha256(change.beforeSha256);
  const content = change.content == null ? null : String(change.content);

  if (operation === 'CREATE') {
    if (change.beforeSha256 != null && String(change.beforeSha256).trim()) reasons.push(`change-${index}-create-before-hash-must-be-empty`);
    if (content == null) reasons.push(`change-${index}-create-content-required`);
  }

  if (operation === 'UPDATE' || operation === 'DELETE') {
    if (!beforeSha256) reasons.push(`change-${index}-before-hash-required`);
  }

  if (operation === 'UPDATE' && content == null) reasons.push(`change-${index}-update-content-required`);
  if (operation === 'DELETE' && content != null && content.length > 0) reasons.push(`change-${index}-delete-content-must-be-empty`);

  if (content != null && bytes(content) > MAX_FILE_BYTES) reasons.push(`change-${index}-file-size-limit`);
  if (content != null && secretMaterial(content)) reasons.push(`change-${index}-credential-material-rejected`);

  const rationale = text(change.rationale, 1000);
  if (!rationale) reasons.push(`change-${index}-rationale-required`);

  if (reasons.length) return { ok: false, reasons };

  return {
    ok: true,
    value: {
      operation,
      path: filePath,
      beforeSha256: operation === 'CREATE' ? null : beforeSha256,
      afterSha256: operation === 'DELETE' ? null : hash(content),
      content: operation === 'DELETE' ? null : content,
      rationale
    }
  };
}

export function compileAgentCodeChangeSet({
  taskId,
  baseRevision,
  changes = [],
  verification = [],
  summary = '',
  consequenceClass = 'LOCAL_PREPARATION'
} = {}) {
  const reasons = [];
  const id = text(taskId, 160);
  const base = text(baseRevision, 160);
  const normalizedConsequence = text(consequenceClass, 80).toUpperCase();
  if (!id) reasons.push('task-id-required');
  if (!base) reasons.push('base-revision-required');
  if (normalizedConsequence !== 'LOCAL_PREPARATION') reasons.push('local-preparation-only');
  if (!Array.isArray(changes) || !changes.length) reasons.push('at-least-one-change-required');
  if (Array.isArray(changes) && changes.length > MAX_CHANGES) reasons.push('change-count-limit');

  const normalizedChanges = [];
  for (let index = 0; index < (Array.isArray(changes) ? changes.length : 0); index += 1) {
    const normalized = normalizeChange(changes[index], index);
    if (!normalized.ok) reasons.push(...normalized.reasons);
    else normalizedChanges.push(normalized.value);
  }

  const paths = normalizedChanges.map(change => change.path);
  if (new Set(paths).size !== paths.length) reasons.push('duplicate-change-path');
  const totalBytes = normalizedChanges.reduce((sum, change) => sum + bytes(change.content), 0);
  if (totalBytes > MAX_TOTAL_BYTES) reasons.push('change-set-total-size-limit');

  const tests = normalizedTests(verification);
  if (!tests.length) reasons.push('verification-required');
  const normalizedSummary = text(summary, 2000);
  if (!normalizedSummary) reasons.push('change-summary-required');

  if (reasons.length) return fail(reasons);

  const identity = {
    taskId: id,
    baseRevision: base,
    changes: normalizedChanges.map(change => ({
      operation: change.operation,
      path: change.path,
      beforeSha256: change.beforeSha256,
      afterSha256: change.afterSha256,
      rationale: change.rationale
    })),
    verification: tests,
    summary: normalizedSummary
  };

  return {
    ok: true,
    policyVersion: AGENT_CODE_CHANGE_POLICY_VERSION,
    status: 'READY_FOR_SANDBOX_APPLY',
    changeSetId: `agent_changes_${hash(identity).slice(0, 24)}`,
    taskId: id,
    baseRevision: base,
    consequenceClass: 'LOCAL_PREPARATION',
    businessEffectAuthority: 'NONE',
    summary: normalizedSummary,
    changes: normalizedChanges,
    verification: tests,
    totals: {
      files: normalizedChanges.length,
      contentBytes: totalBytes,
      relaySafeEnvelopeBytes: MAX_TOTAL_BYTES
    }
  };
}

export function validateAgentCodeChangeSet(changeSet) {
  if (!changeSet || typeof changeSet !== 'object' || Array.isArray(changeSet)) return fail(['change-set-object-required'], 'INVALID');
  if (changeSet.ok !== true || changeSet.policyVersion !== AGENT_CODE_CHANGE_POLICY_VERSION) return fail(['change-set-policy-mismatch'], 'INVALID');
  const rebuilt = compileAgentCodeChangeSet({
    taskId: changeSet.taskId,
    baseRevision: changeSet.baseRevision,
    changes: (changeSet.changes || []).map(change => ({
      operation: change.operation,
      path: change.path,
      beforeSha256: change.beforeSha256,
      content: change.content,
      rationale: change.rationale
    })),
    verification: changeSet.verification,
    summary: changeSet.summary,
    consequenceClass: changeSet.consequenceClass
  });
  if (!rebuilt.ok) return fail(rebuilt.reasonCodes, 'INVALID');
  if (rebuilt.changeSetId !== changeSet.changeSetId) return fail(['change-set-identity-mismatch'], 'INVALID');
  if (changeSet.businessEffectAuthority !== 'NONE') return fail(['business-effect-authority-must-remain-none'], 'INVALID');
  return {
    ok: true,
    policyVersion: AGENT_CODE_CHANGE_POLICY_VERSION,
    status: 'VALID',
    changeSetId: changeSet.changeSetId,
    taskId: changeSet.taskId
  };
}

/** The paths no autonomous change may touch, for tests and for operators. */
export const SOVEREIGNTY_PROTECTED_PATHS = SOVEREIGNTY_PREFIXES;
export const BUILD_PROTECTED_PATHS = PROTECTED_PREFIXES;

export function contentSha256(content) {
  return hash(String(content ?? ''));
}
