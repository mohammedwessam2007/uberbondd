#!/usr/bin/env node
/** Read-only live Winnr inventory/sender diagnostics. No SMTP or writes.
 * Usage: node scripts/uberwarm2-live-read-doctor.mjs --probe [--email=owner@domain]
 * Credentials are read only from an authenticated private runtime's
 * WINNR_API_TOKEN environment variable or an approved egress proxy.
 * Only aggregate metadata is printed, never raw rows/emails/tokens.
 */
import { createWinnrApiClient, resolveWinnrMailboxAddress } from '../src/uberwinnr-adapter.mjs';
import { inspectWinnrTokenPermissions } from '../src/uberwarm2-winnr-token-permissions.mjs';
import { compileUberWarm2SovereignLiveObservation } from '../src/uberwarm2-sovereign-live-observer.mjs';

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
    tokenPermissions: inspectWinnrTokenPermissions(account),
    mailboxes: mailboxCount,
    domains: domainCount,
    providerCalls: (account.providerCalls || 0) + (mailboxes.providerCalls || 0) + (domains.providerCalls || 0),
    sends: 0,
    runtimeReady: false,
    providerReceiptDigestsPresent: [account,mailboxes,domains].every(r => !!r.receipt?.responseDigest),
    missingIndependentGates: ['signed-current-transport-health','local-holds','signed-dns-alignment',
      'owner-controlled-seed-consent','receiver-inbox-placement','postgres-one-shot-ledger']
  };
  if (inventory.status === 'UBERWARM2_WINNR_LIVE_INVENTORY_OBSERVED') {
    inventory.sovereignControl = compileUberWarm2SovereignLiveObservation({
      mailboxes: mailboxes.data, domains: domains.data
    });
  }
  if (identity && inventory.status === 'UBERWARM2_WINNR_LIVE_INVENTORY_OBSERVED') {
    // Keep this unattended CLI completely outside the held UberWarm2 seed and
    // protected activation donor chain. It may do provider GETs, not send.
    const domain = identity.split('@')[1];
    const emailOf = m => resolveWinnrMailboxAddress(m).toLowerCase();
    const domainOf = d => String(d?.domain ?? d?.name ?? '').trim().toLowerCase();
    const matchingMailboxes = mailboxes.data.filter(m => emailOf(m) === identity);
    const matchingDomains = domains.data.filter(d => domainOf(d) === domain);
    const exact = matchingMailboxes.length === 1 && matchingDomains.length === 1;
    const domainId = matchingDomains[0]?.id ?? matchingDomains[0]?.domainId ?? matchingDomains[0]?.domain_id;
    let dns = null;
    if (exact && typeof domainId === 'string' && domainId.length && typeof client.getDnsStatus === 'function') {
      dns = await client.getDnsStatus({ domainId });
      inventory.providerCalls += dns.providerCalls || 0;
    }
    inventory.sender = {
      exactMailboxAndDomainObserved: exact,
      providerDnsRead: dns?.ok === true,
      providerDnsReportedReady: dns?.ok === true && (dns.data?.ready === true ||
        (dns.data?.ready === undefined && dns.data?.all_verified === true)),
      providerReceiptDigestPresent: !!dns?.receipt?.responseDigest,
      // Vendor rows alone never prove SMTP AUTH, local holds or DNS alignment.
      independentlyVerifiedSenderHealth: false,
      authorizedToSend: false
    };
  }
  output(inventory);
  if (inventory.status !== 'UBERWARM2_WINNR_LIVE_INVENTORY_OBSERVED') process.exitCode = 3;
}
run().catch(() => {
  output(refusal(['read-only-provider-transport-failure']));
  process.exitCode = 3;
});
