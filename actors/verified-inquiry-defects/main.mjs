// Apify Store shell. All decisions live in src/inquiry-findings.mjs,
// src/self-verifying-findings.mjs, src/charge-reservations.mjs and
// src/apify-ppe-billing.mjs (tested in the UberBond repository); this file only
// connects them to the Apify SDK. Pricing: pay-per-event, one
// "verified-finding" event per finding that reproduced at delivery time.
//
// Billing safety: a finding is charged only after its buyer/finding/day key is
// reserved in a SQL table shared by every run (CHARGE_RESERVATION_DATABASE_URL,
// a secret Actor environment variable). A key-value store cannot do this, so a
// pay-per-event run without that database stops before probing anything.
import { Actor } from 'apify';
import pg from 'pg';
import { runVerifiedDefectsSale } from './src/inquiry-findings.mjs';
import { probeInquiryPath } from './src/inquiry-path-probe.mjs';
import { witnessRuntimeTelLinks } from './src/inquiry-path-runtime-witness.mjs';
import { createSqlChargeReservations } from './src/charge-reservations.mjs';
import { apifyPayPerEventBilling } from './src/apify-ppe-billing.mjs';
import { unobservableProbe } from './src/inquiry-probe-budget.mjs';
import { renderInquiryAudit } from './src/verified-inquiry-report.mjs';

await Actor.init();
const input = (await Actor.getInput()) ?? {};
const maxSites = Math.min(40, Math.max(1, Number.isSafeInteger(input.maxSites) ? input.maxSites : 10));
if (!Array.isArray(input.websites) || input.websites.length > maxSites) {
  await Actor.fail(`Input exceeds maxSites=${maxSites}. No sites were checked or charged.`);
}
const websites = [...new Set((input.websites ?? []).map(String).filter(url => /^https?:\/\//i.test(url)))];
const runSignal = AbortSignal.timeout(600_000);
const maxPages = Math.min(8, Math.max(1, Number.isSafeInteger(input.maxPagesPerSite) ? input.maxPagesPerSite : 5));
const witnessImpl = input.runtimeWitness === false ? null : witnessRuntimeTelLinks;
const probe = async website => {
  const started = Date.now();
  if (runSignal.aborted) return unobservableProbe(website, 'RUN_TIME_BUDGET_EXHAUSTED');
  try {
    const receipt = await probeInquiryPath({ website, maxPages, maxSiteMs: 90_000, signal: runSignal, witnessImpl });
    scannedPages.push(...(receipt.pages ?? []));
    questionsForHuman.push(...(receipt.analysis?.findings ?? []).filter(item => item.firstTouchUse === 'ASK_DONT_ASSERT').map(item => ({ url: website, code: item.code, question: item.title })));
    if (receipt.pages?.length && !(receipt.analysis?.findings ?? []).some(item => item.firstTouchUse === 'MAY_STATE_AS_OBSERVED_FACT')) cleanChecks.push({ website, result: 'NO_ASSERTABLE_FINDINGS_IN_OBSERVED_PAGES_NOT_PROOF_SITE_IS_DEFECT_FREE' });
    return receipt;
  }
  catch (error) { return unobservableProbe(website, runSignal.aborted ? 'RUN_TIME_BUDGET_EXHAUSTED' : `PROBE_FAILED:${error?.name ?? 'ERROR'}`, Date.now() - started); }
};
const deliveredItems = [];
const scannedPages = [];
const questionsForHuman = [];
const cleanChecks = [];

const chargingManager = Actor.getChargingManager();
const billing = apifyPayPerEventBilling({
  pricingInfo: chargingManager.getPricingInfo(),
  charge: options => Actor.charge(options),
  maxChargeableWithinLimit: eventName => chargingManager.calculateMaxEventChargeCountWithinLimit(eventName)
});
if (billing.mode === 'NOT_CHARGEABLE') await Actor.fail(`Billing is misconfigured (${billing.reason}). No sites were checked and nothing was charged.`);

let reservations = null;
let pool = null;
if (billing.mode === 'PAY_PER_EVENT') {
  const connectionString = process.env.CHARGE_RESERVATION_DATABASE_URL;
  if (!connectionString) await Actor.fail('The billing safety store is not configured. No sites were checked and nothing was charged.');
  pool = new pg.Pool({ connectionString, max: 2, connectionTimeoutMillis: 10_000 });
  reservations = createSqlChargeReservations({ query: (sql, params) => pool.query(sql, params) });
  try { await reservations.ensureSchema(); } catch {
    await pool.end().catch(() => {});
    await Actor.fail('The billing safety store is unreachable. No sites were checked and nothing was charged.');
  }
}

const receipt = await runVerifiedDefectsSale({
  buyerId: process.env.APIFY_USER_ID ?? 'apify-user',
  runId: process.env.ACTOR_RUN_ID,
  websites,
  probe,
  verifyProbe: probe,
  ...(billing.mode === 'PAY_PER_EVENT' ? { charge: billing.charge, canCharge: billing.canCharge, pricePerVerifiedCents: billing.priceCents, reservations } : {}),
  pushItem: async item => { await Actor.pushData(item); deliveredItems.push(item); }
});
if (pool) await pool.end().catch(() => {});
await Actor.setValue('SALE_RECEIPT', { ...receipt, billingMode: billing.mode, billingModeReason: billing.reason ?? null, eventPriceUsd: billing.priceUsd ?? null });
const report = renderInquiryAudit({ pagesExamined: [...new Map(scannedPages.map(page => [page.url, page])).values()], questions: questionsForHuman, cleanChecks, sourceClass: 'ACTOR_RUN_DELIVERY_NOT_PAYMENT_EVIDENCE', approvedWebsite: websites.join(', '), scanAt: new Date().toISOString(), receipt, deliveredItems, unobservableChecks: receipt.notObservable, price: 'Apify: priced per verified finding only if paid event is configured; direct pilot proposed $99 per one-site audit. No price implies buyer authorization.' });
await Actor.setValue('AUDIT_REPORT_MARKDOWN', report.markdown);
await Actor.setValue('AUDIT_REPORT_HTML', report.html);
const unknown = receipt.billing.unknown ? ` ${receipt.billing.unknown} charge outcome(s) are unknown and will never be retried; see SALE_RECEIPT.` : '';
await Actor.exit(`Checked ${receipt.websites} sites; delivered ${receipt.delivered} verified findings; charged ${receipt.charged}; ${receipt.refused} not reproduced, not observable or over your limit (not charged).${unknown}`);
