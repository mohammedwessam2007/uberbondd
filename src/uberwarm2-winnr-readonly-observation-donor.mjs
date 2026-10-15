import { createHash } from 'node:crypto';

// LANE W donor: read-only Winnr observation bridge. The injected client is the
// only IO surface: no socket, no credential, no export, no external effect.
// Provider "Active" is never upgraded into SMTP AUTH or authenticated DKIM
// alignment; no local hold or signed proof row is invented here.

export const UBERWARM2_WINNR_READONLY_OBSERVATION_DONOR_VERSION = 'uberbond.uberwarm2-winnr-readonly-observation-donor.v1';
export const UBERWARM2_WINNR_OBSERVATION_TRUTH_CLASS = 'PROVIDER_REPORTED_READONLY';
export const UBERWARM2_WINNR_OBSERVATION_UNKNOWNS = Object.freeze([
  'winnr-email-user-row-exact-field-names', 'winnr-domain-row-exact-field-names',
  'winnr-dns-status-row-exact-field-names', 'winnr-pagination-envelope-exact-keys',
  'winnr-provider-dns-readiness-semantics'
]);
export const UBERWARM2_WINNR_DONOR_NEVER_PROVIDES = Object.freeze([
  'readVerifiedSmtp', 'readLocalHold', 'readVerifiedDnsAlignment',
  'signed-verified-alignment-row', 'mailbox-credential'
]);

const UNKNOWNS = UBERWARM2_WINNR_OBSERVATION_UNKNOWNS;
const NEVER = UBERWARM2_WINNR_DONOR_NEVER_PROVIDES;
const TRUTH = UBERWARM2_WINNR_OBSERVATION_TRUTH_CLASS;
const EMPTY = Object.freeze([]);
const REFUSED = 'UBERWARM2_WINNR_OBSERVATION_DONOR_REFUSED';
const DENIED = 'UBERWARM2_WINNR_OBSERVATION_DENIED';
const TRUTH_BOUNDARY = 'Provider-reported read-only observation mapped only from injected Winnr inventory reads. Provider "Active" is not SMTP AUTH and record presence is not authenticated DKIM alignment; no local hold, signed SMTP proof or signed alignment row is synthesized here.';
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UTC = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.\d{3})?Z$/;
const str = v => (typeof v === 'string' && v.trim() ? v.trim() : '');
const lower = v => String(v ?? '').trim().toLowerCase();
const ok = v => EMAIL.test(lower(v));
const domainOf = v => lower(v).split('@')[1] || '';
const isBool = v => v === true || v === false;
const digest = refs => `sha256:${createHash('sha256').update(refs.join('\u0000')).digest('hex')}`;
const fail = (status, code, calls = 0) => Object.freeze({
  ok: false, status, reasonCodes: Object.freeze(Array.isArray(code) ? code : [code]),
  providerCalls: calls, observation: null, truthClass: TRUTH, unknowns: UNKNOWNS,
  truthBoundary: TRUTH_BOUNDARY
});

function canonicalUtcMs(value) {
  if (typeof value !== 'string') return null;
  const match = UTC.exec(value);
  if (!match) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 19) === match[1] ? ms : null;
}

// A usable inventory page is an ok read with an array payload, a present
// pagination envelope and has_more strictly false: a partial or unlabelled page
// is never treated as a complete account view.
function completeRows(result) {
  if (result?.ok !== true || !Array.isArray(result.data)) return null;
  const page = result.pagination;
  if (!page || typeof page !== 'object') return null;
  return (page.has_more ?? page.hasMore) === false ? result.data : null;
}

const exactlyOne = (rows, match) => { const found = rows.filter(match); return found.length === 1 ? found[0] : null; };
const idOf = r => str(r?.id ?? r?.userId ?? r?.user_id ?? r?.domainId ?? r?.domain_id);
const emailKeyOf = r => lower(r?.email ?? r?.address ?? r?.username);
const domainKeyOf = r => lower(r?.domain ?? r?.name ?? domainOf(r?.email ?? r?.address));
const flag = (r, ...keys) => keys.map(key => r?.[key]).find(isBool) ?? null;
const providerDnsReady = r => r?.ready === true ||
  ['ready', 'verified'].includes(lower(r?.dnsStatus ?? r?.dns_status ?? r?.status ?? r?.state));

export function createUberWarm2WinnrReadOnlyObservationDonor({ client, clock, maxAgeMs = 300000 } = {}) {
  const now = typeof clock === 'function' ? clock : () => Date.now();
  const bound = Number.isInteger(maxAgeMs) && maxAgeMs > 0 && maxAgeMs <= 300000 ? maxAgeMs : 0;
  const missing = ['listAllMailboxes', 'listAllDomains', 'getDnsStatus']
    .filter(name => typeof client?.[name] !== 'function').map(name => `winnr-read-required:${name}`);
  if (missing.length) {
    return Object.freeze({
      ...fail(REFUSED, missing),
      inspect: async () => fail(REFUSED, missing),
      readProviderMailbox: async () => EMPTY,
      readProviderDomainDns: async () => EMPTY,
      neverProvides: NEVER, credentialsExposed: false, exportPerformed: false,
      externalEffectAuthority: 'NONE'
    });
  }

  async function observe({ email, at } = {}) {
    let calls = 0;
    const deny = code => fail(DENIED, code, calls);
    try {
      const sender = lower(email);
      const domain = domainOf(sender);
      if (!ok(sender) || !domain || bound === 0 || !Number.isFinite(at) ||
          !Number.isFinite(Number(now()))) return deny('exact-identity-or-clock-invalid');
      calls += 1;
      const mailboxesResult = await client.listAllMailboxes();
      calls += 1;
      const domainsResult = await client.listAllDomains();
      const mailboxRows = completeRows(mailboxesResult);
      const domainRows = completeRows(domainsResult);
      if (!mailboxRows) return deny('mailbox-inventory-partial-or-unusable');
      if (!domainRows) return deny('domain-inventory-partial-or-unusable');
      const mailbox = exactlyOne(mailboxRows, row => emailKeyOf(row) === sender);
      if (!mailbox) return deny('mailbox-identity-not-exactly-one');
      const domainRow = exactlyOne(domainRows, row => domainKeyOf(row) === domain);
      if (!domainRow) return deny('domain-identity-not-exactly-one');
      if (domainKeyOf(mailbox) !== domain) return deny('mailbox-domain-cross-check-failed');
      const mailboxId = idOf(mailbox);
      const domainId = idOf(domainRow);
      if (!mailboxId || !domainId) return deny('provider-identity-id-missing');
      calls += 1;
      const dnsResult = await client.getDnsStatus({ domainId });
      if (dnsResult?.ok !== true || !dnsResult.data || typeof dnsResult.data !== 'object') return deny('dns-status-unavailable');
      const dnsRow = dnsResult.data;
      const dnsDomainId = str(dnsRow.domainId ?? dnsRow.domain_id);
      if (dnsDomainId && dnsDomainId !== domainId) return deny('dns-status-domain-id-mismatch');
      if ((dnsRow.domain || dnsRow.name) && domainKeyOf(dnsRow) !== domain) return deny('dns-status-domain-mismatch');
      const refs = [mailboxesResult, domainsResult, dnsResult].map(r => str(r?.receipt?.responseDigest));
      if (refs.some(ref => !ref)) return deny('provider-receipt-digest-unavailable');
      const readMs = Number(now());
      if (!Number.isFinite(readMs)) return deny('clock-invalid-after-read');
      if (readMs < Number(at)) return deny('observation-query-in-future');
      if (readMs - at > bound) return deny('observation-query-stale');
      const reportedAt = canonicalUtcMs(dnsRow.observedAt ?? dnsRow.checkedAt ?? dnsRow.updatedAt);
      // Provider-supplied DNS timestamps, not our fetch wall-clock, determine
      // whether the returned provider observation is current enough.
      if (reportedAt === null || reportedAt > readMs || readMs - reportedAt > bound)
        return deny('provider-dns-receipt-stale-or-unverified');
      const flags = {
        connected: flag(mailbox, 'connected'),
        paused: flag(mailbox, 'paused'),
        quarantined: flag(mailbox, 'quarantined'),
        placementQuarantine: flag(mailbox, 'placementQuarantine', 'placement_quarantine'),
        policyCompatible: flag(mailbox, 'policyCompatible', 'policy_compatible')
      };
      const unknownFlags = Object.keys(flags).filter(key => !isBool(flags[key]));
      const dnsReady = providerDnsReady(dnsRow);
      const observation = Object.freeze({
        email: sender, domain, mailboxId, domainId,
        observedAt: new Date(readMs).toISOString(),
        providerReportedAt: reportedAt === null ? null : new Date(reportedAt).toISOString(),
        evidenceRef: `winnr-readonly:${digest([...refs, mailboxId, domainId, sender, domain])}`,
        providerReportedActive: isBool(mailbox.active) ? mailbox.active : null,
        providerDnsReady: dnsReady, dnsRecordPresenceTreatedAsAlignment: false,
        smtpAuthenticationClaimed: false, dkimAlignmentClaimed: false,
        flags: Object.freeze({ ...flags }), unknownFlags: Object.freeze(unknownFlags),
        healthRowEligible: unknownFlags.length === 0 && flags.connected === true &&
          flags.paused === false && flags.quarantined === false &&
          flags.placementQuarantine === false && flags.policyCompatible === true && dnsReady
      });
      return Object.freeze({
        ok: true, status: 'UBERWARM2_WINNR_OBSERVATION_OBSERVED',
        reasonCodes: Object.freeze(observation.healthRowEligible ? []
          : ['health-row-withheld-until-every-flag-is-provider-reported']),
        providerCalls: calls, observation, truthClass: TRUTH, unknowns: UNKNOWNS,
        externallySourcedDependencies: NEVER, truthBoundary: TRUTH_BOUNDARY
      });
    } catch { return deny('provider-read-threw-or-invalid'); }
  }

  // The trusted health supplier consumes [row] or [] per fresh read. A row is
  // emitted only when Winnr itself reported every required boolean, so no hold,
  // quarantine or pause state is ever invented locally.
  async function readProviderMailbox(query) {
    const { ok: read, observation } = await observe(query);
    if (read !== true || observation.healthRowEligible !== true) return EMPTY;
    return Object.freeze([Object.freeze({
      email: observation.email, domain: observation.domain,
      observedAt: observation.observedAt, evidenceRef: observation.evidenceRef,
      connected: observation.flags.connected, paused: observation.flags.paused,
      quarantined: observation.flags.quarantined,
      placementQuarantine: observation.flags.placementQuarantine,
      policyCompatible: observation.flags.policyCompatible
    })]);
  }

  async function readProviderDomainDns(query) {
    const { ok: read, observation } = await observe(query);
    if (read !== true || observation.providerDnsReady !== true) return EMPTY;
    return Object.freeze([Object.freeze({
      email: observation.email, domain: observation.domain,
      observedAt: observation.observedAt, evidenceRef: observation.evidenceRef, ready: true
    })]);
  }

  return Object.freeze({
    ok: true, status: 'UBERWARM2_WINNR_OBSERVATION_DONOR_READY',
    version: UBERWARM2_WINNR_READONLY_OBSERVATION_DONOR_VERSION,
    inspect: observe, readProviderMailbox, readProviderDomainDns, neverProvides: NEVER,
    credentialsExposed: false, exportPerformed: false, externalEffectAuthority: 'NONE',
    truthBoundary: TRUTH_BOUNDARY });
}
