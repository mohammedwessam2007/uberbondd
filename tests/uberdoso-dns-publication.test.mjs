import test from 'node:test';
import assert from 'node:assert/strict';
import { compileUberDosoDnsPublication } from '../src/uberdoso-dns-publication.mjs';
import { compileUberDosoTopology } from '../src/uberdoso-kernel.mjs';
import { createGoDaddyDnsAdapter } from '../src/uberdns-godaddy-adapter.mjs';

const NOW = new Date('2026-09-26T00:00:00Z');
const dkim = root => ({ root, dkimRecordHost: `postal-ab12cd._domainkey.${root}`, dkimRecordValue: 'v=DKIM1; t=s; h=sha256; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAtest' });
const receipt = (roots, overrides = {}) => ({
  schemaVersion: 'uberdoso.host-self-verification.v1',
  hostEvidence: { publicIpv4: '203.0.113.25', ptrHostname: 'mta.uberbond.cloud', outboundPort25Observed: true, ...overrides },
  domains: roots.map(dkim)
});
const ALL = ['uberbond.agency', 'uberbond.cloud', 'uberbondhq.site'];

test('a real-shaped host receipt compiles into exact per-zone records including the fleet sender', () => {
  const r = compileUberDosoDnsPublication({ hostVerification: receipt(ALL), senderDomains: ['uberbondhq.site'], now: NOW });
  assert.equal(r.status, 'UBERDOSO_DNS_PUBLICATION_READY', JSON.stringify(r.reasonCodes));
  assert.deepEqual(r.zones, ALL);
  const has = (name, type, pred = () => true) => r.providerPlan.changes.some(c => c.name === name && c.type === type && pred(c));
  assert.ok(has('mta.uberbond.cloud', 'A', c => c.value === '203.0.113.25'));
  assert.ok(has('spf.uberbond.cloud', 'TXT', c => c.value === 'v=spf1 ip4:203.0.113.25 -all'));
  assert.ok(has('uberbondhq.site', 'MX', c => c.priority === 10 && c.value === 'mta.uberbond.cloud'));
  assert.ok(has('uberbondhq.site', 'TXT', c => c.value === 'v=spf1 include:spf.uberbond.cloud -all'));
  assert.ok(has('_dmarc.uberbondhq.site', 'TXT', c => c.value.startsWith('v=DMARC1')));
  assert.ok(has('postal-ab12cd._domainkey.uberbondhq.site', 'TXT', c => c.value.startsWith('v=DKIM1;')));
  assert.deepEqual(r.verifierContracts['uberbondhq.site'], { mxHostSuffixes: ['mta.uberbond.cloud'], spfIncludes: ['spf.uberbond.cloud'], dkimSelector: 'postal-ab12cd', dmarcMinPolicy: 'quarantine' });
  assert.equal(r.providerPlan.ownerAuthorized, false);
  assert.ok(Object.values(r.externalEffectLedger).every(v => v === 0));
});

test('without sender domains the default brand-root topology is unchanged', () => {
  const r = compileUberDosoDnsPublication({ hostVerification: receipt(ALL.slice(0, 2)), now: NOW });
  assert.equal(r.status, 'UBERDOSO_DNS_PUBLICATION_READY');
  assert.deepEqual(r.zones, ['uberbond.agency', 'uberbond.cloud']);
  assert.equal(compileUberDosoTopology().topology.roots.length, 2);
});

test('missing physical evidence blocks publication instead of guessing', () => {
  assert.deepEqual(compileUberDosoDnsPublication({ hostVerification: {} }).reasonCodes, ['uberdoso-host-self-verification-receipt-required']);
  assert.ok(compileUberDosoDnsPublication({ hostVerification: receipt(ALL, { ptrHostname: 'v2202609.netcup.example' }), senderDomains: ['uberbondhq.site'], now: NOW }).reasonCodes.includes('ptr-must-match-mta-host'));
  assert.ok(compileUberDosoDnsPublication({ hostVerification: receipt(ALL, { publicIpv4: '' }), senderDomains: ['uberbondhq.site'], now: NOW }).reasonCodes.includes('static-public-ipv4-required'));
  assert.ok(compileUberDosoDnsPublication({ hostVerification: receipt(ALL.slice(0, 2)), senderDomains: ['uberbondhq.site'], now: NOW }).reasonCodes.includes('observed-postal-dkim-record-required:uberbondhq.site'));
  assert.deepEqual(compileUberDosoDnsPublication({ hostVerification: receipt(ALL), senderDomains: ['stranger.example'], now: NOW }).reasonCodes, ['sender-domain-not-in-verified-outreach-fleet:stranger.example']);
  const noPort25 = compileUberDosoDnsPublication({ hostVerification: receipt(ALL, { outboundPort25Observed: false }), senderDomains: ['uberbondhq.site'], now: NOW });
  assert.equal(noPort25.ok, true);
  assert.deepEqual(noPort25.warnings, ['outbound-port-25-not-observed__dns-may-publish-but-no-mail-can-leave']);
});

test('the provider plan applies through the GoDaddy adapter only when owner-authorized, preserving live website records', async () => {
  const live = {
    'uberbond.agency': [{ recordId: 'w', name: '@', type: 'A', data: '162.159.143.30', ttl: 3600 }, { recordId: 'd1', name: '_dmarc', type: 'TXT', data: 'v=DMARC1; p=quarantine; adkim=r; aspf=r; rua=mailto:dmarc_rua@onsecureserver.net;', ttl: 3600 }],
    'uberbond.cloud': [{ recordId: 'd2', name: '_dmarc', type: 'TXT', data: 'v=DMARC1; p=quarantine; adkim=r; aspf=r; rua=mailto:dmarc_rua@onsecureserver.net;', ttl: 3600 }],
    'uberbondhq.site': [{ recordId: 'd3', name: '_dmarc', type: 'TXT', data: 'v=DMARC1; p=quarantine; adkim=r; aspf=r; rua=mailto:dmarc_rua@onsecureserver.net;', ttl: 3600 }]
  };
  const calls = [];
  const fetchFn = async (url, opts = {}) => {
    calls.push({ url, method: opts.method || 'GET' });
    if ((opts.method || 'GET') === 'GET') return { ok: true, status: 200, json: async () => ({ items: live[decodeURIComponent(url.match(/zones\/([^/]+)\//)[1])] }) };
    return { ok: true, status: 200, json: async () => ({}) };
  };
  const adapter = createGoDaddyDnsAdapter({ pat: 'p', fetchFn, idempotencyKey: () => 'k' });
  const unauthorized = compileUberDosoDnsPublication({ hostVerification: receipt(ALL), senderDomains: ['uberbondhq.site'], now: NOW });
  assert.equal((await adapter.applyChanges(unauthorized.providerPlan)).ok, false);
  assert.equal(calls.length, 0);

  const authorized = compileUberDosoDnsPublication({ hostVerification: receipt(ALL), senderDomains: ['uberbondhq.site'], ownerAuthorized: true, now: NOW });
  const result = await adapter.applyChanges(authorized.providerPlan);
  assert.equal(result.ok, true, JSON.stringify(result.reasonCodes));
  const writes = calls.filter(c => c.method !== 'GET');
  assert.equal(writes.some(c => c.url.endsWith('/w')), false, 'website A record untouched');
  assert.deepEqual(writes.filter(c => c.method === 'PUT').map(c => c.url.split('/').pop()).sort(), ['d1', 'd2', 'd3']);
  assert.equal(result.externalEffects, authorized.recordCount);
});
