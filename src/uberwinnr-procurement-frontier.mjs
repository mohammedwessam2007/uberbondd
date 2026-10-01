export const UBERWINNR_PROCUREMENT_VERSION = 'uberbond.uberwinnr-procurement.v1';

export const WINNR_PUBLIC_FACTS_2026_10_01 = Object.freeze({
  observedAt: '2026-10-01',
  sourceClass: 'FIRST_PARTY_PUBLIC_DOCS_AND_OFFICIAL_MCP',
  startup: Object.freeze({
    monthlyUsd: 69,
    includedMailboxes: 50,
    normalColdPerMailboxPerDay: 15,
    coldRangePerMailboxPerDay: Object.freeze([10, 20]),
    totalMailPerMailboxPerDayCeiling: 50
  }),
  prewarmed: Object.freeze({
    monthlyUsdPerAddress: 3,
    minimumAddresses: 3,
    basePlanRequired: false,
    minimumTermMonths: 0,
    normalColdPerMailboxPerDay: 15,
    coldRangePerMailboxPerDay: Object.freeze([10, 20])
  }),
  warming: Object.freeze({
    optional: true,
    monthlyUsdPerMailbox: 0.60
  }),
  intendedUseTerms: 'NON_OPTED_IN_CONTACT_ALLOWED_SUBJECT_TO_PHYSICAL_ADDRESS_COMPANY_NAME_REASON_FOR_CONTACT_UNSUBSCRIBE_VALUE_COMPANY_EMAIL_WHEN_POSSIBLE_AND_APPLICABLE_LAW'
});

const positiveInt=(value,fallback=0)=> {
  const n=Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.ceil(n)) : fallback;
};
const money=value=>Number(Number(value||0).toFixed(2));

export function compileWinnrProcurementFrontier({
  targetDailyCold = 45,
  firstCashUrgent = true,
  existingWarmedTransport = false,
  publicTermsCurrent = true,
  publicTermsCompatible = true,
  checkoutObserved = false,
  countryPaymentAccepted = false,
  inventoryObserved = false,
  exactFirstChargeObserved = false,
  exactFirstChargeUsd = null,
  maxPilotSpendUsd = 15
} = {}) {
  const target = Math.max(1, positiveInt(targetDailyCold, 45));
  const pre = WINNR_PUBLIC_FACTS_2026_10_01.prewarmed;
  const startup = WINNR_PUBLIC_FACTS_2026_10_01.startup;

  const prewarmedAddressesForTarget = Math.max(pre.minimumAddresses, Math.ceil(target / pre.normalColdPerMailboxPerDay));
  const prewarmedMonthlyForTarget = money(prewarmedAddressesForTarget * pre.monthlyUsdPerAddress);
  const minimumPilot = Object.freeze({
    addresses: pre.minimumAddresses,
    monthlyUsd: money(pre.minimumAddresses * pre.monthlyUsdPerAddress),
    nominalNormalColdDaily: pre.minimumAddresses * pre.normalColdPerMailboxPerDay,
    nominalColdRangeDaily: Object.freeze([
      pre.minimumAddresses * pre.coldRangePerMailboxPerDay[0],
      pre.minimumAddresses * pre.coldRangePerMailboxPerDay[1]
    ]),
    firstOperationalCapComesFrom: 'UBERWARM2_OBSERVED_EVIDENCE_NOT_MARKETING_CAPACITY'
  });

  const startupNominalNormalColdDaily = startup.includedMailboxes * startup.normalColdPerMailboxPerDay;
  const startupNominalColdRangeDaily = Object.freeze([
    startup.includedMailboxes * startup.coldRangePerMailboxPerDay[0],
    startup.includedMailboxes * startup.coldRangePerMailboxPerDay[1]
  ]);

  const monthlyCrossoverAddresses = Math.floor(startup.monthlyUsd / pre.monthlyUsdPerAddress);
  const monthlyCrossoverDailyAtNormalPace = monthlyCrossoverAddresses * pre.normalColdPerMailboxPerDay;

  const prewarmedCheaperAtTarget = prewarmedMonthlyForTarget <= startup.monthlyUsd;
  const pilotSpendFits = minimumPilot.monthlyUsd <= Number(maxPilotSpendUsd);
  const exactChargeFits = exactFirstChargeObserved === true
    ? Number.isFinite(Number(exactFirstChargeUsd)) && Number(exactFirstChargeUsd) <= Number(maxPilotSpendUsd)
    : false;

  let route = 'WINNR_STARTUP_AFTER_REPUTATION_PROOF';
  if (existingWarmedTransport === true) route = 'NO_WINNR_PURCHASE_NEEDED_FOR_CURRENT_CANARY';
  else if (firstCashUrgent === true && pilotSpendFits) route = 'WINNR_PREWARMED_MINIMUM_CANARY';
  else if (prewarmedCheaperAtTarget) route = 'WINNR_PREWARMED_TARGET_CAPACITY';
  else route = 'WINNR_STARTUP_CAPACITY_ROUTE';

  const blockers = [];
  if (!publicTermsCurrent) blockers.push('current-public-terms-required');
  if (!publicTermsCompatible) blockers.push('intended-use-terms-compatibility-required');
  if (!checkoutObserved) blockers.push('authenticated-checkout-required');
  if (!countryPaymentAccepted) blockers.push('country-payment-acceptance-unobserved');
  if (route.startsWith('WINNR_PREWARMED') && !inventoryObserved) blockers.push('live-prewarmed-inventory-unobserved');
  if (!exactFirstChargeObserved) blockers.push('exact-first-charge-unobserved');
  if (exactFirstChargeObserved && !exactChargeFits) blockers.push('first-charge-exceeds-founder-pilot-ceiling');

  return Object.freeze({
    version: UBERWINNR_PROCUREMENT_VERSION,
    generatedFromEvidenceAsOf: WINNR_PUBLIC_FACTS_2026_10_01.observedAt,
    route,
    purchaseReady: blockers.length === 0,
    blockers,
    targetDailyCold: target,
    minimumPilot,
    targetEconomics: Object.freeze({
      prewarmedAddressesForTarget,
      prewarmedMonthlyUsd: prewarmedMonthlyForTarget,
      startupMonthlyUsd: startup.monthlyUsd,
      startupIncludedMailboxes: startup.includedMailboxes,
      startupNominalNormalColdDaily,
      startupNominalColdRangeDaily,
      prewarmedCheaperAtTarget
    }),
    crossover: Object.freeze({
      addressesAtOrBelowStartupMonthlyPrice: monthlyCrossoverAddresses,
      normalColdDailyAtCrossover: monthlyCrossoverDailyAtNormalPace,
      interpretation: 'Above this pre-warmed mailbox count, Startup is cheaper recurring on public list price, but fresh Startup mailboxes still need real reputation evidence before scale.'
    }),
    ownerPurchasePacket: Object.freeze({
      action: route === 'WINNR_PREWARMED_MINIMUM_CANARY'
        ? 'BUY_ONE_GREEN_PREWARMED_DOMAIN_WITH_MINIMUM_3_ADDRESSES'
        : route === 'WINNR_PREWARMED_TARGET_CAPACITY'
          ? `BUY_GREEN_PREWARMED_CAPACITY_FOR_${prewarmedAddressesForTarget}_ADDRESSES`
          : route === 'WINNR_STARTUP_CAPACITY_ROUTE'
            ? 'BUY_WINNR_STARTUP'
            : 'NO_PURCHASE',
      expectedPublicListChargeUsd: route.startsWith('WINNR_PREWARMED') ? (route === 'WINNR_PREWARMED_MINIMUM_CANARY' ? minimumPilot.monthlyUsd : prewarmedMonthlyForTarget) : startup.monthlyUsd,
      maxPilotSpendUsd: Number(maxPilotSpendUsd),
      automaticPurchaseAuthority: false
    }),
    externalEffectAuthority: 'NONE',
    spendAuthorized: false,
    truthBoundary: 'This compiler compares dated first-party public prices and nominal mailbox pacing only. It does not prove live marketplace inventory, account eligibility, Egypt card acceptance, taxes, exact checkout charge, inbox placement, or permission for a specific campaign. UberWarm² remains the live cap authority after purchase.'
  });
}
