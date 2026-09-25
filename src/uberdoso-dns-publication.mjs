// Mail-cell bring-up output -> exact DNS publication packet.
//
// After the Postal cell is bootstrapped on a real host,
// ops/sovereign/verify-uberdoso-mail-cell.sh prints the host's public IPv4,
// PTR and the DKIM records Postal generated. This turns that receipt into the
// UberDoso DNS plan (src/uberdoso-kernel.mjs), then into the record list the
// GoDaddy adapter applies, plus the read-only verifier contracts used to
// confirm publication. It publishes nothing; scripts/uberdoso-dns-publish.mjs
// applies it only with explicit owner authorization and a runtime credential.

import crypto from 'node:crypto';
import { compileUberDosoTopology, compileUberDosoDnsPlan } from './uberdoso-kernel.mjs';
import { compileUberDosoVerifierContracts } from './uberdoso-dns-contract.mjs';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const UBERDOSO_DNS_PUBLICATION_VERSION = 'uberbond.uberdoso-dns-publication.v1';
const clean = (value, max = 4096) => String(value ?? '').trim().slice(0, max);
const sha256 = value => crypto.createHash('sha256').update(String(value)).digest('hex');
const refuse = reasonCodes => ({
  ok: false,
  version: UBERDOSO_DNS_PUBLICATION_VERSION,
  status: 'UBERDOSO_DNS_PUBLICATION_BLOCKED',
  reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
  externalEffectAuthority: 'NONE',
  externalEffectLedger: structuredClone(ZERO_EXTERNAL_EFFECTS)
});

function providerChange(record) {
  const name = clean(record.host, 253).toLowerCase().replace(/\.$/, '');
  if (record.type === 'MX') {
    const [priority, target] = clean(record.value, 300).split(/\s+/);
    return { name, type: 'MX', priority: Number(priority), value: clean(target, 253).replace(/\.$/, ''), ttl: 600 };
  }
  return { name, type: record.type, value: clean(record.value), ttl: 600 };
}

export function compileUberDosoDnsPublication({ hostVerification = {}, senderDomains = [], ownerAuthorized = false, now = new Date() } = {}) {
  if (hostVerification?.schemaVersion !== 'uberdoso.host-self-verification.v1') return refuse(['uberdoso-host-self-verification-receipt-required']);
  const evidence = hostVerification.hostEvidence || {};
  const topologyResult = compileUberDosoTopology({ senderDomains });
  if (!topologyResult.ok) return refuse(topologyResult.reasonCodes);
  const topology = topologyResult.topology;
  const roots = topology.roots.map(r => r.root);

  const dkimRecordsByDomain = {};
  for (const row of Array.isArray(hostVerification.domains) ? hostVerification.domains : []) {
    const root = clean(row?.root, 253).toLowerCase();
    if (roots.includes(root)) dkimRecordsByDomain[root] = { host: row.dkimRecordHost, value: row.dkimRecordValue };
  }
  const dns = compileUberDosoDnsPlan({ topology, publicIpv4: evidence.publicIpv4, ptrHostname: evidence.ptrHostname, dkimRecordsByDomain, date: now });
  if (!dns.ok) return refuse(dns.reasonCodes);
  if (dns.status !== 'UBERDOSO_DNS_PLAN_READY') return refuse(dns.plan.reasonCodes);

  const changes = dns.plan.records.map(providerChange);
  const orphan = changes.filter(c => !roots.some(z => c.name === z || c.name.endsWith(`.${z}`)));
  if (orphan.length) return refuse(orphan.map(c => `record-outside-owned-zones:${c.name}`));
  if (changes.some(c => c.type === 'MX' && (!Number.isInteger(c.priority) || !c.value))) return refuse(['malformed-mx-record-in-plan']);

  const contracts = compileUberDosoVerifierContracts({ dnsPlan: dns.plan, roots });
  if (!contracts.ok) return refuse(contracts.reasonCodes);

  const providerPlan = { provider: 'GODADDY', ownerAuthorized: ownerAuthorized === true, roots, changes };
  const warnings = [];
  if (evidence.outboundPort25Observed !== true) warnings.push('outbound-port-25-not-observed__dns-may-publish-but-no-mail-can-leave');
  return {
    ok: true,
    version: UBERDOSO_DNS_PUBLICATION_VERSION,
    status: 'UBERDOSO_DNS_PUBLICATION_READY',
    zones: roots,
    recordCount: changes.length,
    providerPlan,
    providerPlanDigest: sha256(JSON.stringify(providerPlan)),
    uberdosoPlanDigest: dns.plan.planDigest,
    verifierContracts: contracts.contracts,
    warnings,
    externalEffectAuthority: 'NONE',
    externalEffectLedger: structuredClone(ZERO_EXTERNAL_EFFECTS),
    truthBoundary: 'An exact record list derived from the host receipt and Postal-generated DKIM. It changes no DNS. Publication needs explicit owner authorization and a GoDaddy credential; certification needs public resolvers to return these records and Postal to mark each domain verified.'
  };
}
