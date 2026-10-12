/**
 * UberWarm³ cash-first fleet governor.
 * Decision support only. No checkout, auto cancellation, rollout, send or
 * artificial warm-up traffic. Data inputs must come from independent ledgers.
 */
export const UBERWARM3_CASH_FIRST_VERSION='uberbond.uberwarm3-cash-first.v1';
const count=v=>Number.isSafeInteger(v)&&v>=0?v:null;
const money=v=>Number.isSafeInteger(v)&&v>=0?v:null;
export function compileUberWarm3ZeroAddonDecision({
  monthlyDiscretionaryBudgetCents=null,
  budgetBasis='TOTAL_MONTHLY',
  pilotPaidCents=900,
  startupPriceCents=6900,
  warmAddonPriceCents=3000,
  startupPurchased=false,
  paidWarmAddonActive=false,
  currentVerifiedEligibleUniqueContacts=null,
  pilotVerifiedHealthySenders=null,
  pilotVerifiedDailyFirstTouchCap=null,
  campaignLegality='UNCERTAIN',
  ownerCampaignAuthority=false,
  productionDispatcherReady=false,
  independentTelemetryReady=false,
  qualifiedContactsEvidenceRef='',
  pilotCapacityEvidenceRef='',
  verifyIndependentDemandReceipt,
  verifyPilotProviderCapacityReceipt
}={}) {
  const reasons=[];
  const qualified=count(currentVerifiedEligibleUniqueContacts);
  const pilotSenders=count(pilotVerifiedHealthySenders);
  const pilotCap=count(pilotVerifiedDailyFirstTouchCap);
  const budget=money(monthlyDiscretionaryBudgetCents);
  const monthlyBaseCents=(startupPurchased?startupPriceCents:0)+pilotPaidCents+
    (paidWarmAddonActive?warmAddonPriceCents:0);
  // Untrusted free-text evidence references never become spend justification.
  // Validation callbacks must be injected from authenticated, server-controlled
  // ledgers. Missing/throwing verifiers fail closed.
  let demandReceiptVerified=false,capacityReceiptVerified=false;
  try { demandReceiptVerified=typeof verifyIndependentDemandReceipt==='function'&&
    verifyIndependentDemandReceipt({count:qualified,evidenceRef:qualifiedContactsEvidenceRef})===true; } catch {}
  try { capacityReceiptVerified=typeof verifyPilotProviderCapacityReceipt==='function'&&
    verifyPilotProviderCapacityReceipt({senders:pilotSenders,dailyCap:pilotCap,evidenceRef:pilotCapacityEvidenceRef})===true; } catch {}
  const verifiedLeads=qualified!==null && qualified>0 &&
    typeof qualifiedContactsEvidenceRef==='string'&&qualifiedContactsEvidenceRef.trim()&&demandReceiptVerified;
  const verifiedCapacity=pilotSenders!==null&&pilotCap!==null&&pilotSenders>0&&
    typeof pilotCapacityEvidenceRef==='string'&&pilotCapacityEvidenceRef.trim()&&capacityReceiptVerified;
  const lawful=campaignLegality==='READY';
  if(!lawful)reasons.push('verified-legal-route-not-ready');
  if(ownerCampaignAuthority!==true)reasons.push('current-owner-campaign-authority-not-established');
  if(productionDispatcherReady!==true)reasons.push('production-dispatch-authority-not-ready');
  if(!verifiedLeads)reasons.push('verified-eligible-unique-contacts-not-ready');
  if(!verifiedCapacity)reasons.push('fresh-paid-pilot-sender-capacity-not-observed');
  const sendReady=reasons.length===0;
  const pilotHorizonDays=14;
  const pilotOpportunityCapacity=verifiedCapacity?pilotCap*pilotHorizonDays:null;
  const pilotCanCoverQueue=verifiedLeads&&verifiedCapacity&&qualified<=pilotOpportunityCapacity;
  const forecastableNewDemand=verifiedLeads&&verifiedCapacity&&qualified>pilotOpportunityCapacity;
  // Default treats founder's declared budget as the TOTAL recurring budget,
  // including the existing $9 pilot. Avoid the $69 vs $78 trap.
  // Incremental budget is allowed only if explicitly so labeled.
  const costOfStartupWithCurrentPlans=monthlyBaseCents+startupPriceCents;
  const affordabilityTarget=budgetBasis==='INCREMENTAL_AVAILABLE'?startupPriceCents:
    budgetBasis==='TOTAL_MONTHLY'?costOfStartupWithCurrentPlans:null;
  const affordable=budget!==null&&affordabilityTarget!==null&&budget>=affordabilityTarget;
  const reasonsToDefer=[];
  if(startupPurchased!==true) {
    if(!verifiedLeads)reasonsToDefer.push('no-evidenced-eligible-volume-demand');
    if(!verifiedCapacity)reasonsToDefer.push('pilot-not-freshly-measured');
    if(pilotCanCoverQueue)reasonsToDefer.push('existing-pilot-covers-evidenced-two-week-queue');
    if(!affordable)reasonsToDefer.push('cash-budget-for-expansion-not-evidenced');
    if(!lawful)reasonsToDefer.push('market-route-legality-not-cleared');
    if(ownerCampaignAuthority!==true)reasonsToDefer.push('owner-campaign-authorization-not-current');
    if(productionDispatcherReady!==true)reasonsToDefer.push('production-dispatch-not-enabled');
  }
  const proposeStartup= !startupPurchased&&reasonsToDefer.length===0&&forecastableNewDemand;
  const recommendNewPaidWarming=false;
  const recommendedActions=[
    !verifiedLeads?'PRIORITIZE_INDEPENDENTLY_VERIFIED_ELIGIBLE_CONTACTS':
      !sendReady?'CLOSE_GOVERNED_CAMPAIGN_READINESS':'USE_EXISTING_VERIFIED_PILOT_CAPACITY',
    startupPurchased?(paidWarmAddonActive?'REVIEW_ACTIVE_ADDON_WITH_OWNER':'RUN_FREE_EVIDENCE_RAMP_WITHOUT_PAID_ADDON'):
      proposeStartup?'PRESENT_FRESH_MONTHLY_STARTUP_CHECKOUT_FOR_OWNER_CONFIRMATION':
      'DEFER_STARTUP_CHECKOUT_AND_PROTECT_CASH',
    'TRACK_REAL_PROVIDER_DELIVERY_COMPLAINTS_AND_CLEARED_REVENUE'
  ];
  return Object.freeze({
    version:UBERWARM3_CASH_FIRST_VERSION,
    state:sendReady?'PILOT_SEND_CANDIDATE_SUBJECT_TO_EXACT_DISPATCH':'BUILD_REAL_READINESS_FIRST',
    startupPurchaseRecommendation:startupPurchased?'ALREADY_PURCHASED_NEVER_DOUBLE_CHARGE':
      proposeStartup?'CONSIDER_ONLY_WITH_NEW_EXPLICIT_OWNER_CHECKOUT':'DEFER',
    paidWarmAddonRecommendation:paidWarmAddonActive?'REVIEW_EXISTING_COST_AND_ASK_OWNER_BEFORE_CANCELLING':
      'NO_NEW_PAID_ADDON',
    recommendNewPaidWarming,
    recommendedActions,
    blockerCodes:reasons,
    expansionDeferralReasons:reasonsToDefer,
    knownVerifiedUniqueRecipients:verifiedLeads?qualified:null,
    pilotTwoWeekMaxSlotCapacity:pilotOpportunityCapacity,
    newMailboxesPurchasedByThisDecision:0,
    messagesSentByThisDecision:0,
    paidWarmupAddedCents:0,
    monthlyCommittedCents:monthlyBaseCents,
    monthlyUncommittedOptionCents:!startupPurchased?startupPriceCents:0,
    availableBudgetObserved:budget,
    budgetBasis,
    expansionBudgetRequirementCents:!startupPurchased?affordabilityTarget:null,
    independentTelemetryReady:independentTelemetryReady===true,
    economicTruth:'Neither MailOptimal nor Winnr nor an internal warm-up network can create externally eligible prospects, demand, revenue, or real recipient trust. Never infer an effective inbox placement rate from quota counts.',
    truthBoundary:'Read-only decision, not spend or outreach authority. Warm-up is an optional experiment; exact provider status, billing and qualified-lead ledger must be refreshed before checkout.'
  });
}
