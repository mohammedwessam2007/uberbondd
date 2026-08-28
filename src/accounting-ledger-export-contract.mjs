import crypto from 'node:crypto';

export const ACCOUNTING_LEDGER_EXPORT_POLICY_VERSION = 'accounting-ledger-export-contract-1.0.0';
export const ACCOUNTING_SOURCE_TRUTH_CLASSES = Object.freeze([
  'CLEARED_PAYMENT',
  'REFUND_OR_DISPUTE',
  'PROVIDER_FEE_CLEARED',
  'AUTHORIZED_EXPENSE_CLEARED'
]);

const ZERO_EFFECTS = Object.freeze({
  providerCalls: 0,
  messages: 0,
  purchases: 0,
  deployments: 0,
  credentialChanges: 0,
  dnsChanges: 0,
  productionMutations: 0,
  spendCents: 0
});

const SENSITIVE_KEYS = /(?:customer|email|phone|address|bank|card|iban|routing|accountnumber|taxid|vatid|password|secret|token|authorization|cookie|credential|api[_-]?key|raw(?:payload|body|value)|description|memo|note)/i;
const FORBIDDEN_TAX_CALC_KEYS = /^(?:taxRate|taxRateBps|taxAmount|taxAmountCents|vatRate|vatAmount|vatAmountCents)$/i;
const SAFE_REFERENCE_KEYS = new Set([
  'sourceReceiptRef', 'accountingPolicyRef', 'mappingPolicyRef', 'accountRef',
  'evidenceRef', 'memoRef', 'taxEvidenceRef'
]);

function clone(value) { return structuredClone(value); }
function text(value, max = 240) {
  const string = String(value ?? '').trim();
  return string && string.length <= max ? string : null;
}
function iso(value) {
  const string = text(value, 80);
  if (!string) return null;
  const date = new Date(string);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
function cents(value) { return Number.isSafeInteger(value) && value >= 0 ? value : null; }
function currency(value) {
  const code = String(value ?? '').trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : null;
}
function digest(value) { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function invalid(reasonCodes, extra = {}) {
  return {
    ok: false,
    policyVersion: ACCOUNTING_LEDGER_EXPORT_POLICY_VERSION,
    reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
    businessEffectAuthority: 'NONE',
    externalEffectLedger: clone(ZERO_EFFECTS),
    ...extra
  };
}
function inspectKeys(value, depth = 0, seen = new WeakSet()) {
  if (!value || typeof value !== 'object' || depth > 6) return { sensitive: [], taxCalc: [] };
  if (seen.has(value)) return { sensitive: [], taxCalc: [] };
  seen.add(value);
  const sensitive = [];
  const taxCalc = [];
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_TAX_CALC_KEYS.test(String(key))) taxCalc.push(String(key));
    if (SENSITIVE_KEYS.test(String(key)) && !SAFE_REFERENCE_KEYS.has(String(key))) sensitive.push(String(key));
    if (child && typeof child === 'object') {
      const nested = inspectKeys(child, depth + 1, seen);
      sensitive.push(...nested.sensitive);
      taxCalc.push(...nested.taxCalc);
    }
  }
  return {
    sensitive: [...new Set(sensitive)].slice(0, 20),
    taxCalc: [...new Set(taxCalc)].slice(0, 20)
  };
}

function normalizeLines(lines) {
  if (!Array.isArray(lines) || lines.length < 2 || lines.length > 20) return null;
  const normalized = [];
  for (const line of lines) {
    if (!line || typeof line !== 'object' || Array.isArray(line)) return null;
    const accountRef = text(line.accountRef, 200);
    const debitCents = cents(line.debitCents);
    const creditCents = cents(line.creditCents);
    const evidenceRef = line.evidenceRef == null ? null : text(line.evidenceRef, 240);
    const memoRef = line.memoRef == null ? null : text(line.memoRef, 240);
    if (!accountRef || debitCents == null || creditCents == null) return null;
    if ((debitCents > 0) === (creditCents > 0)) return null;
    normalized.push({ accountRef, debitCents, creditCents, evidenceRef, memoRef });
  }
  return normalized;
}

export function compileAccountingJournalProposal(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return invalid(['accounting-journal-object-required']);
  }
  const sourceReceiptRef = text(input.sourceReceiptRef, 240);
  const sourceTruthClass = String(input.sourceTruthClass ?? '').trim().toUpperCase();
  const amountCents = cents(input.amountCents);
  const currencyCode = currency(input.currency);
  const occurredAt = iso(input.occurredAt);
  const compiledAt = iso(input.compiledAt);
  const accountingPolicyRef = text(input.accountingPolicyRef, 240);
  const mappingPolicyRef = text(input.mappingPolicyRef, 240);
  const taxEvidenceRef = input.taxEvidenceRef == null ? null : text(input.taxEvidenceRef, 240);
  const lines = normalizeLines(input.lines);
  const reasonCodes = [];
  if (!sourceReceiptRef) reasonCodes.push('canonical-source-receipt-ref-required');
  if (!ACCOUNTING_SOURCE_TRUTH_CLASSES.includes(sourceTruthClass)) reasonCodes.push('unsupported-accounting-source-truth-class');
  if (amountCents == null || amountCents <= 0) reasonCodes.push('positive-source-amount-cents-required');
  if (!currencyCode) reasonCodes.push('iso-currency-required');
  if (!occurredAt) reasonCodes.push('occurred-at-required');
  if (!compiledAt) reasonCodes.push('compiled-at-required');
  if (occurredAt && compiledAt && new Date(occurredAt).getTime() > new Date(compiledAt).getTime() + 300_000) {
    reasonCodes.push('future-dated-accounting-source');
  }
  if (!accountingPolicyRef) reasonCodes.push('accounting-policy-ref-required');
  if (!mappingPolicyRef) reasonCodes.push('mapping-policy-ref-required');
  if (!lines) reasonCodes.push('valid-double-entry-lines-required');
  if (lines) {
    const debitTotal = lines.reduce((sum, line) => sum + line.debitCents, 0);
    const creditTotal = lines.reduce((sum, line) => sum + line.creditCents, 0);
    if (debitTotal !== creditTotal) reasonCodes.push('journal-entry-unbalanced');
    if (debitTotal !== amountCents || creditTotal !== amountCents) reasonCodes.push('journal-total-must-match-source-amount');
  }
  const inspected = inspectKeys(input);
  if (inspected.sensitive.length) reasonCodes.push('raw-accounting-pii-bank-secret-or-free-text-prohibited');
  if (inspected.taxCalc.length) reasonCodes.push('tax-calculation-not-authorized-in-accounting-export');

  const proposal = {
    schemaVersion: 'accounting-journal-proposal-1.0.0',
    sourceReceiptRef,
    sourceTruthClass,
    amountCents,
    currency: currencyCode,
    occurredAt,
    compiledAt,
    accountingPolicyRef,
    mappingPolicyRef,
    taxEvidenceRef,
    lines: lines || [],
    accountingTruthAuthority: 'DERIVATIVE_EXPORT_ONLY',
    taxTruthAuthority: taxEvidenceRef ? 'REFERENCE_ONLY' : 'NONE',
    externalAccountingWriteAuthority: 'NONE',
    moneyMovementAuthority: 'NONE',
    taxFilingAuthority: 'NONE',
    durablePayloadClass: 'REFERENCE_ONLY_NO_CUSTOMER_PII_NO_BANK_CREDENTIALS_NO_FREE_TEXT'
  };
  proposal.proposalId = sourceReceiptRef && sourceTruthClass && currencyCode && amountCents > 0 && lines
    ? `acct_prop_${digest(proposal).slice(0, 32)}`
    : null;
  if (reasonCodes.length) {
    return invalid(reasonCodes, {
      proposal,
      prohibitedKeys: inspected.sensitive,
      forbiddenTaxCalculationKeys: inspected.taxCalc
    });
  }
  return {
    ok: true,
    policyVersion: ACCOUNTING_LEDGER_EXPORT_POLICY_VERSION,
    status: 'ACCOUNTING_JOURNAL_PROPOSAL_PREPARED_LOCAL_ONLY',
    proposal,
    businessEffectAuthority: 'NONE',
    externalEffectLedger: clone(ZERO_EFFECTS)
  };
}

export function compileAccountingExportBatch(inputs = []) {
  if (!Array.isArray(inputs)) return invalid(['accounting-batch-array-required']);
  if (inputs.length === 0) return invalid(['accounting-batch-entry-required']);
  if (inputs.length > 1000) return invalid(['accounting-batch-too-large']);
  const entries = [];
  const duplicates = [];
  const conflicts = [];
  const errors = [];
  const bySource = new Map();
  inputs.forEach((input, index) => {
    const compiled = compileAccountingJournalProposal(input);
    if (!compiled.ok) {
      errors.push({ index, reasonCodes: compiled.reasonCodes });
      return;
    }
    const proposal = compiled.proposal;
    const prior = bySource.get(proposal.sourceReceiptRef);
    if (!prior) {
      bySource.set(proposal.sourceReceiptRef, proposal);
      entries.push(proposal);
    } else if (JSON.stringify(prior) === JSON.stringify(proposal)) {
      duplicates.push({ index, sourceReceiptRef: proposal.sourceReceiptRef, proposalId: proposal.proposalId });
    } else {
      conflicts.push({ index, sourceReceiptRef: proposal.sourceReceiptRef, priorProposalId: prior.proposalId, proposalId: proposal.proposalId });
    }
  });
  if (errors.length || conflicts.length) {
    return invalid([
      ...(errors.length ? ['invalid-accounting-batch-entry'] : []),
      ...(conflicts.length ? ['conflicting-accounting-proposals-for-source-receipt'] : [])
    ], { status: 'ACCOUNTING_EXPORT_REVIEW_REQUIRED', errors, conflicts, duplicates });
  }
  const totalsByCurrency = {};
  for (const entry of entries) {
    const row = totalsByCurrency[entry.currency] || { debitCents: 0, creditCents: 0, entryCount: 0 };
    row.debitCents += entry.lines.reduce((sum, line) => sum + line.debitCents, 0);
    row.creditCents += entry.lines.reduce((sum, line) => sum + line.creditCents, 0);
    row.entryCount += 1;
    totalsByCurrency[entry.currency] = row;
  }
  return {
    ok: true,
    policyVersion: ACCOUNTING_LEDGER_EXPORT_POLICY_VERSION,
    status: 'ACCOUNTING_EXPORT_BATCH_PREPARED_LOCAL_ONLY',
    entries,
    duplicates,
    totalsByCurrency,
    currencyRule: 'CURRENCIES_REMAIN_SEPARATE_NO_IMPLICIT_FX',
    accountingTruthAuthority: 'DERIVATIVE_EXPORT_ONLY',
    externalAccountingWriteAuthority: 'NONE',
    moneyMovementAuthority: 'NONE',
    taxFilingAuthority: 'NONE',
    businessEffectAuthority: 'NONE',
    externalEffectLedger: clone(ZERO_EFFECTS)
  };
}
