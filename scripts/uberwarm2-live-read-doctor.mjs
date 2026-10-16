#!/usr/bin/env node
/** Read-only live Winnr inventory/sender diagnostics. No SMTP or writes.
 * Usage: node scripts/uberwarm2-live-read-doctor.mjs --probe [--email=owner@domain]
 * Credentials are read only from an authenticated private runtime's
 * WINNR_API_TOKEN environment variable or an approved egress proxy.
 * Only aggregate metadata is printed, never raw rows/emails/tokens.
 */
import { createWinnrApiClient } from '../src/uberwinnr-adapter.mjs';
import { createUberWarm2ProtectedWinnrRuntime } from '../src/uberwarm2-protected-winnr-runtime.mjs';

const argv = process.argv.slice(2);
const has = flag => argv.includes(flag);
const arg = prefix => argv.find(x => x.startsWith(prefix))?.slice(prefix.length) || '';
const allowed = argv.every(x => x === '--probe' || x.startsWith('--email=') ||
  x === '--auth-mode=bearer' || x === '--auth-mode=proxy-injected');
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const identity = arg('--email=').trim().toLowerCase();
const refusal = reasons => ({ status: 'UBERWARM2_READ_ONLY_REFUSED', reasons, providerCalls: 0, sends: 0 });
const output = result => process.stdout.write(JSON.stringify(result) + '\n');
const strictCount = response => response?.ok === true && Array.isArray(response.data) &&
  (response.pagination?.has_more ?? response.pagination?.hasMore) === false
    ? response.data.length : null;

async function run() {
  if (!allowed || !has('--probe') || (identity && !EMAIL.test(identity))) {
    output(refusal(['explicit-probe-and-valid-optional-email-required']));
    process.exitCode = 2; return;
  }
  const authMode = arg('--auth-mode=') || 'bearer';
  const client = createWinnrApiClient({
    token: authMode === 'bearer' ? process.env.WINNR_API_TOKEN || '' : '',
    authMode,
    authorized: process.env.WINNR_PROVIDER_AUTHORIZED === 'true',
    termsCompatible: process.env.WINNR_TERMS_COMPATIBLE === 'true',
    evidenceRef: process.env.WINNR_EVIDENCE_REF || ''
  });
  if (client.ok !== true) {
    output(refusal(client.reasonCodes || ['protected-credential-unavailable']));
    process.exitCode = 2; return;
  }
  const [account, mailboxes, domains] = await Promise.all([
    client.getAccount(), client.listAllMailboxes(), client.listAllDomains()
  ]);
  const mailboxCount = strictCount(mailboxes);
  const domainCount = strictCount(domains);
  const inventory = {
    status: account.ok && mailboxCount !== null && domainCount !== null
      ? 'UBERWARM2_WINNR_LIVE_INVENTORY_OBSERVED' : 'UBERWARM2_WINNR_LIVE_INVENTORY_INCOMPLETE',
    accountRead: account.ok === true,
    mailboxes: mailboxCount,
    domains: domainCount,
    providerCalls: (account.providerCalls || 0) + (mailboxes.providerCalls || 0) + (domains.providerCalls || 0),
    sends: 0,
    runtimeReady: false,
    providerReceiptDigestsPresent: [account,mailboxes,domains].every(r => !!r.receipt?.responseDigest),
    missingIndependentGates: ['trusted-smtp-auth','local-holds','signed-dns-alignment',
      'owner-controlled-seed-consent','receiver-inbox-placement','postgres-one-shot-ledger']
  };
  if (identity && inventory.status === 'UBERWARM2_WINNR_LIVE_INVENTORY_OBSERVED') {
    const runtime = createUberWarm2ProtectedWinnrRuntime({ client });
    const inspected = await runtime.inspectProviderReadOnly({ email: identity, at: Date.now() });
    inventory.sender = {
      observed: inspected.ok === true,
      providerReportedHealthy: inspected.observation?.healthRowEligible === true,
      providerDnsReady: inspected.observation?.providerDnsReady === true,
      providerCalls: inspected.providerCalls || 0,
      reasonCodes: inspected.reasonCodes || [],
      authorizedToSend: false
    };
    inventory.providerCalls += inspected.providerCalls || 0;
  }
  output(inventory);
  if (inventory.status !== 'UBERWARM2_WINNR_LIVE_INVENTORY_OBSERVED') process.exitCode = 3;
}
run().catch(() => {
  output(refusal(['read-only-provider-transport-failure']));
  process.exitCode = 3;
});
