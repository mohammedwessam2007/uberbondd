#!/usr/bin/env node
import { createWinnrApiClient, compileWinnrPostPurchaseChecklist } from '../src/uberwinnr-adapter.mjs';

const args = new Set(process.argv.slice(2));
const domainArg = process.argv.slice(2).find(arg => arg.startsWith('--domain='));
const domain = domainArg ? domainArg.slice('--domain='.length).trim().toLowerCase() : '';
const probe = args.has('--probe');

function safeSummary(value) {
  if (Array.isArray(value)) return value.map(safeSummary);
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const [key, entry] of Object.entries(value)) {
    const lower = key.toLowerCase();
    if (
      lower.includes('password') ||
      lower.includes('token') ||
      lower.includes('secret') ||
      lower === 'authorization' ||
      lower.includes('download_url') ||
      lower.includes('downloadurl')
    ) continue;
    out[key] = safeSummary(entry);
  }
  return out;
}

const checklist = compileWinnrPostPurchaseChecklist({
  plan: process.env.WINNR_PLAN || 'Startup',
  expectedMonthlyUsd: Number(process.env.WINNR_EXPECTED_MONTHLY_USD || 69),
  domains: domain ? [domain] : [],
  mailboxesPerDomain: Number(process.env.WINNR_MAILBOXES_PER_DOMAIN || 1)
});

if (!probe) {
  process.stdout.write(JSON.stringify({
    status: 'WINNR_POST_PURCHASE_PLAN_ONLY',
    checklist,
    providerCalls: 0,
    messagesSent: 0,
    nextCommandAfterPurchase: 'WINNR_API_TOKEN=... WINNR_PROVIDER_AUTHORIZED=true WINNR_TERMS_COMPATIBLE=true WINNR_EVIDENCE_REF=... npm run outreach:winnr:doctor -- --probe --domain=<owned-domain>',
    truthBoundary: 'Plan-only mode performs no Winnr calls and proves no entitlement.'
  }, null, 2) + '\n');
  process.exit(0);
}

const token = process.env.WINNR_API_TOKEN || '';
const client = createWinnrApiClient({
  token,
  authorized: process.env.WINNR_PROVIDER_AUTHORIZED === 'true',
  termsCompatible: process.env.WINNR_TERMS_COMPATIBLE === 'true',
  evidenceRef: process.env.WINNR_EVIDENCE_REF || ''
});

if (!client.ok) {
  process.stderr.write(JSON.stringify({
    status: 'WINNR_POST_PURCHASE_PROBE_REFUSED',
    reasonCodes: client.reasonCodes,
    providerCalls: 0
  }, null, 2) + '\n');
  process.exitCode = 2;
} else {
  const domains = await client.listDomains();
  const mailboxes = domain ? await client.listMailboxes({ domain }) : null;
  const result = {
    status: domains.ok && (!mailboxes || mailboxes.ok) ? 'WINNR_READ_ONLY_PROBE_CONFIRMED' : 'WINNR_READ_ONLY_PROBE_INCOMPLETE',
    checklist,
    domains: safeSummary(domains),
    mailboxes: mailboxes ? safeSummary(mailboxes) : null,
    providerCalls: Number(domains.providerCalls || 0) + Number(mailboxes?.providerCalls || 0),
    messagesSent: 0,
    writesPerformed: 0,
    spendCents: 0,
    truthBoundary: 'This command proves only read access to the paid Winnr account and observed provider objects. It does not mutate domains, create mailboxes, export passwords, send mail or prove deliverability.'
  };
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  if (result.status !== 'WINNR_READ_ONLY_PROBE_CONFIRMED') process.exitCode = 3;
}
