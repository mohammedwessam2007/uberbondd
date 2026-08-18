// Read-only DNS verification. This module NEVER changes DNS -- it has no
// write/set capability of any kind, only public-record lookups. It never
// invents a DNS value, never guesses a DKIM selector, and never assumes a
// provider's SPF include -- every provider-specific expectation must be
// supplied explicitly via `expectedRecords` (normally the provider adapter's
// own dnsRequirements() capability). Without that contract, DKIM and
// tracking-domain checks report BLOCKED rather than a guessed pass/fail.
//
// The resolver is injectable so deterministic tests never perform real
// network I/O; the default resolver uses Node's real node:dns/promises,
// which this module has confirmed functions in this environment (see
// docs/UBERBOND_DOMAIN_MAILBOX_READINESS.md) -- so this is a genuinely
// live-capable socket, not a simulation, whenever a real domain is supplied.
import dns from 'node:dns/promises';

export const DNS_VERIFICATION_POLICY_VERSION = 'dns-verification-1.0.0';
export const DNS_CHECK_STATUSES = Object.freeze(['GREEN', 'YELLOW', 'RED', 'BLOCKED']);

export const defaultDnsResolver = Object.freeze({
  resolveMx: hostname => dns.resolveMx(hostname),
  resolveTxt: hostname => dns.resolveTxt(hostname),
  resolveCname: hostname => dns.resolveCname(hostname)
});

function flattenTxt(records) {
  return (Array.isArray(records) ? records : []).map(r => (Array.isArray(r) ? r.join('') : String(r)));
}

async function safeResolve(fn, hostname) {
  if (typeof fn !== 'function') return { ok: false, code: 'RESOLVER_METHOD_MISSING' };
  try {
    const result = await fn(hostname);
    return { ok: true, result };
  } catch (error) {
    return { ok: false, code: error?.code || String(error?.message || 'UNKNOWN_ERROR') };
  }
}

function isDomainMissingError(code) {
  return ['ENOTFOUND', 'ENODATA', 'NXDOMAIN'].includes(code);
}

async function checkMx(domain, resolver, expected) {
  const outcome = await safeResolve(resolver.resolveMx, domain);
  if (!outcome.ok) {
    return isDomainMissingError(outcome.code)
      ? { status: 'RED', reasonCodes: ['mx-missing'], records: [] }
      : { status: 'YELLOW', reasonCodes: [`mx-lookup-failed:${outcome.code}`], records: [] };
  }
  const hosts = (outcome.result || []).map(r => String(r.exchange || '').toLowerCase());
  if (!hosts.length) return { status: 'RED', reasonCodes: ['mx-missing'], records: hosts };
  if (Array.isArray(expected?.mxHostSuffixes) && expected.mxHostSuffixes.length) {
    const matches = hosts.some(host => expected.mxHostSuffixes.some(suffix => host.endsWith(String(suffix).toLowerCase())));
    if (!matches) return { status: 'RED', reasonCodes: ['mx-does-not-match-provider-requirement'], records: hosts };
  }
  return { status: 'GREEN', reasonCodes: [], records: hosts };
}

async function checkSpf(domain, resolver, expected) {
  const outcome = await safeResolve(resolver.resolveTxt, domain);
  if (!outcome.ok) {
    return isDomainMissingError(outcome.code)
      ? { status: 'RED', reasonCodes: ['spf-missing'], records: [] }
      : { status: 'YELLOW', reasonCodes: [`spf-lookup-failed:${outcome.code}`], records: [] };
  }
  const txt = flattenTxt(outcome.result);
  const spfRecords = txt.filter(r => /^v=spf1/i.test(r.trim()));
  if (!spfRecords.length) return { status: 'RED', reasonCodes: ['spf-missing'], records: [] };
  if (spfRecords.length > 1) {
    // RFC 7208: more than one SPF TXT record is itself invalid. UberBond
    // must never add a second record to "fix" this -- it can only report it.
    return { status: 'RED', reasonCodes: ['duplicate-spf-txt-record'], records: spfRecords };
  }
  const record = spfRecords[0];
  if (Array.isArray(expected?.spfIncludes) && expected.spfIncludes.length) {
    const missing = expected.spfIncludes.filter(inc => !record.toLowerCase().includes(String(inc).toLowerCase()));
    if (missing.length) return { status: 'RED', reasonCodes: [`spf-missing-required-include:${missing.join(',')}`], records: spfRecords };
  }
  return { status: 'GREEN', reasonCodes: [], records: spfRecords };
}

async function checkDkim(domain, resolver, expected) {
  const selector = expected?.dkimSelector ? String(expected.dkimSelector).trim() : '';
  if (!selector) return { status: 'BLOCKED', reasonCodes: ['dkim-selector-unknown-provider-requirement-missing'], records: [] };
  const host = `${selector}._domainkey.${domain}`;
  const outcome = await safeResolve(resolver.resolveTxt, host);
  if (!outcome.ok) {
    return isDomainMissingError(outcome.code)
      ? { status: 'RED', reasonCodes: ['dkim-record-missing'], records: [] }
      : { status: 'YELLOW', reasonCodes: [`dkim-lookup-failed:${outcome.code}`], records: [] };
  }
  const txt = flattenTxt(outcome.result);
  const dkimRecord = txt.find(r => /v=dkim1/i.test(r) || /p=/i.test(r));
  if (!dkimRecord) return { status: 'RED', reasonCodes: ['dkim-record-malformed'], records: txt };
  return { status: 'GREEN', reasonCodes: [], records: [dkimRecord] };
}

async function checkDmarc(domain, resolver, expected) {
  const host = `_dmarc.${domain}`;
  const outcome = await safeResolve(resolver.resolveTxt, host);
  if (!outcome.ok) {
    return isDomainMissingError(outcome.code)
      ? { status: 'RED', reasonCodes: ['dmarc-missing'], records: [], policy: null }
      : { status: 'YELLOW', reasonCodes: [`dmarc-lookup-failed:${outcome.code}`], records: [], policy: null };
  }
  const txt = flattenTxt(outcome.result);
  const dmarcRecord = txt.find(r => /^v=dmarc1/i.test(r.trim()));
  if (!dmarcRecord) return { status: 'RED', reasonCodes: ['dmarc-missing'], records: txt, policy: null };
  const policyMatch = /p=([a-z]+)/i.exec(dmarcRecord);
  const policy = policyMatch ? policyMatch[1].toLowerCase() : null;
  if (!policy) return { status: 'RED', reasonCodes: ['dmarc-invalid-syntax'], records: [dmarcRecord], policy: null };
  if (expected?.dmarcMinPolicy) {
    const strength = { none: 0, quarantine: 1, reject: 2 };
    if ((strength[policy] ?? -1) < (strength[expected.dmarcMinPolicy] ?? 0)) {
      return { status: 'YELLOW', reasonCodes: [`dmarc-policy-weaker-than-required:${policy}`], records: [dmarcRecord], policy };
    }
  }
  return { status: 'GREEN', reasonCodes: policy === 'none' ? ['dmarc-policy-is-none-monitoring-only'] : [], records: [dmarcRecord], policy };
}

async function checkTrackingDomain(resolver, expected) {
  if (!expected?.trackingCname?.host || !expected?.trackingCname?.target) {
    return { status: 'BLOCKED', reasonCodes: ['tracking-domain-not-configured'], records: [] };
  }
  const outcome = await safeResolve(resolver.resolveCname, expected.trackingCname.host);
  if (!outcome.ok) {
    return isDomainMissingError(outcome.code)
      ? { status: 'RED', reasonCodes: ['tracking-cname-missing'], records: [] }
      : { status: 'YELLOW', reasonCodes: [`tracking-cname-lookup-failed:${outcome.code}`], records: [] };
  }
  const targets = (outcome.result || []).map(t => String(t).toLowerCase().replace(/\.$/, ''));
  const expectedTarget = String(expected.trackingCname.target).toLowerCase().replace(/\.$/, '');
  if (!targets.includes(expectedTarget)) return { status: 'RED', reasonCodes: ['tracking-cname-mismatch'], records: targets };
  return { status: 'GREEN', reasonCodes: [], records: targets };
}

const STATUS_SEVERITY = { RED: 3, BLOCKED: 2, YELLOW: 1, GREEN: 0 };

function rollUp(checks) {
  let worst = 'GREEN';
  for (const check of Object.values(checks)) {
    if (STATUS_SEVERITY[check.status] > STATUS_SEVERITY[worst]) worst = check.status;
  }
  return worst;
}

// Overall status reflects the core email-authentication mechanisms only
// (MX/SPF/DKIM/DMARC). The tracking domain is a supplementary, optional
// check -- most providers do not require one to send at all -- so it is
// still reported per-check (for the beginner dashboard) but never drags a
// domain's overall status down to BLOCKED merely because a tracking domain
// was never configured.

// domain: exact hostname (never hardcoded by this module or any caller in
// this codebase -- must come from a registered SendingDomain). expectedRecords:
// the provider's own DNS requirement contract; when null/absent, DKIM and
// tracking-domain checks report BLOCKED rather than guessing, and the
// overall result cannot exceed BLOCKED even if MX/SPF/DMARC happen to look
// fine, because provider requirements as a whole are unknown.
export async function verifySendingDomainDns({ domain, expectedRecords = null, resolver = defaultDnsResolver, date = new Date() } = {}) {
  const at = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
  const timestamp = at.toISOString();
  const cleanDomain = String(domain || '').trim().toLowerCase();
  if (!cleanDomain) {
    return { ok: false, policyVersion: DNS_VERIFICATION_POLICY_VERSION, overallStatus: 'BLOCKED', reasonCodes: ['domain-required'], checks: null, timestamp };
  }

  const [mx, spf, dkim, dmarc, trackingDomain] = await Promise.all([
    checkMx(cleanDomain, resolver, expectedRecords),
    checkSpf(cleanDomain, resolver, expectedRecords),
    checkDkim(cleanDomain, resolver, expectedRecords),
    checkDmarc(cleanDomain, resolver, expectedRecords),
    checkTrackingDomain(resolver, expectedRecords)
  ]);

  const checks = { mx, spf, dkim, dmarc, trackingDomain };
  const coreChecks = { mx, spf, dkim, dmarc };
  const missingContract = !expectedRecords || typeof expectedRecords !== 'object';
  const overallStatus = missingContract ? (rollUp(coreChecks) === 'RED' ? 'RED' : 'BLOCKED') : rollUp(coreChecks);
  const reasonCodes = [
    ...(missingContract ? ['provider-dns-requirements-unknown'] : []),
    ...Object.values(checks).flatMap(c => c.reasonCodes)
  ];

  return {
    ok: true,
    policyVersion: DNS_VERIFICATION_POLICY_VERSION,
    domain: cleanDomain,
    overallStatus,
    checks,
    reasonCodes: [...new Set(reasonCodes)],
    timestamp
  };
}
