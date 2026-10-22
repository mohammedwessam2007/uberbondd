// Apify Store shell. All decisions live in src/inquiry-findings.mjs and
// src/self-verifying-findings.mjs (tested in the UberBond repository); this
// file only connects them to the Apify SDK. Pricing: pay-per-event, one
// "verified-finding" event per finding that reproduced at delivery time.
import { Actor } from 'apify';
import { runVerifiedDefectsSale } from './src/inquiry-findings.mjs';
import { probeInquiryPath } from './src/inquiry-path-probe.mjs';
import { witnessRuntimeTelLinks } from './src/inquiry-path-runtime-witness.mjs';

await Actor.init();
const input = (await Actor.getInput()) ?? {};
const websites = [...new Set((input.websites ?? []).map(String).filter(url => /^https?:\/\//i.test(url)))].slice(0, 500);
const witnessImpl = input.runtimeWitness === false ? null : witnessRuntimeTelLinks;
const probe = website => probeInquiryPath({ website, maxPages: Math.min(8, Math.max(1, Number(input.maxPagesPerSite ?? 5))), witnessImpl });

// Charged keys live in a named store in the buyer's account, so a migration,
// restart or second run the same day never charges the same finding again.
const chargeKeys = await Actor.openKeyValueStore('verified-inquiry-defects-charges');
const alreadyCharged = new Set((await chargeKeys.getValue('CHARGED_KEYS')) ?? []);

const receipt = await runVerifiedDefectsSale({
  buyerId: process.env.APIFY_USER_ID ?? 'apify-user',
  websites,
  probe,
  verifyProbe: probe,
  pricePerVerifiedCents: 1, // nominal: Apify bills the configured event price, not this number
  alreadyCharged,
  onCharged: () => chargeKeys.setValue('CHARGED_KEYS', [...alreadyCharged].slice(-50_000)),
  // A charge counts only if Apify reports it billed; the limit flag stops later charges.
  charge: async ({ eventName }) => {
    const result = await Actor.charge({ eventName, count: 1 });
    const billed = (result?.chargedCount ?? 0) >= 1;
    return { ok: billed, limitReached: Boolean(result?.eventChargeLimitReached), reason: billed ? null : result?.eventChargeLimitReached ? 'BUYER_CHARGE_LIMIT' : 'NOT_BILLED' };
  },
  pushItem: item => Actor.pushData(item)
});
await Actor.setValue('SALE_RECEIPT', receipt);
await Actor.exit(`Checked ${receipt.websites} sites; delivered ${receipt.delivered} verified findings; ${receipt.refused} not reproduced or not observable (not charged).`);
