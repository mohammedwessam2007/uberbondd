/**
 * One bounded authenticated Winnr DNS GET per ordinary monitor invocation.
 * Rotates domain selection by five-minute epoch slot; no writes, billing,
 * mailbox content, sender permission, DKIM-alignment claims or warmup traffic.
 * All outputs are aggregate; the selected domain and provider IDs stay private.
 */
export const UBERWARM2_PROVIDER_DNS_SPOTCHECK_VERSION = 'uberbond.uberwarm2-provider-dns-spotcheck.v1';
const asDomain = value => String(value ?? '').trim().toLowerCase();
const validDomain = value => /^[a-z0-9]+(?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9]+(?:[a-z0-9-]*[a-z0-9])?)+$/.test(value);
const denied = (reason, checked = false) => Object.freeze({
  version: UBERWARM2_PROVIDER_DNS_SPOTCHECK_VERSION,
  status: 'UBERWARM2_PROVIDER_DNS_SPOTCHECK_HELD', reasonCodes: [reason],
  checked, providerReportedReady: false, reportedRecordTypesVerified: 0,
  authenticatedProviderReceiptObserved: false, providerCalls: checked ? 1 : 0,
  independentlyVerifiedMessageAuthentication: false, sends: 0, spendCents: 0,
  sendAuthority: 'NONE'
});

export async function observeUberWarm2ProviderDnsSpotcheck({domains, getDnsStatus, now = new Date()} = {}) {
  if (!Array.isArray(domains) || domains.length === 0 || domains.length > 100 ||
      typeof getDnsStatus !== 'function') return denied('complete-domain-inventory-and-get-reader-required');
  const ms = new Date(now).getTime();
  if (!Number.isFinite(ms) || ms < 0) return denied('invalid-observation-clock');
  const rows = [];
  const names = new Set();
  const ids = new Set();
  for (const row of domains) {
    const name = asDomain(row?.domain ?? row?.name);
    const id = row?.id ?? row?.domainId ?? row?.domain_id;
    if (!validDomain(name) || typeof id !== 'string' || !/^[a-zA-Z0-9._:-]{1,240}$/.test(id) ||
      names.has(name) || ids.has(id)) return denied('provider-domain-identity-missing-or-ambiguous');
    names.add(name); ids.add(id); rows.push({name, id});
  }
  // Sorting makes rotation independent of provider pagination/list order.
  rows.sort((a,b) => a.name.localeCompare(b.name, 'en'));
  const selected = rows[Math.floor(ms / 300000) % rows.length];
  let response;
  try { response = await getDnsStatus({domainId: selected.id}); }
  catch { return denied('provider-dns-read-threw', true); }
  const received = response?.data;
  if (response?.ok !== true || !response?.receipt?.responseDigest ||
      !/^sha256:[a-f0-9]{64}$/.test(String(response.receipt.responseDigest))) {
    return denied('provider-authenticated-read-receipt-unavailable', true);
  }
  if (!received || asDomain(received.domain ?? received.name) !== selected.name) {
    return denied('provider-dns-domain-mismatch-or-missing', true);
  }
  const types = ['mx','spf','dkim','dmarc'];
  const count = types.filter(k => received.records?.[k]?.verified === true).length;
  const ready = received.ns_status === true && received.all_verified === true && count === types.length;
  return Object.freeze({
    version: UBERWARM2_PROVIDER_DNS_SPOTCHECK_VERSION,
    status: ready ? 'UBERWARM2_PROVIDER_DNS_SPOTCHECK_REPORTED_READY'
      : 'UBERWARM2_PROVIDER_DNS_SPOTCHECK_HELD',
    reasonCodes: ready ? [] : ['provider-dns-authentication-records-incomplete-or-negative'],
    checked: true, providerReportedReady: ready,
    reportedRecordTypesVerified: count, authenticatedProviderReceiptObserved: true,
    providerCalls: 1, independentlyVerifiedMessageAuthentication: false,
    sends: 0, spendCents: 0, sendAuthority: 'NONE'
  });
}
