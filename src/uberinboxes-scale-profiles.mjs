import crypto from 'node:crypto';
import { UBERDOSO_ROOTS } from './uberdoso-kernel.mjs';

export const UBERINBOXES_SCALE_VERSION = 'uberbond.uberinboxes-scale.v1';

// Current provider facts are evidence, not eternal constants. Every profile is
// date-bound and carries its source. Callers must refresh or replace stale
// profiles rather than silently treating old marketing/docs as current truth.
export const UBERINBOXES_SCALE_PROFILES = Object.freeze({
  ICEMAIL_AZURE_2026_09_14: Object.freeze({
    provider: 'icemail',
    infrastructureClass: 'AZURE_HIGH_VOLUME',
    observedAt: '2026-09-14T20:20:00.000Z',
    maxEvidenceAgeDays: 30,
    sourceUrls: Object.freeze([
      'https://help.icemail.ai/en/articles/54-%F0%9F%93%AC-faqs-mailbox-management-in-icemailai',
      'https://icemail.ai/pricing'
    ]),
    // Official Icemail docs observed 2026-09-14: up to 100 Azure mailboxes per
    // domain; up to 10 total messages/day per mailbox, split as 5 cold + 5 warm.
    maxMailboxesPerDomain: 100,
    maxColdDailyPerMailbox: 5,
    maxWarmDailyPerMailbox: 5,
    priceEvidence: Object.freeze({
      // Current pricing page said $29/domain/mo while help article said $30.
      // Keep the conflict explicit and require a live quote before spending.
      lowerMonthlyPerDomainCents: 2900,
      upperMonthlyPerDomainCents: 3000,
      quoteRequiredBeforePurchase: true
    })
  }),
  ICEMAIL_SMTP_2026_09_14: Object.freeze({
    provider: 'icemail',
    infrastructureClass: 'SMTP_DEDICATED_IP_PER_DOMAIN',
    observedAt: '2026-09-14T20:20:00.000Z',
    maxEvidenceAgeDays: 30,
    sourceUrls: Object.freeze([
      'https://help.icemail.ai/en/articles/54-%F0%9F%93%AC-faqs-mailbox-management-in-icemailai',
      'https://icemail.ai/pricing'
    ]),
    // Official FAQ observed 2026-09-14: up to 10 SMTP mailboxes/domain and
    // up to 50 total emails/day/mailbox. It did not label all 50 as cold.
    maxMailboxesPerDomain: 10,
    maxTotalDailyPerMailbox: 50,
    maxColdDailyPerMailbox: null,
    priceEvidence: Object.freeze({ quoteRequiredBeforePurchase: true })
  })
});

function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function dayAge(observedAt, now) {
  const observed = Date.parse(String(observedAt || ''));
  const current = now instanceof Date ? now.getTime() : Date.parse(String(now || ''));
  if (!Number.isFinite(observed) || !Number.isFinite(current)) return Infinity;
  return (current - observed) / 86400000;
}

function optionalNonNegativeNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function founderAlias(index) {
  const n = String(index + 1).padStart(3, '0');
  return `mohamed.${n}`;
}

/**
 * Compile a provider-managed UberInboxes fleet whose density is bound to fresh
 * provider evidence instead of UberDoso's self-hosted Postal density policy.
 * This does not create any mailbox or send authority.
 */
export function compileScaledUberInboxesFleet({
  profile = UBERINBOXES_SCALE_PROFILES.ICEMAIL_AZURE_2026_09_14,
  roots = UBERDOSO_ROOTS,
  existingMailboxes = [],
  now = new Date()
} = {}) {
  const normalizedRoots = [...new Set((Array.isArray(roots) ? roots : []).map(value => String(value || '').trim().toLowerCase()).filter(Boolean))];
  const canonical = [...UBERDOSO_ROOTS].sort();
  if (normalizedRoots.length !== canonical.length || normalizedRoots.sort().some((value, index) => value !== canonical[index])) {
    return { ok: false, version: UBERINBOXES_SCALE_VERSION, status: 'SCALE_PROFILE_REFUSED', reasonCodes: ['exact-owned-roots-required'], externalEffectAuthority: 'NONE' };
  }

  const age = dayAge(profile?.observedAt, now);
  if (!Number.isFinite(age) || age < -0.01 || age > Number(profile?.maxEvidenceAgeDays || 0)) {
    return { ok: false, version: UBERINBOXES_SCALE_VERSION, status: 'SCALE_PROFILE_STALE', reasonCodes: ['fresh-provider-capacity-evidence-required'], evidenceAgeDays: Number.isFinite(age) ? Number(age.toFixed(3)) : null, externalEffectAuthority: 'NONE' };
  }

  const density = Number(profile?.maxMailboxesPerDomain);
  if (!Number.isInteger(density) || density < 1 || density > 1000) {
    return { ok: false, version: UBERINBOXES_SCALE_VERSION, status: 'SCALE_PROFILE_REFUSED', reasonCodes: ['numeric-provider-density-required'], externalEffectAuthority: 'NONE' };
  }

  const existing = new Set((Array.isArray(existingMailboxes) ? existingMailboxes : [])
    .map(item => String(item?.address || item?.email || '').trim().toLowerCase())
    .filter(Boolean));

  const desired = [];
  for (const root of normalizedRoots) {
    for (let index = 0; index < density; index += 1) {
      const localPart = founderAlias(index);
      const address = `${localPart}@${root}`;
      desired.push({
        mailboxId: `uberinboxes:${profile.provider}:${profile.infrastructureClass}:${address}`,
        address,
        domain: root,
        localPart,
        identityClass: 'FOUNDER_ALIAS',
        infrastructureClass: profile.infrastructureClass,
        desiredState: 'PROVISIONED_NOT_AUTHORIZED_TO_SEND',
        alreadyExists: existing.has(address)
      });
    }
  }

  const missing = desired.filter(item => !item.alreadyExists);
  const providerColdCap = optionalNonNegativeNumber(profile?.maxColdDailyPerMailbox);
  const providerWarmCap = optionalNonNegativeNumber(profile?.maxWarmDailyPerMailbox);
  const providerTotalCap = optionalNonNegativeNumber(profile?.maxTotalDailyPerMailbox);
  const theoreticalColdDailyCap = providerColdCap != null
    ? desired.length * providerColdCap
    : null;
  const theoreticalTotalDailyCap = providerTotalCap != null
    ? desired.length * providerTotalCap
    : (providerColdCap != null && providerWarmCap != null
      ? desired.length * (providerColdCap + providerWarmCap)
      : null);

  const fleet = {
    schemaVersion: 'uberinboxes.scaled-fleet.v1',
    provider: profile.provider,
    infrastructureClass: profile.infrastructureClass,
    roots: [...normalizedRoots],
    sourceUrls: [...(profile.sourceUrls || [])],
    providerEvidenceObservedAt: profile.observedAt,
    desiredMailboxCount: desired.length,
    existingMailboxCount: desired.length - missing.length,
    missingMailboxCount: missing.length,
    maxMailboxesPerDomain: density,
    theoreticalColdDailyCap,
    theoreticalTotalDailyCap,
    desired,
    missing,
    byDomain: Object.fromEntries(normalizedRoots.map(root => [root, missing.filter(item => item.domain === root)])),
    priceEvidence: profile.priceEvidence || null,
    sendAuthorityCreated: false,
    externalEffectAuthority: 'NONE',
    truthBoundary: 'Provider-advertised capacity is a topology envelope only. Actual cold-send capacity remains zero until mailboxes are observed, authenticated, warmed, healthy, provider-capped and outreach-authorized.'
  };
  fleet.fleetDigest = digest(fleet);

  return {
    ok: true,
    version: UBERINBOXES_SCALE_VERSION,
    status: missing.length ? 'SCALED_UBERINBOXES_READY_TO_PROVISION' : 'SCALED_UBERINBOXES_ALREADY_OBSERVED',
    fleet,
    externalEffectAuthority: 'NONE'
  };
}

export function compareUberInboxesProfiles({ profiles = Object.values(UBERINBOXES_SCALE_PROFILES), roots = UBERDOSO_ROOTS, now = new Date() } = {}) {
  const rows = (Array.isArray(profiles) ? profiles : []).map(profile => {
    const compiled = compileScaledUberInboxesFleet({ profile, roots, now });
    if (!compiled.ok) return { provider: profile?.provider || null, infrastructureClass: profile?.infrastructureClass || null, status: compiled.status, usableForPlanning: false };
    return {
      provider: profile.provider,
      infrastructureClass: profile.infrastructureClass,
      mailboxCount: compiled.fleet.desiredMailboxCount,
      theoreticalColdDailyCap: compiled.fleet.theoreticalColdDailyCap,
      theoreticalTotalDailyCap: compiled.fleet.theoreticalTotalDailyCap,
      sourceUrls: compiled.fleet.sourceUrls,
      usableForPlanning: true
    };
  });
  return { version: UBERINBOXES_SCALE_VERSION, rows, externalEffectAuthority: 'NONE' };
}
