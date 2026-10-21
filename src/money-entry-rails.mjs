// Money Entry Rail Registry.
//
// Every profit mechanism eventually needs one boring fact to be true: money
// can lawfully arrive in an account the founder controls, from where he lives.
// For an Egypt-resident founder several famous rails fail (Stripe does not
// serve Egyptian merchants; crypto needs a Central Bank licence nobody has).
// This registry records each rail's status with dated evidence, and classifies
// a mechanism's stated rail so the tournament cannot rank an idea whose money
// has no way in. Statuses only move toward VERIFIED_WORKING on a real payout.

export const MONEY_ENTRY_RAILS_VERSION = 'uberbond.money-entry-rails-1.0.0';
export const RAIL_STATUSES = Object.freeze(['VERIFIED_WORKING', 'PLAUSIBLE', 'UNVERIFIED', 'UNSUPPORTED', 'LEGALLY_BLOCKED_PENDING_COUNSEL']);

export const RAILS = Object.freeze([
  {
    id: 'STRIPE_DIRECT', status: 'UNSUPPORTED', match: /\bstripe\b/i,
    howMoneyArrives: 'Card payments settled to a Stripe merchant account.',
    evidence: [{ url: 'https://thecondia.com/stripe-africa-payments-tax-2025/', claim: 'Stripe direct merchant processing does not cover Egypt; workarounds need a foreign entity.', observedOn: '2026-10-21' }],
    founderActions: ['A foreign legal entity would be required; not recommended without counsel.']
  },
  {
    id: 'CRYPTO_RECEIVE_OR_TRADE', status: 'LEGALLY_BLOCKED_PENDING_COUNSEL', match: /crypto|usdc|usdt|stablecoin|x402|on-?chain|defi|polymarket|token/i,
    howMoneyArrives: 'Stablecoin or crypto settlement to a wallet or exchange account.',
    evidence: [
      { url: 'https://eg.andersen.com/legality-cryptocurrency-in-egypt/', claim: 'Law 194/2020 Art. 206 requires a Central Bank of Egypt licence to issue, trade or promote crypto; reported penalties include imprisonment and fines.', observedOn: '2026-10-21' },
      { url: 'https://www.lightspark.com/knowledge/is-crypto-legal-in-egypt', claim: 'No licences reported granted and no published licensing framework.', observedOn: '2026-10-21' }
    ],
    founderActions: ['Written opinion from Egyptian counsel before any crypto rail is used.']
  },
  {
    id: 'APIFY_STORE_PAYOUT', status: 'PLAUSIBLE', match: /apify/i,
    howMoneyArrives: 'Users pay Apify per event/result; Apify pays the developer monthly, keeping 20% plus platform usage costs.',
    evidence: [
      { url: 'https://docs.apify.com/platform/actors/publishing/monetize', claim: 'Apify keeps 20% of Actor revenue; platform usage costs are deducted from payout; never charges if the Actor earns nothing.', observedOn: '2026-10-21' },
      { url: 'https://docs.apify.com/platform/actors/publishing/monetize/monthly-payouts', claim: 'Payout threshold $20 for PayPal and Wise, $100 for other methods; billing details, payment method and identity verification required.', observedOn: '2026-10-21' }
    ],
    founderActions: ['Create an Apify account, complete identity verification and payout details.']
  },
  {
    id: 'PAYPAL_EGYPT', status: 'PLAUSIBLE', match: /paypal/i,
    howMoneyArrives: 'Payments received into an Egypt PayPal account linked to an Egypt-issued Visa card or a US bank account, then withdrawn.',
    evidence: [{ url: 'https://www.paypal.com/eg/webapps/mpp/setup-to-receive-withdraw', claim: 'Receiving requires linking an Egypt-issued Visa card or a US bank account; balance auto-transfers monthly, manual withdrawals any time.', observedOn: '2026-10-21' }],
    founderActions: ['Confirm the PayPal account can receive commercial payments and link an Egypt-issued Visa card.']
  },
  {
    id: 'UPWORK_LOCAL_BANK', status: 'PLAUSIBLE', match: /upwork|fiverr|freelanc/i,
    howMoneyArrives: 'Marketplace client pays the platform; platform pays out to a local Egyptian bank in EGP or via Payoneer.',
    evidence: [{ url: 'https://www.elevatepay.co/blog/upwork-fees-egypt', claim: 'Direct-to-local-bank EGP withdrawals available for Egypt (secondary source; fees and FX markup apply).', observedOn: '2026-10-21' }],
    founderActions: ['Marketplace account and identity verification; this rail sells hours unless the listing is a productized automated deliverable.']
  },
  {
    id: 'PAYONEER', status: 'UNVERIFIED', match: /payoneer/i,
    howMoneyArrives: 'Receiving accounts or marketplace payouts into Payoneer, withdrawn to a local bank.',
    evidence: [{ url: 'https://www.payoneer.com/about/fees/', claim: 'Fees depend on payment type, method, currency and corridor; exact fee shown before confirming.', observedOn: '2026-10-21' }],
    founderActions: ['Open/confirm a Payoneer account and read the Egypt withdrawal fee in-account.']
  },
  {
    id: 'PADDLE_OR_LEMON_SQUEEZY', status: 'UNVERIFIED', match: /paddle|lemon ?squeezy|gumroad|merchant of record|\bmor\b/i,
    howMoneyArrives: 'A merchant of record sells digital products and pays out to the seller.',
    evidence: [{ url: 'https://developer.paddle.com/concepts/sell/supported-countries-locales', claim: 'Public page lists buyer countries; seller payout eligibility for Egypt not shown publicly.', observedOn: '2026-10-21' }],
    founderActions: ['Ask the provider in writing whether an Egypt-resident individual seller is eligible before building around it.']
  },
  {
    id: 'INTERNATIONAL_BANK_WIRE', status: 'PLAUSIBLE', match: /wire|swift|bank transfer|invoice/i,
    howMoneyArrives: 'Customer pays an invoice by international SWIFT transfer to the founder\'s Egyptian bank account.',
    evidence: [],
    founderActions: ['Confirm the receiving bank accepts commercial inbound USD transfers and its documentation requirements.']
  }
]);

const STRENGTH = { VERIFIED_WORKING: 4, PLAUSIBLE: 3, UNVERIFIED: 2, UNSUPPORTED: 0, LEGALLY_BLOCKED_PENDING_COUNSEL: 0 };

/**
 * Classify free-text rail descriptions. The best usable rail named decides;
 * a mechanism that names only blocked or unsupported rails is RAIL_BLOCKED,
 * and one that names nothing recognisable is RAIL_UNSPECIFIED.
 */
export function classifyRail(text) {
  const named = RAILS.filter(rail => rail.match.test(String(text ?? '')));
  if (!named.length) return { verdict: 'RAIL_UNSPECIFIED', rails: [], strength: 0 };
  // A usable payout route cannot legalize the underlying blocked activity.
  // Ambiguous mixed-rail descriptions fail closed until the activity and settlement are independently checked.
  const blocked = named.find(rail => STRENGTH[rail.status] === 0);
  const best = blocked ?? named.reduce((a, b) => (STRENGTH[b.status] > STRENGTH[a.status] ? b : a));
  return {
    verdict: STRENGTH[best.status] === 0 ? 'RAIL_BLOCKED' : STRENGTH[best.status] >= 3 ? 'RAIL_PLAUSIBLE' : 'RAIL_UNVERIFIED',
    rails: named.map(rail => ({ id: rail.id, status: rail.status })),
    best: best.id,
    strength: STRENGTH[best.status],
    founderActions: best.founderActions
  };
}
