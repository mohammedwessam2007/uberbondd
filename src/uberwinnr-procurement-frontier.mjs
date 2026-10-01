export const UBERWINNR_PROCUREMENT_VERSION = 'uberbond.uberwinnr-procurement.v2';

export const WINNR_PUBLIC_FACTS_2026_10_02 = Object.freeze({
  observedAt: '2026-10-02',
  sourceClass: 'FIRST_PARTY_HELP_DOCS_OFFICIAL_MCP_AND_WRITTEN_SUPPORT',
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
    normalColdPerMailboxPerDay: 15,
    coldRangePerMailboxPerDay: Object.freeze([10, 15]),
    totalMailPerMailboxPerDayCeiling: 50,
    mcpMinimumTermMonthsClaim: 0,
    helpMinimumTermMonthsClaim: 3,
    minimumTermConflictObserved: true,
    publicHelpMinimumCommittedMonths: 3,
    publicHelpMinimumCommittedUsdAtMinimumAddresses: 27
  }),
  warming: Object.freeze({
    optional: true,
    monthlyUsdPerMailbox: 0.60
  }),
  writtenSupport: Object.freeze({
    egyptAvailable: true,
    internationalVisaMastercardAccepted: true,
    basePlanRequiredForPrewarmed: false,
    minimumInitialChargeUsd: 9,
    smtpImapExportSupported: true,
    lawfulB2BUseDescribedByUberBondAccepted: true,
    materiallyListedAtHandoverRemedy: 'SWAP_OR_REFUND_MONTH'
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
  prewarmedMinimumTermConflictResolved = false,
  resolvedPrewarmedMinimumTermMonths = null,
  minimumCommitmentObserved = false,
  exactMinimumCommittedUsd = null,
  maxPilotSpendUsd = 15,
  maxPilotCommittedSpendUsd = 15
} = {}) {
  const target = Math.max(1, positiveInt(targetDailyCold, 45));
  const pre = WINNR_PUBLIC_FACTS_2026_10_02.prewarmed;
  const startup = WINNR_PUBLIC_FACTS_2026_10_02.startup;

  const prewarmedAddressesForTarget = Math.max(pre.minimumAddresses, Math.ceil(target / pre.normalColdPerMailboxPerDay));
  const prewarmedMonthlyForTarget = money(prewarmedAddressesForTarget * pre.monthlyUsdPerAddress);
  const minimumPilotMonthlyUsd = money(pre.minimumAddresses * pre.monthlyUsdPerAddress);
  const minimumPilot = Object.freeze({
    addresses: pre.minimumAddresses,
    firstMonthUsd: minimumPilotMonthlyUsd,
    monthlyUsd: minimumPilotMonthlyUsd,
    publicHelpMinimumCommittedMonths: pre.publicHelpMinimumCommittedMonths,
    publicHelpMinimumCommittedUsd: pre.publicHelpMinimumCommittedUsdAtMinimumAddresses,
    mcpMinimumTermMonthsClaim: pre.mcpMinimumTermMonthsClaim,
    helpMinimumTermMonthsClaim: pre.helpMinimumTermMonthsClaim,
    minimumTermConflictObserved: pre.minimumTermConflictObserved,
    nominalNormalColdDaily: pre.minimumAddresses * pre.normalColdPerMailboxPerDay,
    nominalColdRangeDaily: Object.freeze([
      pre.minimumAddresses * pre.coldRangePerMailboxPerDay[0],
      pre.minimumAddresses * pre.coldRangePerMailboxPerDay[1]
    ]),
    hardTechnicalMailCeilingDaily: pre.minimumAddresses * pre.totalMailPerMailboxPerDayCeiling,
    firstOperationalCapComesFrom: 'UBERWARM2_OBSERVED_EVIDENCE_NOT_PROVIDER_MARKETING_CAPACITY'
  });

  const startupNominalNormalColdDaily = startup.includedMailboxes * startup.normalColdPerMailboxPerDay;
  const startupNominalColdRangeDaily = Object.freeze([
    startup.includedMailboxes * startup.coldRangePerMailboxPerDay[0],
    startup.includedMailboxes * startup.coldRangePerMailboxPerDay[1]
  ]);

  const monthlyCrossoverAddresses = Math.floor(startup.monthlyUsd / pre.monthlyUsdPerAddress);
  const monthlyCrossoverDailyAtNormalPace = monthlyCrossoverAddresses * pre.normalColdPerMailboxPerDay;
  const prewarmedCheaperAtTarget = prewarmedMonthlyForTarget <= startup.monthlyUsd;
  const pilotFirstChargeFits = minimumPilot.firstMonthUsd <= Number(maxPilotSpendUsd);

  let route = 'WINNR_STARTUP_AFTER_REPUTATION_PROOF';
  if (existingWarmedTransport === true) route = 'NO_WINNR_PURCHASE_NEEDED_FOR_CURRENT_CANARY';
  else if (firstCashUrgent === true && pilotFirstChargeFits) route = 'WINNR_PREWARMED_MINIMUM_CANARY';
  else if (prewarmedCheaperAtTarget) route = 'WINNR_PREWARMED_TARGET_CAPACITY';
  else route = 'WINNR_STARTUP_CAPACITY_ROUTE';

  const prewarmedRoute = route.startsWith('WINNR_PREWARMED');
  const resolvedMonths = Number(resolvedPrewarmedMinimumTermMonths);
  const termResolutionValid = prewarmedMinimumTermConflictResolved === true
    && Number.isInteger(resolvedMonths)
    && resolvedMonths >= 0;
  const exactCharge = Number(exactFirstChargeUsd);
  const exactCommitment = Number(exactMinimumCommittedUsd);
  const firstChargeFits = exactFirstChargeObserved === true
    ? Number.isFinite(exactCharge) && exactCharge >= 0 && exactCharge <= Number(maxPilotSpendUsd)
    : false;
  const committedSpendFits = minimumCommitmentObserved === true
    ? Number.isFinite(exactCommitment) && exactCommitment >= 0 && exactCommitment <= Number(maxPilotCommittedSpendUsd)
    : false;

  const blockers = [];
  if (!publicTermsCurrent) blockers.push('current-public-terms-required');
  if (!publicTermsCompatible) blockers.push('intended-use-terms-compatibility-required');
  if (!checkoutObserved) blockers.push('authenticated-checkout-required');
  if (!countryPaymentAccepted) blockers.push('country-payment-acceptance-unobserved');
  if (prewarmedRoute && !inventoryObserved) blockers.push('live-prewarmed-inventory-unobserved');
  if (!exactFirstChargeObserved) blockers.push('exact-first-charge-unobserved');
  if (exactFirstChargeObserved && !firstChargeFits) blockers.push('first-charge-exceeds-founder-pilot-ceiling');

  if (prewarmedRoute) {
    if (!termResolutionValid) blockers.push('prewarmed-minimum-term-conflict-unresolved');
    if (!minimumCommitmentObserved) blockers.push('exact-minimum-commitment-unobserved');
    if (minimumCommitmentObserved && !Number.isFinite(exactCommitment)) blockers.push('minimum-commitment-invalid');
    else if (minimumCommitmentObserved && !committedSpendFits) blockers.push('minimum-commitment-exceeds-founder-pilot-ceiling');
  }

  return Object.freeze({
    version: UBERWINNR_PROCUREMENT_VERSION,
    generatedFromEvidenceAsOf: WINNR_PUBLIC_FACTS_2026_10_02.observedAt,
    route,
    purchaseReady: blockers.length === 0,
    blockers: [...new Set(blockers)],
    targetDailyCold: target,
    minimumPilot,
    termEvidence: Object.freeze({
      conflictObserved: pre.minimumTermConflictObserved,
      officialMcpClaimMonths: pre.mcpMinimumTermMonthsClaim,
      firstPartyHelpClaimMonths: pre.helpMinimumTermMonthsClaim,
      resolved: termResolutionValid,
      resolvedMinimumTermMonths: termResolutionValid ? resolvedMonths : null,
      exactMinimumCommitmentObserved: minimumCommitmentObserved === true,
      exactMinimumCommittedUsd: minimumCommitmentObserved && Number.isFinite(exactCommitment) ? money(exactCommitment) : null
    }),
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
        ? 'BUY_ONE_GREEN_PREWARMED_DOMAIN_WITH_MINIMUM_3_ADDRESSES_AFTER_TERM_RECONCILIATION'
        : route === 'WINNR_PREWARMED_TARGET_CAPACITY'
          ? `BUY_GREEN_PREWARMED_CAPACITY_FOR_${prewarmedAddressesForTarget}_ADDRESSES_AFTER_TERM_RECONCILIATION`
          : route === 'WINNR_STARTUP_CAPACITY_ROUTE'
            ? 'BUY_WINNR_STARTUP_AFTER_AUTHENTICATED_CHECKOUT'
            : 'NO_PURCHASE',
      expectedFirstChargeUsd: route.startsWith('WINNR_PREWARMED')
        ? (route === 'WINNR_PREWARMED_MINIMUM_CANARY' ? minimumPilot.firstMonthUsd : prewarmedMonthlyForTarget)
        : startup.monthlyUsd,
      publicHelpMinimumCommittedUsd: prewarmedRoute
        ? money(prewarmedMonthlyForTarget * pre.publicHelpMinimumCommittedMonths)
        : null,
      maxPilotSpendUsd: Number(maxPilotSpendUsd),
      maxPilotCommittedSpendUsd: Number(maxPilotCommittedSpendUsd),
      automaticPurchaseAuthority: false
    }),
    externalEffectAuthority: 'NONE',
    spendAuthorized: false,
    truthBoundary: 'First-party Winnr evidence currently conflicts on the pre-warmed minimum term: official MCP source says no minimum term while current Help pages say 90 days. This compiler preserves that contradiction and refuses a pre-warmed purchase until the binding term and exact minimum committed spend are reconciled. Provider pacing is not send authority; UberWarm² remains the live cap authority after purchase.'
  });
}
