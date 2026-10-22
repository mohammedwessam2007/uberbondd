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

const receipt = await runVerifiedDefectsSale({
  buyerId: process.env.APIFY_USER_ID ?? 'apify-user',
  websites,
  probe,
  verifyProbe: probe,
  pricePerVerifiedCents: 1, // nominal: Apify bills the configured event price, not this number
  charge: async ({ eventName }) => {
    const result = await Actor.charge({ eventName, count: 1 });
    return result?.eventChargeLimitReached ? { ok: false, reason: 'BUYER_CHARGE_LIMIT' } : { ok: true };
  },
  pushItem: item => Actor.pushData(item)
});
await Actor.setValue('SALE_RECEIPT', receipt);
await Actor.exit(`Checked ${receipt.websites} sites; delivered ${receipt.delivered} verified findings; ${receipt.refused} not reproduced or not observable (not charged).`);
