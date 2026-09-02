// Which host does what, on the two roots UberBond actually owns.
//
// A single domain carrying the product site, cold outbound, reply handling,
// click tracking and receipts is one reputation event away from taking the
// product offline with it. The fix is boring and well understood: separate
// hosts per purpose, so a burned sender never takes the app down and a tracking
// domain never borrows the product's reputation.
//
// What this module refuses to do is more important than what it plans.
//
//   * UberBond owns exactly uberbond.agency and uberbond.cloud. Any other root
//     is refused with `domain-not-owned`. This module invents no domain, checks
//     no availability, and purchases nothing -- it has no code path that could.
//   * Expected DKIM selectors, SPF includes and tracking CNAME targets come
//     ONLY from supplied provider requirements. Guessing "s1" or
//     "include:_spf.<provider>.com" produces a record that looks authoritative
//     and is fiction; without the contract the record is
//     BLOCKED_PROVIDER_REQUIREMENTS_UNKNOWN. This is the same discipline
//     src/dns-verification.mjs already applies, kept identical on purpose.
//   * A record UberBond generated is a statement of what SHOULD exist. It can
//     never be VERIFIED. Only an observation of public DNS, fresh within 24
//     hours, can do that -- plus TLS evidence always, and PTR evidence for a
//     self-hosted outbound host. A stale GREEN degrades to UNKNOWN rather than
//     resting on yesterday's lookup.
//
// No network I/O lives here. The caller performs lookups (normally through
// src/dns-verification.mjs, whose resolver is injectable) and hands the results
// in as observations.

import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const DOMAIN_PURPOSE_PLAN_POLICY_VERSION = 'domain-purpose-plan-1.0.0';

/** The complete set of roots UberBond owns. Not configurable: it is a fact, not a preference. */
export const OWNED_ROOT_DOMAINS = Object.freeze(['uberbond.agency', 'uberbond.cloud']);

export const DOMAIN_PURPOSES = Object.freeze([
  'APP_PRODUCT', 'OUTBOUND', 'INBOUND_REPLIES', 'TRACKING', 'TRANSACTIONAL', 'TESTING'
]);

export const DOMAIN_RECORD_STATES = Object.freeze([
  'CONFIGURED', 'DNS_PROPAGATING', 'VERIFIED', 'MISCONFIGURED', 'UNKNOWN'
]);

export const RECORD_BLOCKED_REASON = 'BLOCKED_PROVIDER_REQUIREMENTS_UNKNOWN';

/** Provenance a piece of evidence must carry before it can move a record to VERIFIED. */
export const OBSERVED_PROVENANCE = Object.freeze({
  DNS: 'OBSERVED_DNS',
  TLS: 'OBSERVED_TLS',
  PTR: 'OBSERVED_PTR'
});

/** Provenance of a record this module produced. Never sufficient for VERIFIED. */
export const GENERATED_PROVENANCE = Object.freeze({
  EXPECTED_FROM_PROVIDER_REQUIREMENT: 'GENERATED_EXPECTED_FROM_PROVIDER_REQUIREMENT',
  UBERBOND_POLICY: 'GENERATED_UBERBOND_POLICY',
  OBSERVATION_ONLY: 'OBSERVATION_ONLY'
});

// Separated hosts, all on owned roots. The product lives on the .agency apex so
// a burned sending subdomain cannot take it with it; every sending purpose sits
// on a distinct .cloud host so one purpose's reputation is one purpose's
// problem. Transactional stays on .agency because a receipt that arrives from
// the same brand the customer just paid is the one that does not look like
// phishing -- but on its own host, never the apex.
export const DEFAULT_PURPOSE_HOSTS = Object.freeze({
  APP_PRODUCT: 'uberbond.agency',
  TRANSACTIONAL: 'mail.uberbond.agency',
  OUTBOUND: 'send.uberbond.cloud',
  INBOUND_REPLIES: 'reply.uberbond.cloud',
  TRACKING: 'link.uberbond.cloud',
  TESTING: 'test.uberbond.cloud'
});

const DMARC_STRENGTH = Object.freeze({ none: 0, quarantine: 1, reject: 2 });

function text(value, max = 300) {
  return String(value ?? '').trim().slice(0, max);
}

function host(value) {
  return text(value, 253).toLowerCase().replace(/\.$/, '');
}

function referenceDate(value) {
  const candidate = value instanceof Date ? value : new Date(value ?? Date.now());
  return Number.isNaN(candidate.getTime()) ? new Date() : candidate;
}

function parseIso(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function stringList(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(entry => text(entry, 253)).filter(Boolean))];
}

/**
 * Is this host on a root UberBond owns?
 *
 * Suffix matching is done on labels, not characters: `notuberbond.agency` ends
 * with `uberbond.agency` as a string and is a different registration entirely.
 */
export function resolveOwnedHost(candidate) {
  const name = host(candidate);
  if (!name) return { ok: false, host: null, root: null, reasonCodes: ['domain-host-required'] };
  const root = OWNED_ROOT_DOMAINS.find(owned => name === owned || name.endsWith(`.${owned}`)) || null;
  if (!root) return { ok: false, host: name, root: null, reasonCodes: ['domain-not-owned'] };
  return { ok: true, host: name, root, reasonCodes: [] };
}

function requirementFor(providerRequirements, purpose) {
  const entry = providerRequirements && typeof providerRequirements === 'object' ? providerRequirements[purpose] : null;
  if (!entry || typeof entry !== 'object') return null;
  return {
    providerId: text(entry.providerId, 80),
    selfHosted: entry.selfHosted === true,
    dkimSelectors: stringList(entry.dkimSelectors),
    spfIncludes: stringList(entry.spfIncludes),
    mxHostSuffixes: stringList(entry.mxHostSuffixes).map(value => value.toLowerCase()),
    trackingCnameTarget: host(entry.trackingCnameTarget) || null,
    appHostTarget: host(entry.appHostTarget) || null,
    dmarcMinPolicy: ['none', 'quarantine', 'reject'].includes(text(entry.dmarcMinPolicy, 20).toLowerCase())
      ? text(entry.dmarcMinPolicy, 20).toLowerCase()
      : null,
    dmarcReportingAddress: text(entry.dmarcReportingAddress, 200) || null
  };
}

function record(fields) {
  return {
    recordHost: fields.recordHost,
    type: fields.type,
    purpose: fields.purpose,
    required: fields.required !== false,
    matchMode: fields.matchMode,
    expectedValue: fields.expectedValue ?? null,
    expectedTokens: fields.expectedTokens ?? null,
    expectedPrefix: fields.expectedPrefix ?? null,
    expectedSuffixes: fields.expectedSuffixes ?? null,
    minPolicy: fields.minPolicy ?? null,
    provenance: fields.provenance,
    blocked: Boolean(fields.blocked),
    blockedReason: fields.blocked ? RECORD_BLOCKED_REASON : null,
    reasonCodes: fields.reasonCodes ?? []
  };
}

function blockedRecord(recordHost, type, purpose, missing) {
  return record({
    recordHost, type, purpose, matchMode: 'NONE',
    provenance: GENERATED_PROVENANCE.EXPECTED_FROM_PROVIDER_REQUIREMENT,
    blocked: true,
    reasonCodes: [`provider-requirement-missing:${missing}`]
  });
}

function spfRecord(hostName, purpose, requirement) {
  if (!requirement || !requirement.spfIncludes.length) {
    return blockedRecord(hostName, 'SPF', purpose, 'spfIncludes');
  }
  return record({
    recordHost: hostName, type: 'SPF', purpose, matchMode: 'CONTAINS_ALL',
    expectedValue: `v=spf1 ${requirement.spfIncludes.map(value => `include:${value}`).join(' ')} -all`,
    expectedTokens: ['v=spf1', ...requirement.spfIncludes.map(value => `include:${value}`)],
    provenance: GENERATED_PROVENANCE.EXPECTED_FROM_PROVIDER_REQUIREMENT
  });
}

function dkimRecords(hostName, purpose, requirement) {
  if (!requirement || !requirement.dkimSelectors.length) {
    return [blockedRecord(hostName, 'DKIM', purpose, 'dkimSelectors')];
  }
  return requirement.dkimSelectors.map(selector => record({
    recordHost: `${selector}._domainkey.${hostName}`, type: 'DKIM', purpose, matchMode: 'PREFIX_ANY',
    expectedPrefix: 'v=dkim1',
    provenance: GENERATED_PROVENANCE.EXPECTED_FROM_PROVIDER_REQUIREMENT,
    // The public key itself is issued by the provider; UberBond never generates
    // or guesses one, so the expectation is "a DKIM record published by the
    // provider exists at this exact selector", not a literal value.
    reasonCodes: ['dkim-key-material-is-provider-issued']
  }));
}

function mxRecord(hostName, purpose, requirement) {
  if (!requirement || !requirement.mxHostSuffixes.length) {
    return blockedRecord(hostName, 'MX', purpose, 'mxHostSuffixes');
  }
  return record({
    recordHost: hostName, type: 'MX', purpose, matchMode: 'SUFFIX_ANY',
    expectedSuffixes: requirement.mxHostSuffixes,
    provenance: GENERATED_PROVENANCE.EXPECTED_FROM_PROVIDER_REQUIREMENT
  });
}

function dmarcRecord(hostName, purpose, requirement, fallbackPolicy) {
  const policy = requirement?.dmarcMinPolicy || fallbackPolicy;
  const rua = requirement?.dmarcReportingAddress;
  return record({
    recordHost: `_dmarc.${hostName}`, type: 'DMARC', purpose, matchMode: 'DMARC_POLICY_AT_LEAST',
    minPolicy: policy,
    expectedValue: `v=DMARC1; p=${policy};${rua ? ` rua=${rua};` : ''}`,
    // DMARC policy strength is UberBond's decision about its own domains, not a
    // provider requirement, so it is generated from policy rather than blocked.
    provenance: GENERATED_PROVENANCE.UBERBOND_POLICY
  });
}

function tlsRecord(hostName, purpose) {
  return record({
    recordHost: hostName, type: 'TLS', purpose, matchMode: 'OBSERVATION_ONLY',
    provenance: GENERATED_PROVENANCE.OBSERVATION_ONLY,
    // Transport security is a property of a connection, not of a zone file.
    // Nothing this module generates can assert it; only an observation can.
    reasonCodes: ['tls-is-observed-not-generated']
  });
}

function ptrRecord(hostName, purpose) {
  return record({
    recordHost: hostName, type: 'PTR', purpose, matchMode: 'OBSERVATION_ONLY',
    provenance: GENERATED_PROVENANCE.OBSERVATION_ONLY,
    reasonCodes: ['ptr-is-controlled-by-the-ip-owner']
  });
}

function recordsForPurpose(purpose, hostName, requirement) {
  switch (purpose) {
    case 'APP_PRODUCT':
      return [
        requirement?.appHostTarget
          ? record({
            recordHost: hostName, type: 'APEX_TARGET', purpose, matchMode: 'EXACT_ONE',
            expectedValue: requirement.appHostTarget,
            provenance: GENERATED_PROVENANCE.EXPECTED_FROM_PROVIDER_REQUIREMENT
          })
          : blockedRecord(hostName, 'APEX_TARGET', purpose, 'appHostTarget'),
        // A host that never sends should say so. Null MX plus a hard-fail SPF
        // is the cheapest anti-spoofing there is, and neither needs a provider.
        record({
          recordHost: hostName, type: 'NULL_MX', purpose, matchMode: 'EXACT_ONE',
          expectedValue: '.', provenance: GENERATED_PROVENANCE.UBERBOND_POLICY
        }),
        record({
          recordHost: hostName, type: 'SPF', purpose, matchMode: 'CONTAINS_ALL',
          expectedValue: 'v=spf1 -all', expectedTokens: ['v=spf1', '-all'],
          provenance: GENERATED_PROVENANCE.UBERBOND_POLICY
        }),
        dmarcRecord(hostName, purpose, requirement, 'reject'),
        tlsRecord(hostName, purpose)
      ];
    case 'OUTBOUND':
    case 'TESTING': {
      const rows = [
        spfRecord(hostName, purpose, requirement),
        ...dkimRecords(hostName, purpose, requirement),
        dmarcRecord(hostName, purpose, requirement, 'quarantine'),
        mxRecord(hostName, purpose, requirement),
        tlsRecord(hostName, purpose)
      ];
      // PTR is only meaningful when UberBond controls the sending IP. Demanding
      // it from a shared ESP would be demanding evidence the owner cannot
      // produce, which turns a real gate into noise.
      if (requirement?.selfHosted) rows.push(ptrRecord(hostName, purpose));
      return rows;
    }
    case 'TRANSACTIONAL': {
      const rows = [
        spfRecord(hostName, purpose, requirement),
        ...dkimRecords(hostName, purpose, requirement),
        dmarcRecord(hostName, purpose, requirement, 'quarantine'),
        tlsRecord(hostName, purpose)
      ];
      if (requirement?.selfHosted) rows.push(ptrRecord(hostName, purpose));
      return rows;
    }
    case 'INBOUND_REPLIES':
      return [
        mxRecord(hostName, purpose, requirement),
        spfRecord(hostName, purpose, requirement),
        dmarcRecord(hostName, purpose, requirement, 'quarantine'),
        tlsRecord(hostName, purpose)
      ];
    case 'TRACKING':
      return [
        requirement?.trackingCnameTarget
          ? record({
            recordHost: hostName, type: 'TRACKING_CNAME', purpose, matchMode: 'EXACT_ONE',
            expectedValue: requirement.trackingCnameTarget,
            provenance: GENERATED_PROVENANCE.EXPECTED_FROM_PROVIDER_REQUIREMENT
          })
          : blockedRecord(hostName, 'TRACKING_CNAME', purpose, 'trackingCnameTarget'),
        tlsRecord(hostName, purpose)
      ];
    default:
      return [];
  }
}

function normalizeObservation(entry) {
  if (!entry || typeof entry !== 'object') return null;
  return {
    recordHost: host(entry.recordHost || entry.host),
    type: text(entry.type, 40).toUpperCase(),
    values: (Array.isArray(entry.values) ? entry.values : [])
      .map(value => text(value, 1000).toLowerCase().replace(/\.$/, ''))
      .filter(Boolean),
    observedAtMs: parseIso(entry.observedAt),
    observedAt: entry.observedAt ?? null,
    provenance: text(entry.provenance, 60).toUpperCase(),
    pass: entry.pass === true,
    source: text(entry.source, 200) || null
  };
}

function matches(rec, observation) {
  const values = observation.values;
  switch (rec.matchMode) {
    case 'EXACT_ONE':
      return values.includes(String(rec.expectedValue || '').toLowerCase().replace(/\.$/, ''));
    case 'CONTAINS_ALL':
      return values.some(value => (rec.expectedTokens || []).every(token => value.includes(String(token).toLowerCase())));
    case 'PREFIX_ANY':
      return values.some(value => value.startsWith(String(rec.expectedPrefix || '').toLowerCase()));
    case 'SUFFIX_ANY':
      return values.some(value => (rec.expectedSuffixes || []).some(suffix => value.endsWith(String(suffix).toLowerCase())));
    case 'DMARC_POLICY_AT_LEAST': {
      const found = values.map(value => /p=([a-z]+)/.exec(value)?.[1]).filter(Boolean);
      if (!found.length) return false;
      const required = DMARC_STRENGTH[rec.minPolicy] ?? 0;
      return found.some(policy => (DMARC_STRENGTH[policy] ?? -1) >= required);
    }
    default:
      return false;
  }
}

/**
 * State for one planned record given whatever evidence exists for it.
 *
 * The single most important line in this file is the provenance check. A record
 * this module generated is what SHOULD be published; feeding it back in as its
 * own evidence would make every plan verify itself the moment it was written.
 * Only `OBSERVED_DNS` (or the matching observation-only provenance) counts, and
 * only while it is fresh.
 */
export function evaluateDomainRecord({
  record: rec,
  observation = null,
  declaredConfiguredAt = null,
  now = new Date(),
  maxObservationAgeHours = 24,
  propagationWindowHours = 48
} = {}) {
  const at = referenceDate(now);
  const reasonCodes = [...(rec?.reasonCodes || [])];

  if (!rec || typeof rec !== 'object') {
    return { state: 'UNKNOWN', reasonCodes: ['record-required'], evidenceProvenance: null, observationAgeHours: null };
  }
  if (rec.blocked) {
    return { state: 'UNKNOWN', reasonCodes: [...new Set([RECORD_BLOCKED_REASON, ...reasonCodes])], evidenceProvenance: null, observationAgeHours: null };
  }

  const declaredMs = parseIso(declaredConfiguredAt);
  const obs = normalizeObservation(observation);
  const expectedProvenance = rec.type === 'TLS' ? OBSERVED_PROVENANCE.TLS
    : rec.type === 'PTR' ? OBSERVED_PROVENANCE.PTR
      : OBSERVED_PROVENANCE.DNS;

  if (!obs) {
    return {
      state: declaredMs === null ? 'UNKNOWN' : 'CONFIGURED',
      reasonCodes: [...new Set([...reasonCodes, declaredMs === null ? 'no-observation-and-no-owner-declaration' : 'owner-declared-configured-but-never-observed'])],
      evidenceProvenance: null,
      observationAgeHours: null
    };
  }

  if (obs.provenance !== expectedProvenance) {
    // This is the guard against a record verifying itself: anything whose
    // provenance is not an observation of the outside world is refused here,
    // including this module's own generated expectations.
    return {
      state: 'UNKNOWN',
      reasonCodes: [...new Set([...reasonCodes, 'evidence-provenance-not-observed', `evidence-provenance:${obs.provenance || 'ABSENT'}`])],
      evidenceProvenance: obs.provenance || null,
      observationAgeHours: null
    };
  }

  if (obs.observedAtMs === null) {
    return { state: 'UNKNOWN', reasonCodes: [...new Set([...reasonCodes, 'observation-timestamp-required'])], evidenceProvenance: obs.provenance, observationAgeHours: null };
  }
  const ageHours = (at.getTime() - obs.observedAtMs) / 3_600_000;
  if (ageHours < 0) {
    return { state: 'UNKNOWN', reasonCodes: [...new Set([...reasonCodes, 'observation-in-the-future'])], evidenceProvenance: obs.provenance, observationAgeHours: ageHours };
  }
  if (ageHours > maxObservationAgeHours) {
    // Yesterday's GREEN is not today's GREEN. DNS changes without telling
    // anyone, and a stale pass is exactly how a broken sender keeps looking fine.
    return { state: 'UNKNOWN', reasonCodes: [...new Set([...reasonCodes, 'observation-stale'])], evidenceProvenance: obs.provenance, observationAgeHours: ageHours };
  }

  if (rec.matchMode === 'OBSERVATION_ONLY') {
    return {
      state: obs.pass ? 'VERIFIED' : 'MISCONFIGURED',
      reasonCodes: [...new Set([...reasonCodes, ...(obs.pass ? [] : [`${rec.type.toLowerCase()}-observation-failed`])])],
      evidenceProvenance: obs.provenance,
      observationAgeHours: ageHours
    };
  }

  if (!obs.values.length) {
    const propagating = declaredMs !== null && (at.getTime() - declaredMs) / 3_600_000 <= propagationWindowHours;
    return {
      state: propagating ? 'DNS_PROPAGATING' : 'MISCONFIGURED',
      reasonCodes: [...new Set([...reasonCodes, 'record-absent-in-public-dns'])],
      evidenceProvenance: obs.provenance,
      observationAgeHours: ageHours
    };
  }

  if (!matches(rec, obs)) {
    return {
      state: 'MISCONFIGURED',
      reasonCodes: [...new Set([...reasonCodes, 'observed-value-does-not-match-expected'])],
      evidenceProvenance: obs.provenance,
      observationAgeHours: ageHours
    };
  }

  return { state: 'VERIFIED', reasonCodes: [...new Set(reasonCodes)], evidenceProvenance: obs.provenance, observationAgeHours: ageHours };
}

function observationFor(observations, rec) {
  return (observations || []).find(entry => {
    const normalized = normalizeObservation(entry);
    return normalized && normalized.recordHost === host(rec.recordHost) && normalized.type === rec.type;
  }) || null;
}

/**
 * The whole plan: one entry per purpose, each on its own host, each with the
 * records that purpose needs and the state the available evidence supports.
 *
 * A host is VERIFIED only when every required record under it is VERIFIED --
 * which, because TLS is a required record everywhere and PTR is required on a
 * self-hosted sending host, is exactly the "TLS always, PTR for self-hosted
 * outbound" rule without a second place to state it.
 */
export function buildDomainPurposePlan({
  purposes = DOMAIN_PURPOSES,
  hosts = DEFAULT_PURPOSE_HOSTS,
  providerRequirements = {},
  observations = [],
  declaredConfiguredAt = {},
  now = new Date(),
  maxObservationAgeHours = 24,
  propagationWindowHours = 48
} = {}) {
  const at = referenceDate(now);
  const timestamp = at.toISOString();
  const selected = (Array.isArray(purposes) ? purposes : []).map(value => text(value, 40).toUpperCase());
  const unknownPurposes = selected.filter(purpose => !DOMAIN_PURPOSES.includes(purpose));
  const refused = [];
  const planned = [];

  for (const purpose of selected) {
    if (!DOMAIN_PURPOSES.includes(purpose)) continue;
    const owned = resolveOwnedHost(hosts?.[purpose]);
    if (!owned.ok) {
      // No purchase path, no availability check, no substitute suggestion. A
      // root UberBond does not own is simply not plannable here.
      refused.push({ purpose, host: owned.host, reasonCodes: owned.reasonCodes });
      continue;
    }
    const requirement = requirementFor(providerRequirements, purpose);
    const rows = recordsForPurpose(purpose, owned.host, requirement).map(rec => {
      const evaluation = evaluateDomainRecord({
        record: rec,
        observation: observationFor(observations, rec),
        declaredConfiguredAt: declaredConfiguredAt?.[purpose] ?? null,
        now: at,
        maxObservationAgeHours,
        propagationWindowHours
      });
      return { ...rec, ...evaluation };
    });

    const required = rows.filter(row => row.required);
    const verified = required.filter(row => row.state === 'VERIFIED');
    const misconfigured = required.filter(row => row.state === 'MISCONFIGURED');
    const blocked = required.filter(row => row.blocked);
    const hostState = blocked.length ? 'UNKNOWN'
      : misconfigured.length ? 'MISCONFIGURED'
        : verified.length === required.length ? 'VERIFIED'
          : required.some(row => row.state === 'DNS_PROPAGATING') ? 'DNS_PROPAGATING'
            : required.every(row => ['CONFIGURED', 'VERIFIED'].includes(row.state)) ? 'CONFIGURED'
              : 'UNKNOWN';

    planned.push({
      purpose,
      host: owned.host,
      root: owned.root,
      providerId: requirement?.providerId || null,
      selfHosted: Boolean(requirement?.selfHosted),
      providerRequirementsSupplied: Boolean(requirement),
      state: hostState,
      records: rows,
      requiredRecordCount: required.length,
      verifiedRecordCount: verified.length,
      blockedRecordCount: blocked.length,
      reasonCodes: [...new Set([
        ...(requirement ? [] : ['provider-requirements-not-supplied']),
        ...rows.flatMap(row => row.reasonCodes)
      ])]
    });
  }

  const hostNames = planned.map(entry => entry.host);
  const sharedHosts = [...new Set(hostNames.filter((name, index) => hostNames.indexOf(name) !== index))];

  return {
    ok: refused.length === 0 && unknownPurposes.length === 0 && sharedHosts.length === 0,
    policyVersion: DOMAIN_PURPOSE_PLAN_POLICY_VERSION,
    timestamp,
    ownedRoots: [...OWNED_ROOT_DOMAINS],
    purposes: planned,
    refusedPurposes: refused,
    unknownPurposes,
    // Two purposes on one host is the failure this plan exists to prevent, so
    // it is reported rather than silently tolerated.
    sharedHosts,
    summary: {
      plannedPurposes: planned.length,
      verifiedHosts: planned.filter(entry => entry.state === 'VERIFIED').length,
      blockedHosts: planned.filter(entry => entry.blockedRecordCount > 0).length,
      recordsPlanned: planned.reduce((total, entry) => total + entry.records.length, 0),
      recordsVerified: planned.reduce((total, entry) => total + entry.verifiedRecordCount, 0),
      domainsPurchased: 0,
      dnsRecordsChanged: 0
    },
    businessEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS }
  };
}

/**
 * Bridge from `verifySendingDomainDns` output to observations this plan accepts.
 *
 * Only GREEN checks become observed values -- a YELLOW is a lookup that failed
 * for a transport reason and says nothing about the record, and a BLOCKED check
 * is the absence of a provider contract, which is not evidence either.
 */
export function observationsFromDnsVerification(dnsResult, { observedAt = new Date().toISOString(), hostName = null } = {}) {
  if (!dnsResult || dnsResult.ok !== true || !dnsResult.checks) return [];
  const base = host(hostName || dnsResult.domain);
  const map = [
    ['mx', 'MX', base],
    ['spf', 'SPF', base],
    ['dkim', 'DKIM', null],
    ['dmarc', 'DMARC', `_dmarc.${base}`],
    ['trackingDomain', 'TRACKING_CNAME', base]
  ];
  const out = [];
  for (const [key, type, recordHost] of map) {
    const check = dnsResult.checks[key];
    if (!check || check.status === 'BLOCKED' || check.status === 'YELLOW') continue;
    // The DKIM record host depends on the selector, which only the caller knows
    // (it came from the provider requirement), so it must be supplied there.
    if (!recordHost) continue;
    out.push({
      recordHost,
      type,
      values: Array.isArray(check.records) ? check.records : [],
      observedAt,
      provenance: OBSERVED_PROVENANCE.DNS,
      source: `dns-verification:${dnsResult.policyVersion}`
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Convergence-lane API
//
// The convergence lane arrived at the same planner through a different door: it
// names the whole thing a "plan" with `rows`, and asks one question per
// observation. Both names now reach this module's logic, so a caller cannot get
// a different answer about a domain depending on which verb it happened to
// import. These delegate; they do not re-decide anything.
// ---------------------------------------------------------------------------

/**
 * Plan an owned root's purposes, refusing a root UberBond does not own.
 *
 * The refusal is the point. A planner that will happily emit expected DNS for
 * `not-uberbond.example` is a planner that will one day be pointed at somebody
 * else's domain, and the generated records would look exactly as authoritative.
 */
export function compileDomainPurposePlan({
  rootDomain = '',
  assignments = null,
  providerRequirements = {},
  observations = [],
  now = new Date(),
  ...rest
} = {}) {
  const at = now instanceof Date ? now : new Date(now);
  const owned = resolveOwnedHost(rootDomain);
  if (!owned.ok || owned.host !== owned.root) {
    return {
      ok: false,
      policyVersion: DOMAIN_PURPOSE_PLAN_POLICY_VERSION,
      rows: [],
      purposes: [],
      reasonCodes: owned.ok ? ['domain-root-required'] : owned.reasonCodes,
      businessEffectAuthority: 'NONE',
      externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS }
    };
  }

  // Every assigned host is checked against the owned roots too, so naming an
  // owned root at the top cannot smuggle an unowned host into a row.
  const hosts = {};
  const rejected = [];
  for (const [purpose, host] of Object.entries(assignments || DEFAULT_PURPOSE_HOSTS)) {
    const resolved = resolveOwnedHost(host);
    if (!resolved.ok) { rejected.push(`assignment-not-owned:${purpose}`); continue; }
    hosts[purpose] = resolved.host;
  }
  if (rejected.length) {
    return {
      ok: false,
      policyVersion: DOMAIN_PURPOSE_PLAN_POLICY_VERSION,
      rows: [],
      purposes: [],
      reasonCodes: rejected,
      businessEffectAuthority: 'NONE',
      externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS }
    };
  }

  const plan = buildDomainPurposePlan({ hosts, providerRequirements, observations, now: at, ...rest });
  return { ...plan, rows: plan.purposes };
}

/**
 * Judge one observation against one planned purpose row.
 *
 * `generatedExpectedRecords` is the trap this exists to close. A record this
 * module generated, compared against itself, agrees every time — and that
 * agreement is worth nothing. It caps the row at CONFIGURED and says so, rather
 * than letting a self-consistent expectation read as verified DNS.
 */
export function evaluateDomainObservation({ planRow, observation = {}, now = new Date() } = {}) {
  // `now` arrives as a Date from internal callers and as an ISO string from
  // callers that carry timestamps around as text. Both are legitimate; a
  // TypeError on the string one is not.
  const at = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(at.getTime())) {
    return {
      ok: false,
      policyVersion: DOMAIN_PURPOSE_PLAN_POLICY_VERSION,
      purpose: planRow?.purpose ?? null,
      host: planRow?.host ?? null,
      state: 'UNKNOWN',
      reasonCodes: ['evaluation-clock-required'],
      businessEffectAuthority: 'NONE',
      externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS }
    };
  }
  const reasonCodes = [];
  const generated = observation?.generatedExpectedRecords === true;
  if (generated) reasonCodes.push('generated-expectations-are-not-observed-proof');

  const provenance = String(observation?.provenance || '');
  const observedProvenance = Object.values(OBSERVED_PROVENANCE).includes(provenance);
  if (!observedProvenance) reasonCodes.push('observed-provenance-required-for-verification');

  const observedAt = Date.parse(observation?.observedAt ?? '');
  if (!Number.isFinite(observedAt)) reasonCodes.push('observation-timestamp-required');
  else if (observedAt > at.getTime() + 60_000) reasonCodes.push('observation-is-future-dated');

  if (observation?.tlsVerified === false) reasonCodes.push('tls-not-verified');

  // VERIFIED is reachable only through independently observed provenance on a
  // row that is not blocked. Everything else is at most CONFIGURED: we asked
  // for it, and nothing outside this process has confirmed it.
  const blocked = planRow?.state === 'UNKNOWN' && (planRow?.blockedRecordCount ?? 0) > 0;
  const verifiable = observedProvenance && !generated && reasonCodes.length === 0 && !blocked;
  const state = verifiable
    ? 'VERIFIED'
    : (String(observation?.status || '').toUpperCase() === 'GREEN' ? 'CONFIGURED' : 'UNKNOWN');

  return {
    ok: true,
    policyVersion: DOMAIN_PURPOSE_PLAN_POLICY_VERSION,
    purpose: planRow?.purpose ?? null,
    host: planRow?.host ?? null,
    state,
    reasonCodes,
    businessEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS }
  };
}
