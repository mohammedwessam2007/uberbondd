import test from 'node:test';
import assert from 'node:assert/strict';
import { observeDomainDns, observeFleetDns, GODADDY_PARKING_IPV4 } from '../src/outreach-fleet-dns-observatory.mjs';

const err = code => Object.assign(new Error(code), { code });
function fakeResolver(zones) {
  const get = (host, key) => {
    const value = zones[host]?.[key];
    if (value instanceof Error) throw value;
    if (value === undefined) throw err('ENODATA');
    return value;
  };
  return {
    resolveNs: async h => get(h, 'ns'),
    resolveMx: async h => get(h, 'mx'),
    resolveTxt: async h => get(h, 'txt'),
    resolve4: async h => get(h, 'a')
  };
}
const GD_NS = ['ns45.domaincontrol.com', 'ns46.domaincontrol.com'];
const GD_DMARC = [['v=DMARC1; p=quarantine; adkim=r; aspf=r; rua=mailto:dmarc_rua@onsecureserver.net;']];

test('a fresh GoDaddy outreach domain is observed as unconfigured with a replace-not-add DMARC finding', async () => {
  const row = await observeDomainDns('uberbondhq.site', { resolver: fakeResolver({
    'uberbondhq.site': { ns: GD_NS, a: [...GODADDY_PARKING_IPV4] },
    '_dmarc.uberbondhq.site': { txt: GD_DMARC }
  }) });
  assert.equal(row.role, 'OUTREACH_FLEET');
  assert.equal(row.nameservers.provider, 'GODADDY');
  assert.equal(row.mailState, 'NO_MAIL_CONFIGURED');
  assert.equal(row.dmarc.state, 'GODADDY_DEFAULT');
  assert.equal(row.dmarc.policy, 'quarantine');
  assert.equal(row.apex.state, 'GODADDY_PARKING_ONLY');
  assert.deepEqual(row.findings, ['godaddy-default-dmarc-present__replace-do-not-add', 'outreach-domain-apex-is-registrar-parking-page']);
});

test('lookup failures are incomplete observations, never absence', async () => {
  const row = await observeDomainDns('uberbondhq.site', { resolver: fakeResolver({
    'uberbondhq.site': { ns: GD_NS, mx: err('ECONNREFUSED'), txt: err('ETIMEOUT'), a: err('ECONNREFUSED') },
    '_dmarc.uberbondhq.site': { txt: err('ECONNREFUSED') }
  }) });
  assert.equal(row.mailState, 'OBSERVATION_INCOMPLETE');
  assert.equal(row.mx.state, 'LOOKUP_FAILED');
  assert.equal(row.dmarc.state, 'LOOKUP_FAILED');
  assert.deepEqual(row.findings, []);
});

test('mixed parking/hosting apex, duplicate SPF and duplicate DMARC are flagged', async () => {
  const row = await observeDomainDns('uberbond.cloud', { resolver: fakeResolver({
    'uberbond.cloud': { ns: GD_NS, a: ['162.159.143.30', '3.33.130.190'], mx: [{ exchange: 'mta.uberbond.cloud', priority: 10 }], txt: [['v=spf1 mx -all'], ['v=spf1 a -all'], ['google-site-verification=x']] },
    '_dmarc.uberbond.cloud': { txt: [['v=DMARC1; p=none'], ['v=DMARC1; p=reject']] }
  }) });
  assert.equal(row.role, 'CANONICAL_ROOT');
  assert.equal(row.apex.state, 'MIXED_PARKING_AND_HOSTING');
  assert.equal(row.spf.state, 'MULTIPLE_PERMERROR');
  assert.equal(row.dmarc.state, 'MULTIPLE_INVALID');
  assert.equal(row.mailState, 'PARTIAL_MAIL_CONFIGURATION');
  assert.ok(row.findings.includes('multiple-spf-records__permerror'));
  assert.ok(row.findings.includes('multiple-dmarc-records__policy-invalid'));
  assert.ok(row.findings.includes('apex-mixes-godaddy-parking-with-hosting__part-of-traffic-sees-parking'));
});

test('a configured domain is never reported as an authenticated sender without DKIM', async () => {
  const receipt = await observeFleetDns({ domains: ['uberbondhq.site'], now: new Date('2026-09-25T00:00:00Z'), resolver: fakeResolver({
    'uberbondhq.site': { ns: ['a.ns.cloudflare.com', 'b.ns.cloudflare.com'], a: ['198.51.100.7'], mx: [{ exchange: 'mta.uberbond.cloud', priority: 10 }], txt: [['v=spf1 mx -all']] },
    '_dmarc.uberbondhq.site': { txt: [['v=DMARC1; p=quarantine; adkim=r; aspf=r']] }
  }) });
  const row = receipt.domains[0];
  assert.equal(row.nameservers.provider, 'CLOUDFLARE');
  assert.equal(row.dmarc.state, 'CUSTOM');
  assert.equal(row.mailState, 'MX_SPF_DMARC_PRESENT_DKIM_UNOBSERVED');
  assert.equal(receipt.summary.authenticatedSenderDomains, 0);
  assert.ok(Object.values(receipt.externalEffectLedger).every(v => v === 0));
  assert.match(receipt.receiptDigest, /^[0-9a-f]{64}$/);
});

test('the fleet receipt covers both canonical roots and all 28 outreach domains by default', async () => {
  const receipt = await observeFleetDns({ resolver: fakeResolver({}) });
  assert.equal(receipt.domainsObserved, 30);
  assert.equal(receipt.domains.filter(r => r.role === 'CANONICAL_ROOT').length, 2);
  assert.equal(receipt.domains.filter(r => r.role === 'OUTREACH_FLEET').length, 28);
  assert.equal(receipt.summary.mailState.NO_MAIL_CONFIGURED, 30);
});
