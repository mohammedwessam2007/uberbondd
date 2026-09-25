#!/usr/bin/env node
// Publish the mail cell's DNS in one step after bring-up.
//   node scripts/uberdoso-dns-publish.mjs --host-verification verify.json [--senders uberbondhq.site,...]
//       prints the exact records per zone (no DNS change)
//   GODADDY_PAT=... node scripts/uberdoso-dns-publish.mjs --host-verification verify.json --senders ... --apply --owner-authorized
//       applies them through the GoDaddy adapter, then observes public DNS
// verify.json is the output of ops/sovereign/verify-uberdoso-mail-cell.sh on the mail host.
import fs from 'node:fs';
import { compileUberDosoDnsPublication } from '../src/uberdoso-dns-publication.mjs';
import { createGoDaddyDnsAdapter } from '../src/uberdns-godaddy-adapter.mjs';
import { observeFleetDns } from '../src/outreach-fleet-dns-observatory.mjs';

const arg = name => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; };
const hostPath = arg('--host-verification');
if (!hostPath) { process.stderr.write('--host-verification <path> required\n'); process.exit(2); }
const senderDomains = (arg('--senders') || '').split(',').map(s => s.trim()).filter(Boolean);
const apply = process.argv.includes('--apply');
const ownerAuthorized = process.argv.includes('--owner-authorized');

const publication = compileUberDosoDnsPublication({
  hostVerification: JSON.parse(fs.readFileSync(hostPath, 'utf8')),
  senderDomains,
  ownerAuthorized
});
if (!publication.ok) { process.stdout.write(`${JSON.stringify(publication, null, 2)}\n`); process.exit(2); }

if (!apply) {
  const byZone = Object.fromEntries(publication.zones.map(z => [z, publication.providerPlan.changes.filter(c => c.name === z || c.name.endsWith(`.${z}`))]));
  process.stdout.write(`${JSON.stringify({ mode: 'DRY_RUN_NO_DNS_CHANGE', status: publication.status, recordCount: publication.recordCount, warnings: publication.warnings, providerPlanDigest: publication.providerPlanDigest, recordsByZone: byZone }, null, 2)}\n`);
} else {
  if (!ownerAuthorized) { process.stderr.write('--apply requires --owner-authorized\n'); process.exit(2); }
  if (!process.env.GODADDY_PAT) { process.stderr.write('--apply requires GODADDY_PAT in the environment\n'); process.exit(2); }
  const adapter = createGoDaddyDnsAdapter({ pat: process.env.GODADDY_PAT });
  const result = await adapter.applyChanges(publication.providerPlan);
  const observed = result.ok ? await observeFleetDns({ domains: publication.zones }) : null;
  process.stdout.write(`${JSON.stringify({ mode: 'APPLY', providerPlanDigest: publication.providerPlanDigest, result, publicDnsAfterApply: observed?.summary ?? null }, null, 2)}\n`);
  process.exitCode = result.ok ? 0 : 2;
}
