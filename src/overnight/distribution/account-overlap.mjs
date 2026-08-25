import {
  baseReceipt,
  digest,
  hasContactLikeFields,
  iso,
  key,
  list,
  publicHttpsUrl,
  text,
  unique,
  isSuppressed
} from './policy.mjs';

export const ACCOUNT_OVERLAP_POLICY_VERSION = 'overnight-distribution.account-overlap-1.0.0';

export const ACCOUNT_SOURCE_TYPES = Object.freeze([
  'OWNER_IMPORT', 'PUBLIC_SOURCE', 'LICENSED_PROVIDER', 'CUSTOMER_RECORD'
]);

function reject(reason, extra = {}) {
  return baseReceipt({ status: 'REJECTED', reasonCodes: [reason], extra });
}

function domain(value) {
  const raw = key(value, 180).replace(/^https?:\/\//, '').split('/')[0].replace(/^www\./, '');
  return raw && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(raw) ? raw : '';
}

/** Normalize one explicit account identity; no person/contact data is accepted. */
export function normalizeAccountRecord(input = {}, { now = new Date() } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return reject('account-object-required');
  if (hasContactLikeFields(input)) return reject('contact-data-not-accepted-in-account-overlap');
  if (input.privateData === true || input.sourceType === 'PRIVATE_SCRAPED') return reject('private-or-scraped-account-data-forbidden');

  const accountId = text(input.accountId || input.id, 180);
  const name = text(input.name || input.companyName, 220);
  const sourceType = text(input.sourceType || input.source, 80).toUpperCase();
  const accountDomain = domain(input.domain || input.website);
  if (!accountId) return reject('account-id-required');
  if (!ACCOUNT_SOURCE_TYPES.includes(sourceType)) return reject(`unsupported-account-source:${sourceType || 'EMPTY'}`);
  if (input.domain && !accountDomain) return reject('account-domain-invalid');

  const sourceUrl = input.sourceUrl == null ? null : publicHttpsUrl(input.sourceUrl);
  if (input.sourceUrl && !sourceUrl) return reject('account-source-url-must-be-public-https');
  if (['PUBLIC_SOURCE', 'LICENSED_PROVIDER'].includes(sourceType) && !sourceUrl) return reject('account-source-url-required');

  const observedAt = iso(input.observedAt, now);
  if (!observedAt) return reject('account-observed-time-required');
  const evidenceRefs = unique([
    ...list(input.evidenceRefs, 20, 220),
    ...(sourceUrl ? [sourceUrl] : [])
  ]);
  const account = {
    version: ACCOUNT_OVERLAP_POLICY_VERSION,
    accountId,
    name,
    domain: accountDomain,
    sourceType,
    sourceUrl,
    evidenceRefs,
    observedAt,
    identityStatus: 'EXPLICIT_ACCOUNT_IDENTITY',
    privateData: false,
    contactAuthority: 'NONE',
    externalAction: 'DISABLED',
    accountDigest: digest({ accountId, domain: accountDomain, sourceType, sourceUrl, evidenceRefs })
  };
  return baseReceipt({ status: 'PREPARE_ONLY', extra: { account } });
}

function normalizeCollection(records, now) {
  const accepted = [];
  const rejected = [];
  for (const raw of Array.isArray(records) ? records.slice(0, 500) : []) {
    const result = raw?.version === ACCOUNT_OVERLAP_POLICY_VERSION
      ? { ok: true, account: raw }
      : normalizeAccountRecord(raw, { now });
    if (result.ok) accepted.push(result.account);
    else rejected.push({ inputId: text(raw?.accountId || raw?.id, 180) || null, reasonCodes: result.reasonCodes });
  }
  const byIdentity = new Map();
  for (const account of accepted) {
    const prior = byIdentity.get(account.accountId);
    if (!prior) byIdentity.set(account.accountId, account);
    else if (prior.accountDigest !== account.accountDigest) {
      rejected.push({ inputId: account.accountId, reasonCodes: ['account-identity-conflict'] });
      byIdentity.delete(account.accountId);
    }
  }
  return { accounts: [...byIdentity.values()], rejected };
}

function candidatesFor(partnerAccount, targetAccounts) {
  const matches = [];
  for (const target of targetAccounts) {
    const sameId = partnerAccount.accountId === target.accountId;
    const sameDomain = Boolean(partnerAccount.domain && target.domain && partnerAccount.domain === target.domain);
    if (sameId || sameDomain) {
      matches.push({
        target,
        overlapType: sameId ? 'EXPLICIT_ACCOUNT_ID' : 'PUBLIC_DOMAIN_MATCH',
        confidence: sameId ? 0.8 : 0.6
      });
    }
  }
  return matches;
}

/**
 * Produce co-sell hypotheses from explicit account identity overlap. An
 * overlap is an inferred route hypothesis, never proof of buyer intent,
 * permission to contact, a partnership, or revenue attribution.
 */
export function buildAccountOverlapHypotheses({
  partnerId = '',
  partnerAccounts = [],
  targetAccounts = [],
  suppressions = [],
  date = new Date()
} = {}) {
  const normalizedPartnerId = text(partnerId, 180);
  if (!normalizedPartnerId) return reject('partner-id-required', { hypotheses: [], rejected: [] });
  const partner = normalizeCollection(partnerAccounts, date);
  const target = normalizeCollection(targetAccounts, date);
  const hypotheses = [];
  const suppressed = [];
  const blocked = [];
  const seen = new Set();

  for (const partnerAccount of partner.accounts) {
    for (const match of candidatesFor(partnerAccount, target.accounts)) {
      const targetAccount = match.target;
      const suppressionValues = [partnerAccount.accountId, partnerAccount.domain, targetAccount.accountId, targetAccount.domain];
      if (isSuppressed(suppressionValues, suppressions)) {
        suppressed.push({ partnerAccountId: partnerAccount.accountId, targetAccountId: targetAccount.accountId, reason: 'suppressed-overlap-account' });
        continue;
      }
      const hypothesisKey = `${normalizedPartnerId}:${partnerAccount.accountId}:${targetAccount.accountId}`;
      if (seen.has(hypothesisKey)) continue;
      seen.add(hypothesisKey);
      const evidenceRefs = unique([...partnerAccount.evidenceRefs, ...targetAccount.evidenceRefs]);
      hypotheses.push({
        hypothesisId: `cosell_${digest({ partnerId: normalizedPartnerId, hypothesisKey }).slice(0, 24)}`,
        partnerId: normalizedPartnerId,
        partnerAccountId: partnerAccount.accountId,
        targetAccountId: targetAccount.accountId,
        overlapType: match.overlapType,
        evidenceClass: 'INFERENCE',
        confidence: match.confidence,
        evidenceRefs,
        status: 'PREPARATION_ONLY',
        coSellAction: 'OWNER_REVIEW_ONLY',
        buyerIntent: 'UNPROVEN',
        partnerContact: 'DISABLED',
        externalAction: 'DISABLED'
      });
    }
  }

  return baseReceipt({
    status: 'PREPARATION_ONLY',
    date,
    extra: {
      partnerId: normalizedPartnerId,
      hypotheses,
      suppressed,
      rejected: [...partner.rejected, ...target.rejected, ...blocked],
      counts: {
        partnerAccounts: partner.accounts.length,
        targetAccounts: target.accounts.length,
        hypotheses: hypotheses.length,
        suppressed: suppressed.length,
        rejected: partner.rejected.length + target.rejected.length
      },
      note: 'Account overlap is a co-sell hypothesis only. It never authorizes partner contact or proves buyer intent.'
    }
  });
}

