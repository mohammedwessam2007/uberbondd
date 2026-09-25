// Public-DNS observatory for the whole owned domain portfolio.
//
// src/outreach-domain-fleet.mjs records what the registrar UI showed. This
// module records what public resolvers return for every one of those domains,
// so each fleet row can move from UNKNOWN to an observed state, and it flags
// the specific live conditions that would break mail authentication or the
// website when mail is later configured:
//
// - GoDaddy's default `_dmarc` record already exists on new domains. A second
//   DMARC record makes the policy invalid, so mail setup must REPLACE it.
// - Two or more SPF records are a permanent SPF error.
// - An apex that answers with GoDaddy parking addresses beside real hosting
//   addresses serves the parking page to part of the traffic.
//
// Resolution failures are recorded as failures, never as absence.

import dns from 'node:dns/promises';
import crypto from 'node:crypto';
import { OUTREACH_FLEET_DOMAINS } from './outreach-domain-fleet.mjs';
import { OWNED_ROOT_DOMAINS } from './domain-purpose-plan.mjs';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const FLEET_DNS_OBSERVATORY_VERSION = 'uberbond.outreach-fleet-dns-observatory.v1';

// Addresses GoDaddy's parked-domain / forwarding service answered with in the
// 2026-09-25 observation (the registrar UI labels the apex A record "Parked").
export const GODADDY_PARKING_IPV4 = Object.freeze(['3.33.130.190', '15.197.148.33']);
const GODADDY_DEFAULT_DMARC_RUA = 'dmarc_rua@onsecureserver.net';

export const liveFleetResolver = Object.freeze({
  resolveNs: hostname => dns.resolveNs(hostname),
  resolveMx: hostname => dns.resolveMx(hostname),
  resolveTxt: hostname => dns.resolveTxt(hostname),
  resolve4: hostname => dns.resolve4(hostname)
});

const ABSENT_CODES = new Set(['ENODATA', 'ENOTFOUND', 'NXDOMAIN']);
const sha256 = value => crypto.createHash('sha256').update(String(value ?? '')).digest('hex');

async function lookup(fn, hostname) {
  if (typeof fn !== 'function') return { state: 'FAILED', code: 'RESOLVER_METHOD_MISSING', values: [] };
  try {
    const values = await fn(hostname);
    return { state: 'ANSWERED', code: null, values: Array.isArray(values) ? values : [] };
  } catch (error) {
    const code = error?.code || 'UNKNOWN_ERROR';
    return { state: ABSENT_CODES.has(code) ? 'ABSENT' : 'FAILED', code, values: [] };
  }
}

const txtStrings = values => values.map(v => (Array.isArray(v) ? v.join('') : String(v)));

function classifyDmarc(result) {
  if (result.state === 'FAILED') return { state: 'LOOKUP_FAILED', code: result.code };
  const records = txtStrings(result.values).filter(t => /^v=dmarc1/i.test(t.trim()));
  if (!records.length) return { state: 'ABSENT', records };
  if (records.length > 1) return { state: 'MULTIPLE_INVALID', records };
  const policy = (records[0].match(/;\s*p=([a-z]+)/i) || [])[1]?.toLowerCase() || null;
  return {
    state: records[0].includes(GODADDY_DEFAULT_DMARC_RUA) ? 'GODADDY_DEFAULT' : 'CUSTOM',
    policy,
    records
  };
}

function classifySpf(result) {
  if (result.state === 'FAILED') return { state: 'LOOKUP_FAILED', code: result.code };
  const records = txtStrings(result.values).filter(t => /^v=spf1(\s|$)/i.test(t.trim()));
  if (!records.length) return { state: 'ABSENT', records };
  return { state: records.length > 1 ? 'MULTIPLE_PERMERROR' : 'SINGLE', records };
}

function classifyMx(result) {
  if (result.state === 'FAILED') return { state: 'LOOKUP_FAILED', code: result.code };
  const hosts = result.values.map(r => ({ exchange: String(r?.exchange || '').toLowerCase(), priority: Number(r?.priority) })).sort((a, b) => a.priority - b.priority);
  return { state: hosts.length ? 'PRESENT' : 'ABSENT', hosts };
}

function classifyApex(result) {
  if (result.state === 'FAILED') return { state: 'LOOKUP_FAILED', code: result.code };
  const addresses = [...result.values].map(String).sort();
  if (!addresses.length) return { state: 'NO_A_RECORD', addresses };
  const parking = addresses.filter(ip => GODADDY_PARKING_IPV4.includes(ip));
  if (parking.length === addresses.length) return { state: 'GODADDY_PARKING_ONLY', addresses };
  if (parking.length) return { state: 'MIXED_PARKING_AND_HOSTING', addresses, parkingAddresses: parking };
  return { state: 'HOSTED', addresses };
}

function classifyNameservers(result) {
  if (result.state === 'FAILED') return { state: 'LOOKUP_FAILED', code: result.code };
  const hosts = result.values.map(h => String(h).toLowerCase()).sort();
  if (!hosts.length) return { state: 'ABSENT', hosts };
  const provider = hosts.every(h => h.endsWith('.domaincontrol.com')) ? 'GODADDY'
    : hosts.every(h => h.endsWith('.ns.cloudflare.com')) ? 'CLOUDFLARE'
      : 'OTHER';
  return { state: 'ANSWERED', provider, hosts };
}

export async function observeDomainDns(domain, { resolver = liveFleetResolver } = {}) {
  const name = String(domain ?? '').trim().toLowerCase().replace(/\.$/, '');
  const [ns, mx, txt, dmarc, apex] = await Promise.all([
    lookup(resolver.resolveNs, name),
    lookup(resolver.resolveMx, name),
    lookup(resolver.resolveTxt, name),
    lookup(resolver.resolveTxt, `_dmarc.${name}`),
    lookup(resolver.resolve4, name)
  ]);
  const row = {
    domain: name,
    role: OWNED_ROOT_DOMAINS.includes(name) ? 'CANONICAL_ROOT' : OUTREACH_FLEET_DOMAINS.includes(name) ? 'OUTREACH_FLEET' : 'UNREGISTERED_IN_PORTFOLIO',
    nameservers: classifyNameservers(ns),
    mx: classifyMx(mx),
    spf: classifySpf(txt),
    dmarc: classifyDmarc(dmarc),
    apex: classifyApex(apex)
  };
  const failed = [row.nameservers, row.mx, row.spf, row.dmarc, row.apex].some(part => part.state === 'LOOKUP_FAILED');
  row.mailState = failed ? 'OBSERVATION_INCOMPLETE'
    : row.mx.state === 'ABSENT' && row.spf.state === 'ABSENT' ? 'NO_MAIL_CONFIGURED'
      : row.mx.state === 'PRESENT' && row.spf.state === 'SINGLE' && ['CUSTOM', 'GODADDY_DEFAULT'].includes(row.dmarc.state) ? 'MX_SPF_DMARC_PRESENT_DKIM_UNOBSERVED'
        : 'PARTIAL_MAIL_CONFIGURATION';
  row.findings = [];
  if (row.dmarc.state === 'GODADDY_DEFAULT') row.findings.push('godaddy-default-dmarc-present__replace-do-not-add');
  if (row.dmarc.state === 'MULTIPLE_INVALID') row.findings.push('multiple-dmarc-records__policy-invalid');
  if (row.spf.state === 'MULTIPLE_PERMERROR') row.findings.push('multiple-spf-records__permerror');
  if (row.apex.state === 'MIXED_PARKING_AND_HOSTING') row.findings.push('apex-mixes-godaddy-parking-with-hosting__part-of-traffic-sees-parking');
  if (row.role === 'OUTREACH_FLEET' && row.apex.state === 'GODADDY_PARKING_ONLY') row.findings.push('outreach-domain-apex-is-registrar-parking-page');
  return row;
}

export async function observeFleetDns({ domains = [...OWNED_ROOT_DOMAINS, ...OUTREACH_FLEET_DOMAINS], resolver = liveFleetResolver, now = new Date(), observer = 'unspecified-host' } = {}) {
  const rows = [];
  for (const domain of [...new Set(domains)]) rows.push(await observeDomainDns(domain, { resolver }));
  const tally = key => rows.reduce((acc, row) => { acc[row[key]] = (acc[row[key]] || 0) + 1; return acc; }, {});
  const findingTally = {};
  for (const row of rows) for (const f of row.findings) findingTally[f] = (findingTally[f] || 0) + 1;
  const receipt = {
    schemaVersion: FLEET_DNS_OBSERVATORY_VERSION,
    observedAt: new Date(now).toISOString(),
    observer,
    method: 'PUBLIC_RECURSIVE_DNS_FROM_OBSERVER_HOST',
    domainsObserved: rows.length,
    summary: {
      mailState: tally('mailState'),
      nameserverProvider: rows.reduce((acc, row) => { const p = row.nameservers.provider || row.nameservers.state; acc[p] = (acc[p] || 0) + 1; return acc; }, {}),
      dmarc: rows.reduce((acc, row) => { acc[row.dmarc.state] = (acc[row.dmarc.state] || 0) + 1; return acc; }, {}),
      apex: rows.reduce((acc, row) => { acc[row.apex.state] = (acc[row.apex.state] || 0) + 1; return acc; }, {}),
      findings: findingTally,
      authenticatedSenderDomains: 0
    },
    domains: rows,
    externalEffectLedger: structuredClone(ZERO_EXTERNAL_EFFECTS),
    truthBoundary: 'Public resolver answers from one host at one moment. DKIM is not observed because no selector is known yet; a present MX/SPF/DMARC set is therefore never reported as an authenticated sender. Lookup failures are recorded as incomplete, never as absent. This proves nothing about registrar account state, mailbox readiness, reputation or send authority.'
  };
  receipt.receiptDigest = sha256(JSON.stringify({ ...receipt, observedAt: null }));
  return receipt;
}
