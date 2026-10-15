// Revenue truth ledger: eleven claim states, each derived only from explicit receipts.
//
// Pure and zero-effect. No store parameter, no file or network I/O, no provider call
// and no clock read. A claim is REAL only when a qualifying REAL receipt satisfies its
// rule. A claim with no qualifying receipt is NOT_EVIDENCED, never a guess. A claim
// with any SIMULATED or FIXTURE receipt attached is SIMULATED_ONLY and is never REAL.
//
// The ledger trusts the receipts it is given and nothing else. It does not observe a
// deployment, provider, customer or bank, so REAL is a statement about the receipts,
// not about the world. It carries no consequence authority.

import { createHash } from 'node:crypto';
import { REVENUE_DRY_RUN_VERSION, REVENUE_DRY_RUN_STAGES } from './revenue-dry-run.mjs';

export const REVENUE_TRUTH_LEDGER_VERSION = 'uberbond.revenue-truth-ledger.v1';

export const REVENUE_TRUTH_CLAIMS = Object.freeze([
  'code-completed',
  'tests-passed',
  'ci-verified',
  'deployed',
  'live-healthy',
  'authorized-to-send',
  'real-communication-sent',
  'customer-accepted',
  'payment-initiated',
  'payment-settled',
  'cash-cleared'
]);

export const REVENUE_TRUTH_LABELS = Object.freeze({
  'code-completed': 'CODE COMPLETED',
  'tests-passed': 'TESTS PASSED',
  'ci-verified': 'CI VERIFIED',
  deployed: 'DEPLOYED',
  'live-healthy': 'LIVE HEALTHY',
  'authorized-to-send': 'AUTHORIZED TO SEND',
  'real-communication-sent': 'REAL COMMUNICATION SENT',
  'customer-accepted': 'CUSTOMER ACCEPTED',
  'payment-initiated': 'PAYMENT INITIATED',
  'payment-settled': 'PAYMENT SETTLED',
  'cash-cleared': 'CASH CLEARED'
});

export const REVENUE_TRUTH_STATES = Object.freeze({
  REAL: 'REAL',
  SIMULATED_ONLY: 'SIMULATED_ONLY',
  NOT_EVIDENCED: 'NOT_EVIDENCED'
});

export const REVENUE_TRUTH_PROVENANCE_KINDS = Object.freeze(['REAL', 'SIMULATED', 'FIXTURE']);

const REASON_CODE_LIST = [
  'RECEIPTS_NOT_ARRAY',
  'RECEIPT_NOT_OBJECT',
  'RECEIPT_TYPE_UNKNOWN',
  'RECEIPT_FORBIDDEN_FIELD',
  'RECEIPT_STRUCTURE_REFUSED',
  'RECEIPT_PROVENANCE_INVALID',
  'RECEIPT_MISSING',
  'SIMULATED_RECEIPT_ATTACHED',
  'TARGET_COMMIT_NOT_DECLARED',
  'TARGET_COMMIT_INVALID',
  'TARGET_OFFER_DIGEST_INVALID',
  'OFFER_DIGEST_NOT_DECLARED',
  'COMMIT_SHA_MISSING',
  'COMMIT_SHA_MISMATCH',
  'CI_CONCLUSION_NOT_SUCCESS',
  'TEST_COUNTS_INVALID',
  'TEST_FAILURES_PRESENT',
  'TEST_PASS_COUNT_ZERO',
  'BASELINE_COMPARISON_MISSING',
  'BASELINE_NOT_COMPARED',
  'TEST_REGRESSION_AGAINST_BASELINE',
  'HEALTH_NOT_HEALTHY',
  'HEALTH_NOT_NEWER_THAN_DEPLOYMENT',
  'DEPLOYMENT_NOT_EVIDENCED',
  'DEPENDENCY_SIMULATED_ONLY',
  'AUTHORIZATION_NOT_GRANTED',
  'PROVIDER_CONFIRMATION_MISSING',
  'OFFER_DIGEST_MISSING',
  'OFFER_DIGEST_MISMATCH',
  'ACCEPTANCE_NOT_GRANTED',
  'PAYMENT_INITIATED_NOT_REAL',
  'PAYMENT_SETTLED_NOT_REAL',
  'PROVIDER_RECEIPT_ID_MISSING',
  'PAYMENT_ORDER_INVALID',
  'CLEARED_FUNDS_RECEIPT_MISSING',
  'CLEARED_FUNDS_NOT_CONFIRMED',
  'CLEARED_FUNDS_PROVIDER_MISMATCH'
];

export const REVENUE_TRUTH_REASON_CODES = Object.freeze(
  Object.fromEntries(REASON_CODE_LIST.map(code => [code, code]))
);

const REASON = REVENUE_TRUTH_REASON_CODES;
const REAL = REVENUE_TRUTH_STATES.REAL;
const SIMULATED_ONLY = REVENUE_TRUTH_STATES.SIMULATED_ONLY;
const NOT_EVIDENCED = REVENUE_TRUTH_STATES.NOT_EVIDENCED;

// Receipt types that can evidence a claim, keyed by claim. A receipt of any other type
// is refused as unknown. cash-cleared also reads payment-settled, so a simulated
// payment-settled receipt blocks cash-cleared as well.
const RECEIPT_TYPES_BY_CLAIM = Object.freeze({
  'code-completed': Object.freeze(['code-completion']),
  'tests-passed': Object.freeze(['test-run']),
  'ci-verified': Object.freeze(['ci-run']),
  deployed: Object.freeze(['deployment']),
  'live-healthy': Object.freeze(['health-check']),
  'authorized-to-send': Object.freeze(['authorization']),
  'real-communication-sent': Object.freeze(['communication']),
  'customer-accepted': Object.freeze(['acceptance']),
  'payment-initiated': Object.freeze(['payment-initiated']),
  'payment-settled': Object.freeze(['payment-settled']),
  'cash-cleared': Object.freeze(['payment-settled', 'cleared-funds'])
});

const DRY_RUN_RECEIPT_TYPE = 'dry-run-stage';
const KNOWN_RECEIPT_TYPES = new Set([
  ...Object.values(RECEIPT_TYPES_BY_CLAIM).flat(),
  DRY_RUN_RECEIPT_TYPE
]);

const DRY_RUN_SOURCE = 'revenue-dry-run.runRevenueDryRun';
const DRY_RUN_STAGE_SET = new Set(REVENUE_DRY_RUN_STAGES);
// Only stages that name a claim produce a claim-typed receipt. The payment stage is a
// rehearsal of order creation, so it maps to payment-initiated and never to settlement.
const DRY_RUN_STAGE_RECEIPT_TYPE = new Map([
  ['approved-unsent-campaign', 'authorization'],
  ['simulated-acceptance', 'acceptance'],
  ['simulated-payment', 'payment-initiated']
]);
export const SIMULATED_RECEIPT_OBSERVED_AT = '2026-10-13T00:00:00.000Z';

const SHA_PATTERN = /^[0-9a-f]{40}$/;
const REF_PATTERN = /^[A-Za-z0-9:._/-]{1,200}$/;
const ISO_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
const BASELINE_COMPARISONS = new Set(['NO_REGRESSION', 'IMPROVED', 'REGRESSED', 'NOT_COMPARED']);
const FORBIDDEN_KEY_NAMES = new Set(['token', 'password', 'secret', 'key', 'authorization']);
const FORBIDDEN_KEY_SUFFIXES = ['token', 'password', 'secret', 'apikey', 'authorization'];
const MAX_RECEIPT_DEPTH = 12;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isProvided(value) {
  return value !== undefined && value !== null && value !== '';
}

function uniq(list) {
  return [...new Set(list)];
}

function sha(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return SHA_PATTERN.test(normalized) ? normalized : null;
}

function refId(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return REF_PATTERN.test(trimmed) ? trimmed : null;
}

function isoTime(value) {
  if (typeof value !== 'string' || !ISO_PATTERN.test(value)) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

function nonNegativeInt(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function isForbiddenKey(key) {
  const normalized = String(key).toLowerCase().replace(/[^a-z0-9]/g, '');
  if (FORBIDDEN_KEY_NAMES.has(normalized)) return true;
  return FORBIDDEN_KEY_SUFFIXES.some(suffix => normalized.endsWith(suffix));
}

// Walks a receipt. Returns a fixed reason code, or null when the receipt is clean.
// Values are never echoed, so a secret inside a receipt cannot reach the output.
function scanReceipt(value, depth) {
  if (depth > MAX_RECEIPT_DEPTH) return REASON.RECEIPT_STRUCTURE_REFUSED;
  if (Array.isArray(value)) {
    for (const item of value) {
      const problem = scanReceipt(item, depth + 1);
      if (problem) return problem;
    }
    return null;
  }
  if (isPlainObject(value)) {
    for (const [key, item] of Object.entries(value)) {
      if (isForbiddenKey(key)) return REASON.RECEIPT_FORBIDDEN_FIELD;
      const problem = scanReceipt(item, depth + 1);
      if (problem) return problem;
    }
  }
  return null;
}

function normalizeProvenance(value) {
  if (!isPlainObject(value)) return null;
  if (!REVENUE_TRUTH_PROVENANCE_KINDS.includes(value.kind)) return null;
  const source = refId(value.source);
  const digest = refId(value.digest);
  const time = isoTime(value.observedAt);
  if (!source || !digest || time === null) return null;
  return { kind: value.kind, source, digest, observedAt: value.observedAt, time };
}

// Only the fields a rule reads are copied out of a receipt. Everything else is dropped.
function typedFields(type, raw) {
  switch (type) {
    case 'code-completion':
    case 'deployment':
      return { commitSha: sha(raw.commitSha) };
    case 'test-run':
      return {
        passCount: nonNegativeInt(raw.passCount),
        failCount: nonNegativeInt(raw.failCount),
        baselineComparison: typeof raw.baselineComparison === 'string' && BASELINE_COMPARISONS.has(raw.baselineComparison)
          ? raw.baselineComparison
          : null
      };
    case 'ci-run':
      return {
        commitSha: sha(raw.commitSha),
        conclusion: typeof raw.conclusion === 'string' ? raw.conclusion.trim().toLowerCase() : null
      };
    case 'health-check':
      return { commitSha: sha(raw.commitSha), healthy: raw.healthy === true };
    case 'authorization':
      return { authorized: raw.authorized === true };
    case 'communication':
      return { providerConfirmed: raw.providerConfirmed === true };
    case 'acceptance':
      return { offerDigest: refId(raw.offerDigest), accepted: raw.accepted === true };
    case 'payment-settled':
      return { providerReceiptId: refId(raw.providerReceiptId) };
    case 'cleared-funds':
      return { providerReceiptId: refId(raw.providerReceiptId), cleared: raw.cleared === true };
    default:
      return {};
  }
}

// Returns { receipt } when the receipt is usable, or { reasonCode, type } when refused.
// The type is returned only when it is a known type, so a refusal can be attributed to a
// claim without trusting unknown strings.
function normalizeReceipt(raw) {
  if (!isPlainObject(raw)) return { reasonCode: REASON.RECEIPT_NOT_OBJECT, type: null };
  const type = typeof raw.type === 'string' && KNOWN_RECEIPT_TYPES.has(raw.type) ? raw.type : null;
  const structural = scanReceipt(raw, 0);
  if (structural) return { reasonCode: structural, type };
  if (!type) return { reasonCode: REASON.RECEIPT_TYPE_UNKNOWN, type: null };
  const provenance = normalizeProvenance(raw.provenance);
  if (!provenance) return { reasonCode: REASON.RECEIPT_PROVENANCE_INVALID, type };
  if (type === DRY_RUN_RECEIPT_TYPE && provenance.kind !== 'SIMULATED') {
    return { reasonCode: REASON.RECEIPT_PROVENANCE_INVALID, type };
  }
  return { receipt: { type, provenance, ...typedFields(type, raw) } };
}

function normalizeTarget(target) {
  const source = isPlainObject(target) ? target : {};
  const commitSha = sha(source.commitSha);
  const offerDigest = refId(source.offerDigest);
  return {
    commitSha,
    commitInvalid: isProvided(source.commitSha) && commitSha === null,
    offerDigest,
    offerDigestInvalid: isProvided(source.offerDigest) && offerDigest === null
  };
}

function shaReason(receipt, commitSha) {
  if (!receipt.commitSha) return REASON.COMMIT_SHA_MISSING;
  return receipt.commitSha === commitSha ? null : REASON.COMMIT_SHA_MISMATCH;
}

function testReason(receipt) {
  if (receipt.passCount === null || receipt.failCount === null) return REASON.TEST_COUNTS_INVALID;
  if (receipt.failCount > 0) return REASON.TEST_FAILURES_PRESENT;
  if (receipt.passCount < 1) return REASON.TEST_PASS_COUNT_ZERO;
  if (receipt.baselineComparison === null) return REASON.BASELINE_COMPARISON_MISSING;
  if (receipt.baselineComparison === 'REGRESSED') return REASON.TEST_REGRESSION_AGAINST_BASELINE;
  if (receipt.baselineComparison === 'NOT_COMPARED') return REASON.BASELINE_NOT_COMPARED;
  return null;
}

function healthReason(receipt, latestDeploymentTime) {
  if (receipt.healthy !== true) return REASON.HEALTH_NOT_HEALTHY;
  return receipt.provenance.time > latestDeploymentTime ? null : REASON.HEALTH_NOT_NEWER_THAN_DEPLOYMENT;
}

// Returns [] when some receipt satisfies the rule, otherwise the distinct failing codes.
function judge(receipts, reasonFor) {
  if (receipts.length === 0) return [REASON.RECEIPT_MISSING];
  const failures = [];
  for (const receipt of receipts) {
    const code = reasonFor(receipt);
    if (code === null) return [];
    failures.push(code);
  }
  return uniq(failures);
}

function commitGate(ctx) {
  if (ctx.target.commitSha) return [];
  return [ctx.target.commitInvalid ? REASON.TARGET_COMMIT_INVALID : REASON.TARGET_COMMIT_NOT_DECLARED];
}

// A dependency must itself be REAL. A simulated dependency is named as such, so the
// reason never reads like a missing receipt.
function dependencyGate(ctx, claim, missingCode) {
  const state = ctx.states[claim];
  if (state === REAL) return [];
  return [state === SIMULATED_ONLY ? REASON.DEPENDENCY_SIMULATED_ONLY : missingCode];
}

const RULES = Object.freeze({
  'code-completed': {
    gate: commitGate,
    check: (ctx, real) => judge(real, receipt => shaReason(receipt, ctx.target.commitSha))
  },
  'tests-passed': {
    check: (ctx, real) => judge(real, testReason)
  },
  'ci-verified': {
    gate: commitGate,
    check: (ctx, real) => judge(real, receipt => (
      shaReason(receipt, ctx.target.commitSha)
      ?? (receipt.conclusion === 'success' ? null : REASON.CI_CONCLUSION_NOT_SUCCESS)
    ))
  },
  deployed: {
    gate: commitGate,
    check: (ctx, real) => judge(real, receipt => shaReason(receipt, ctx.target.commitSha))
  },
  'live-healthy': {
    gate: ctx => [...commitGate(ctx), ...dependencyGate(ctx, 'deployed', REASON.DEPLOYMENT_NOT_EVIDENCED)],
    check: (ctx, real) => {
      const deployments = ctx.valid.filter(receipt => (
        receipt.type === 'deployment'
        && receipt.provenance.kind === 'REAL'
        && receipt.commitSha === ctx.target.commitSha
      ));
      const latest = Math.max(...deployments.map(receipt => receipt.provenance.time));
      if (!Number.isFinite(latest)) return [REASON.DEPLOYMENT_NOT_EVIDENCED];
      return judge(real, receipt => shaReason(receipt, ctx.target.commitSha) ?? healthReason(receipt, latest));
    }
  },
  'authorized-to-send': {
    check: (ctx, real) => judge(real, receipt => (receipt.authorized ? null : REASON.AUTHORIZATION_NOT_GRANTED))
  },
  'real-communication-sent': {
    check: (ctx, real) => judge(real, receipt => (
      receipt.providerConfirmed ? null : REASON.PROVIDER_CONFIRMATION_MISSING
    ))
  },
  'customer-accepted': {
    gate: ctx => (ctx.target.offerDigest
      ? []
      : [ctx.target.offerDigestInvalid ? REASON.TARGET_OFFER_DIGEST_INVALID : REASON.OFFER_DIGEST_NOT_DECLARED]),
    check: (ctx, real) => judge(real, receipt => {
      if (receipt.offerDigest === null) return REASON.OFFER_DIGEST_MISSING;
      if (receipt.offerDigest !== ctx.target.offerDigest) return REASON.OFFER_DIGEST_MISMATCH;
      return receipt.accepted ? null : REASON.ACCEPTANCE_NOT_GRANTED;
    })
  },
  'payment-initiated': {
    check: (ctx, real) => judge(real, () => null)
  },
  'payment-settled': {
    gate: ctx => dependencyGate(ctx, 'payment-initiated', REASON.PAYMENT_INITIATED_NOT_REAL),
    check: (ctx, real) => {
      const initiatedTimes = ctx.valid
        .filter(receipt => receipt.type === 'payment-initiated' && receipt.provenance.kind === 'REAL')
        .map(receipt => receipt.provenance.time);
      return judge(real, receipt => {
        if (receipt.providerReceiptId === null) return REASON.PROVIDER_RECEIPT_ID_MISSING;
        return initiatedTimes.some(time => time <= receipt.provenance.time) ? null : REASON.PAYMENT_ORDER_INVALID;
      });
    }
  },
  'cash-cleared': {
    gate: ctx => dependencyGate(ctx, 'payment-settled', REASON.PAYMENT_SETTLED_NOT_REAL),
    check: (ctx, real) => {
      // Only a settlement that the payment-settled rule accepts can clear cash: it must follow a REAL payment-initiated.
      const initiatedTimes = ctx.valid
        .filter(receipt => receipt.type === 'payment-initiated' && receipt.provenance.kind === 'REAL')
        .map(receipt => receipt.provenance.time);
      const settled = real.filter(receipt => receipt.type === 'payment-settled'
        && receipt.providerReceiptId !== null
        && initiatedTimes.some(time => time <= receipt.provenance.time));
      const funds = real.filter(receipt => receipt.type === 'cleared-funds');
      if (settled.length === 0) return [REASON.PAYMENT_SETTLED_NOT_REAL];
      if (funds.length === 0) return [REASON.CLEARED_FUNDS_RECEIPT_MISSING];
      const paired = funds.some(fund => fund.cleared
        && settled.some(payment => payment.providerReceiptId === fund.providerReceiptId));
      if (paired) return [];
      if (!funds.some(fund => fund.cleared)) return [REASON.CLEARED_FUNDS_NOT_CONFIRMED];
      return [REASON.CLEARED_FUNDS_PROVIDER_MISMATCH];
    }
  }
});

// Claims are evaluated in declared order, so a dependency's state is known before the
// claim that reads it. Every dependency points to an earlier claim.
function deriveClaim(claim, ctx, rejectedByType) {
  const types = RECEIPT_TYPES_BY_CLAIM[claim];
  const relevant = ctx.valid.filter(receipt => types.includes(receipt.type));
  const rejectedCodes = uniq(types.flatMap(type => rejectedByType.get(type) ?? []));
  const evidenceCount = relevant.length;
  if (relevant.some(receipt => receipt.provenance.kind !== 'REAL')) {
    return {
      state: SIMULATED_ONLY,
      evidenceCount,
      blockingReasonCodes: uniq([REASON.SIMULATED_RECEIPT_ATTACHED, ...rejectedCodes])
    };
  }
  const rule = RULES[claim];
  const gate = rule.gate ? rule.gate(ctx) : [];
  let codes;
  if (relevant.length === 0) codes = uniq([...gate, REASON.RECEIPT_MISSING]);
  else if (gate.length > 0) codes = gate;
  else codes = rule.check(ctx, relevant);
  if (codes.length === 0) return { state: REAL, evidenceCount, blockingReasonCodes: [] };
  return { state: NOT_EVIDENCED, evidenceCount, blockingReasonCodes: uniq([...codes, ...rejectedCodes]) };
}

// Pure. Takes caller-supplied receipts and a declared target. Each claim is derived
// from receipts alone; the target only binds commit- and offer-bound claims.
export function deriveRevenueTruthLedger({ receipts = [], target = {} } = {}) {
  const normalizedTarget = normalizeTarget(target);
  const input = Array.isArray(receipts) ? receipts : [];
  const rejectedReceipts = Array.isArray(receipts) ? [] : [{ index: null, reasonCode: REASON.RECEIPTS_NOT_ARRAY }];
  const valid = [];
  const rejectedByType = new Map();
  input.forEach((raw, index) => {
    const outcome = normalizeReceipt(raw);
    if (outcome.receipt) {
      valid.push(outcome.receipt);
      return;
    }
    rejectedReceipts.push({ index, reasonCode: outcome.reasonCode });
    if (outcome.type) {
      rejectedByType.set(outcome.type, [...(rejectedByType.get(outcome.type) ?? []), outcome.reasonCode]);
    }
  });

  const states = {};
  const claims = REVENUE_TRUTH_CLAIMS.map(claim => {
    const outcome = deriveClaim(claim, { target: normalizedTarget, valid, states }, rejectedByType);
    states[claim] = outcome.state;
    return {
      claim,
      label: REVENUE_TRUTH_LABELS[claim],
      state: outcome.state,
      evidenceCount: outcome.evidenceCount,
      blockingReasonCodes: outcome.blockingReasonCodes
    };
  });
  const countOf = state => claims.filter(entry => entry.state === state).length;
  return {
    version: REVENUE_TRUTH_LEDGER_VERSION,
    target: { commitSha: normalizedTarget.commitSha, offerDigest: normalizedTarget.offerDigest },
    claims,
    summary: {
      real: countOf(REAL),
      simulatedOnly: countOf(SIMULATED_ONLY),
      notEvidenced: countOf(NOT_EVIDENCED)
    },
    receiptCounts: {
      total: input.length,
      valid: valid.length,
      rejected: input.length - valid.length,
      real: valid.filter(receipt => receipt.provenance.kind === 'REAL').length,
      simulated: valid.filter(receipt => receipt.provenance.kind === 'SIMULATED').length,
      fixture: valid.filter(receipt => receipt.provenance.kind === 'FIXTURE').length
    },
    rejectedReceipts,
    claimBoundary: 'DERIVED_ONLY_FROM_EXPLICIT_RECEIPTS__SIMULATED_AND_FIXTURE_NEVER_REAL__NO_CONSEQUENCE_AUTHORITY'
  };
}

// Plain text. Every claim line starts with its fixed label, so no two claims can be
// confused. Only labels, states, counts and fixed reason codes are printed.
export function renderRevenueTruthText(ledger) {
  const claims = Array.isArray(ledger?.claims) ? ledger.claims : [];
  const lines = [
    'REVENUE TRUTH LEDGER: each claim derives only from explicit receipts',
    'CLAIM BOUNDARY: SIMULATED and FIXTURE receipts never count as REAL; no consequence authority'
  ];
  for (const entry of claims) {
    const blocking = entry.blockingReasonCodes.length ? entry.blockingReasonCodes.join(', ') : 'NONE';
    lines.push(`${entry.label}: ${entry.state} | evidence ${entry.evidenceCount} | blocking ${blocking}`);
  }
  const counts = ledger.receiptCounts;
  lines.push(
    `SUMMARY: REAL ${ledger.summary.real} | SIMULATED_ONLY ${ledger.summary.simulatedOnly}`
    + ` | NOT_EVIDENCED ${ledger.summary.notEvidenced}`
  );
  lines.push(
    `RECEIPTS: valid ${counts.valid} | rejected ${counts.rejected} | real ${counts.real}`
    + ` | simulated ${counts.simulated} | fixture ${counts.fixture}`
  );
  return lines.join('\n');
}

// The model a display reads: the ledger plus its rendered text.
export function buildRevenueTruthDashboard(input = {}) {
  const ledger = deriveRevenueTruthLedger(input);
  return { ...ledger, text: renderRevenueTruthText(ledger) };
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(item => stableStringify(item)).join(',')}]`;
  if (isPlainObject(value)) {
    const body = Object.keys(value).sort()
      .map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(',');
    return `{${body}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function digestOf(value) {
  return `sha256:${createHash('sha256').update(stableStringify(value)).digest('hex')}`;
}

// Maps a runRevenueDryRun result into SIMULATED receipts, one per stage. Each receipt
// carries a digest of its stage and no stage facts, so a rehearsal cannot leak as a
// claim value. The mapping never emits payment-settled, cleared-funds, communication,
// deployment, CI, test or health receipts, so it cannot mark cash-cleared.
export function simulatedReceiptsFromDryRun(result, { observedAt = SIMULATED_RECEIPT_OBSERVED_AT } = {}) {
  if (!isPlainObject(result) || result.version !== REVENUE_DRY_RUN_VERSION || !Array.isArray(result.stages)) {
    return [];
  }
  if (isoTime(observedAt) === null) return [];
  const stages = result.stages.filter(stage => isPlainObject(stage) && DRY_RUN_STAGE_SET.has(stage.stage));
  const offerStage = stages.find(stage => stage.stage === 'offer-draft');
  const offerDigest = offerStage ? digestOf(offerStage) : null;
  return stages.map(stage => {
    const type = DRY_RUN_STAGE_RECEIPT_TYPE.get(stage.stage) ?? DRY_RUN_RECEIPT_TYPE;
    const receipt = {
      type,
      stage: stage.stage,
      stageStatus: typeof stage.status === 'string' ? stage.status : 'UNKNOWN',
      provenance: { kind: 'SIMULATED', source: DRY_RUN_SOURCE, digest: digestOf(stage), observedAt }
    };
    if (type === 'acceptance') receipt.offerDigest = offerDigest;
    return receipt;
  });
}
