#!/usr/bin/env node
// If the founder turns the device off, what actually keeps running -- and what
// is the smallest human action that would move that answer.
//
// Every blocker is classified into exactly one class, and CODE_READY is not
// reportable while a credential, account or payment blocker is open. Elapsed
// founder-absence evidence cannot be produced by this or any other process:
// only real elapsed time with matching receipts produces it.
import { evaluateFounderAbsenceBlockers, RAGNAROK_BLOCKER_LEDGER } from '../src/founder-absence-blocker-doctor.mjs';
import { loadModelProviderRuntimeEvidence } from '../src/model-provider-runtime-evidence.mjs';
import { loadRemainingCutEvidence } from '../src/remaining-cut-evidence.mjs';
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function headSha() {
  try { return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim(); }
  catch { return null; }
}

// The artifacts canon is made of. A change confined to these is canon
// describing itself, not the source moving underneath it.
const CANON_ARTIFACTS = new Set([
  'docs/CURRENT_SYSTEM_STATE.md',
  'artifacts/system-readiness.json',
  'config/system-readiness-input.json'
]);

// Which paths make canon a claim about source rather than about prose. The same
// partition tests/canon-freshness.test.mjs uses, and deliberately so: two checks
// asking the same question of the same tree must not be able to disagree.
//
// Everything outside it -- a handoff, a receipt, a comment in a document -- can
// move without making canon false, because canon does not describe those. Asking
// instead that *nothing at all* changed made every documentation commit report
// canon drift, which is the same always-red failure this row was just repaired
// for, arriving from the other side.
const CANON_RELEVANT_PREFIX = /^(src|scripts|config|migrations)\//;
export const describesSource = file => CANON_RELEVANT_PREFIX.test(file) && !CANON_ARTIFACTS.has(file);

/** The commit docs/CURRENT_SYSTEM_STATE.md claims to describe. */
function canonCommit() {
  try {
    const text = readFileSync(join(repoRoot, 'docs/CURRENT_SYSTEM_STATE.md'), 'utf8');
    return text.match(/\b[0-9a-f]{40}\b/)?.[0] || null;
  } catch { return null; }
}

/**
 * Has any source canon describes changed between `commit` and HEAD?
 *
 * Refuses on any error rather than assuming freshness: an unreadable history is
 * not evidence that the source stood still.
 */
export function sourceUnchangedSince(commit) {
  if (!/^[0-9a-f]{40}$/.test(String(commit || ''))) return false;
  try {
    const changed = execFileSync('git', ['diff', '--name-only', `${commit}..HEAD`], { cwd: repoRoot, encoding: 'utf8' })
      .split('\n').map(line => line.trim()).filter(Boolean);
    return !changed.some(describesSource);
  } catch { return false; }
}

const RECEIPT_BINDINGS = Object.freeze([
  Object.freeze({
    cutId: 'MODEL_PROVIDER',
    blockerId: 'zero-configured-model-providers',
    envName: 'UBERBOND_MODEL_PROVIDER_RECEIPT_PATH',
    signal: 'canonicalModelProviderEvidence',
    load: ({ path, expectedSourceCommit }) => loadModelProviderRuntimeEvidence({ path, expectedSourceCommit })
  }),
  Object.freeze({
    cutId: 'MESSAGING_PROVIDER',
    blockerId: 'zero-activated-email-provider-accounts',
    envName: 'UBERBOND_MESSAGING_PROVIDER_RECEIPT_PATH',
    signal: 'canonicalMessagingProviderEvidence',
    load: ({ path, expectedSourceCommit }) => loadRemainingCutEvidence({ path, expectedSourceCommit, expectedCutId: 'MESSAGING_PROVIDER' })
  }),
  Object.freeze({
    cutId: 'PAYMENT_PROVIDER',
    blockerId: 'zero-payment-provider-account',
    envName: 'UBERBOND_PAYMENT_PROVIDER_RECEIPT_PATH',
    signal: 'canonicalPaymentProviderEvidence',
    load: ({ path, expectedSourceCommit }) => loadRemainingCutEvidence({ path, expectedSourceCommit, expectedCutId: 'PAYMENT_PROVIDER' })
  })
]);

function safeReceiptValidation(validation, cutId) {
  return {
    cutId,
    accepted: validation?.accepted === true,
    status: String(validation?.status || 'EVIDENCE_NOT_SUPPLIED'),
    reasonCodes: Array.isArray(validation?.reasonCodes) ? [...validation.reasonCodes] : [],
    sourceCommit: validation?.sourceCommit || null,
    receiptDigest: validation?.receiptDigest || null,
    businessEffectAuthority: 'NONE'
  };
}

export function canonicalBlockerOverlay({ env = {}, currentSourceCommit = null } = {}) {
  const validations = {};
  const signals = {};
  const acceptedByBlocker = new Map();

  for (const binding of RECEIPT_BINDINGS) {
    // These environment values are file references, not credentials. The
    // canonical loaders parse the receipt and independently verify digest,
    // source commit, cut identity and cut-specific admission conditions.
    const receiptPath = String(env?.[binding.envName] || '').trim();
    const validation = binding.load({ path: receiptPath, expectedSourceCommit: currentSourceCommit });
    validations[binding.cutId] = safeReceiptValidation(validation, binding.cutId);
    if (validation?.accepted === true) {
      signals[binding.signal] = true;
      acceptedByBlocker.set(binding.blockerId, {
        signal: binding.signal,
        cutId: binding.cutId,
        receiptDigest: validation.receiptDigest
      });
    }
  }

  const blockers = RAGNAROK_BLOCKER_LEDGER.map(row => {
    const accepted = acceptedByBlocker.get(row.id);
    if (!accepted) return row;
    return {
      ...row,
      removedBy: `canonical exact-source ${accepted.cutId} receipt ${accepted.receiptDigest}`,
      resolvedWhen: { externalEvidence: accepted.signal }
    };
  });

  return { blockers, externalEvidence: signals, validations };
}

export function buildFounderAbsenceReport({ env = process.env, now = new Date() } = {}) {
  const currentSourceCommit = headSha();
  const canonical = canonicalBlockerOverlay({ env, currentSourceCommit });
  const report = evaluateFounderAbsenceBlockers({
    blockers: canonical.blockers,
    env,
    now,
    currentSourceCommit,
    canonCommit: canonCommit(),
    externalEvidence: canonical.externalEvidence,
    // Both probes the evaluator declares. Supplying only one silently falls
    // back to the refusing default for the other, and every row whose
    // resolution is a source probe then reports open -- a doctor that says the
    // work is unfinished because nobody handed it a way to look.
    probes: {
      fileExists: relative => existsSync(join(repoRoot, String(relative || ''))),
      sourceIncludes: (relative, needle) => {
        try { return readFileSync(join(repoRoot, String(relative || '')), 'utf8').includes(String(needle || '')); }
        catch { return false; }
      },
      sourceUnchangedSince
    }
  });
  return { ...report, canonicalReceiptEvidence: canonical.validations };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.stdout.write(`${JSON.stringify(buildFounderAbsenceReport(), null, 2)}\n`);
}
