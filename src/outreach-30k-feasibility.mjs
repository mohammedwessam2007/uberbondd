// No-effects capacity and cost audit for the UberBond outbound portfolio.
// Forecasts are scenarios, never provider, legal, delivery or send authority.
export const OUTREACH_30K_AUDIT_VERSION = 'uberbond.outreach-30k-feasibility.v1';

const DEFAULTS = Object.freeze({
  targetMessages: 30000, sendingDays: 22, plannedMailboxes: 50,
  providerColdPerMailboxDay: 15, internalDailyCap: 10,
  providerTotalPerMailboxDay: 50, warmingEmailsPerMailboxDay: 0,
  includedMailboxes: 50, startupUsd: 69, extraMailboxUsd: 1,
  pilotUsdIfRetained: 9, warmingUsdPerMailbox: 0.6, warmingEnabled: false,
  mailboxesPerDomainMax: 3, totalOwnedDomains: null, protectedOwnedDomains: 2,
  observedHealthyMailboxes: null, observedEligibleMessages: null,
  schedulerIntervalMinutes: 5, businessHoursPerDay: 8,
  batchSize: 10, legacyHourlyCapPerLane: 5, legacyLanes: 2
});
function integer(value, label, { min = 0, max = 1e8, optional = false } = {}) {
  if (value === null && optional) return null;
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new RangeError(`${label}-out-of-range`);
  return value;
}
const ceilDiv = (x,y) => y > 0 ? Math.ceil(x / y) : null;
const dollars = x => Math.round(x * 100) / 100;
export function compileOutreach30kFeasibility(input = {}) {
  const o = { ...DEFAULTS, ...input };
  const int = (k,min=0,max=1e8) => integer(o[k],k,{min,max});
  for (const k of ['targetMessages','sendingDays','plannedMailboxes','providerColdPerMailboxDay','internalDailyCap','providerTotalPerMailboxDay','warmingEmailsPerMailboxDay','includedMailboxes','mailboxesPerDomainMax','protectedOwnedDomains','schedulerIntervalMinutes','businessHoursPerDay','batchSize','legacyHourlyCapPerLane','legacyLanes']) {
    int(k,k==='sendingDays'||k==='schedulerIntervalMinutes'||k==='mailboxesPerDomainMax'?1:0);
  }
  if (o.sendingDays>31 || o.businessHoursPerDay>24 || o.providerColdPerMailboxDay>o.providerTotalPerMailboxDay || o.warmingEmailsPerMailboxDay>o.providerTotalPerMailboxDay) throw new RangeError('calendar-or-provider-cap-invalid');
  for (const k of ['totalOwnedDomains','observedHealthyMailboxes','observedEligibleMessages']) integer(o[k],k,{optional:true});
  for (const k of ['startupUsd','extraMailboxUsd','pilotUsdIfRetained','warmingUsdPerMailbox']) if (!Number.isFinite(o[k]) || o[k]<0 || o[k]>1e6) throw new RangeError(`${k}-invalid`);
  if (typeof o.warmingEnabled!=='boolean') throw new TypeError('warmingEnabled-must-be-boolean');
  if (o.totalOwnedDomains !== null && o.protectedOwnedDomains > o.totalOwnedDomains) throw new RangeError('protected-domains-exceed-owned');
  if (o.observedHealthyMailboxes !== null && o.observedHealthyMailboxes > o.plannedMailboxes) throw new RangeError('observed-healthy-exceeds-planned');
  const providerActualMax = Math.min(o.providerColdPerMailboxDay, Math.max(0,o.providerTotalPerMailboxDay-o.warmingEmailsPerMailboxDay));
  const internalMaximum = Math.min(providerActualMax, o.internalDailyCap);
  const requiredProvider = ceilDiv(o.targetMessages,o.sendingDays*providerActualMax);
  const requiredCurrentPolicy = ceilDiv(o.targetMessages,o.sendingDays*internalMaximum);
  const senderDomainSlots = ceilDiv(o.plannedMailboxes,o.mailboxesPerDomainMax);
  const ownedSendingDomains = o.totalOwnedDomains === null ? null : o.totalOwnedDomains-o.protectedOwnedDomains;
  const plannedProviderMax = o.plannedMailboxes*providerActualMax*o.sendingDays;
  const plannedPolicyMax = o.plannedMailboxes*internalMaximum*o.sendingDays;
  const observedPolicyMax = o.observedHealthyMailboxes === null ? null : o.observedHealthyMailboxes*internalMaximum*o.sendingDays;
  const schedulerTicksPerDay = Math.floor(o.businessHoursPerDay*60/o.schedulerIntervalMinutes);
  const maxByLegacyBatch = schedulerTicksPerDay*o.batchSize*o.sendingDays;
  // This A/B bound applies ONLY if sends use legacy Pipeline.maybeSend inbox= A/B.
  // The separate governed 100K dispatch path must be measured independently.
  const maxByLegacyHourly = o.legacyLanes*o.legacyHourlyCapPerLane*o.businessHoursPerDay*o.sendingDays;
  const requiredBatchSize = ceilDiv(o.targetMessages,o.sendingDays*schedulerTicksPerDay);
  const requiredPerDay = ceilDiv(o.targetMessages,o.sendingDays);
  const requiredPerHour = ceilDiv(o.targetMessages,o.sendingDays*o.businessHoursPerDay);
  const costFor = count => {
    if (count === null) return null;
    const startup = o.startupUsd+Math.max(0,count-o.includedMailboxes)*o.extraMailboxUsd;
    const warming = o.warmingEnabled?count*o.warmingUsdPerMailbox:0;
    return { mailboxes: count, domainSlots: ceilDiv(count,o.mailboxesPerDomainMax), startupWithExtrasUsd: dollars(startup), optionalWarmingUsd: dollars(warming), retainedPilotUsd: dollars(o.pilotUsdIfRetained), recurringTotalUsd: dollars(startup+warming+o.pilotUsdIfRetained), excludes:'domains, taxes, processing fees, FX, additional tools and compute' };
  };
  const blockers = [];
  if (internalMaximum===0) blockers.push('no-internal-evidence-capacity');
  if (o.observedHealthyMailboxes===null) blockers.push('actual-healthy-mailbox-count-unknown');
  else if (observedPolicyMax<o.targetMessages) blockers.push('actual-healthy-mailbox-capacity-below-target');
  if (o.observedEligibleMessages===null) blockers.push('eligible-source-message-inventory-unknown');
  else if (o.observedEligibleMessages<o.targetMessages) blockers.push('eligible-source-message-inventory-below-target');
  if (ownedSendingDomains===null) blockers.push('owned-domain-inventory-unverified');
  else if (ownedSendingDomains<senderDomainSlots) blockers.push('insufficient-verified-domain-topology-for-planned-mailboxes');
  if (plannedPolicyMax<o.targetMessages) blockers.push('planned-fleet-current-internal-ramp-too-small');
  if (maxByLegacyBatch<o.targetMessages) blockers.push('legacy-five-minute-batch-ceiling-below-target');
  if (maxByLegacyHourly<o.targetMessages) blockers.push('legacy-two-lane-hourly-ceiling-below-target');
  blockers.push('no-standing-legal-owner-provider-send-authority-inferred');
  const scenarios=[10,15,20].map(coldPerMailboxDay=>({
    coldPerMailboxDay,
    mailboxesRequired:ceilDiv(o.targetMessages,o.sendingDays*Math.min(coldPerMailboxDay,o.providerTotalPerMailboxDay-o.warmingEmailsPerMailboxDay)),
    capacity50:50*Math.min(coldPerMailboxDay,o.providerTotalPerMailboxDay-o.warmingEmailsPerMailboxDay)*o.sendingDays
  }));
  return {
    version: OUTREACH_30K_AUDIT_VERSION, status:'PLANNING_ONLY_NOT_SEND_READY',
    assumptions:{ targetMessages:o.targetMessages,sendingDays:o.sendingDays,plannedMailboxes:o.plannedMailboxes,internalDailyCap:o.internalDailyCap,providerColdPerMailboxDay:o.providerColdPerMailboxDay,providerActualMax,warmingEmailsPerMailboxDay:o.warmingEmailsPerMailboxDay,mailboxesPerDomainMax:o.mailboxesPerDomainMax },
    fleet:{ providerAdvertisedMonthlyMax:plannedProviderMax, currentPolicyMonthlyMax:plannedPolicyMax, observedPolicyMonthlyMax:observedPolicyMax, requiredMailboxesAtProviderGuidance:requiredProvider, requiredMailboxesAtInternalCap:requiredCurrentPolicy, requiredDomainSlotsForPlannedFleet:senderDomainSlots, ownerReportedSendingDomains:ownedSendingDomains, observedHealthyMailboxes:o.observedHealthyMailboxes },
    scheduling:{ plannedEveryMinutes:o.schedulerIntervalMinutes,businessHoursPerDay:o.businessHoursPerDay,schedulerTicksPerDay,legacyBatchMaxMessagesPerMonth:maxByLegacyBatch,legacyTwoLaneHourlyMaxMessagesPerMonth:maxByLegacyHourly,requiredMessagesPerSendingDay:requiredPerDay,requiredMessagesPerBusinessHour:requiredPerHour,requiredBatchSizeIgnoringHourlyCaps:requiredBatchSize,legacyRouteOnly:true },
    money:{ plannedFleet:costFor(o.plannedMailboxes), providerGuidanceFleet:costFor(requiredProvider), existingPolicyFleet:costFor(requiredCurrentPolicy) },
    scenarioMatrix:scenarios,
    observedEligibleMessages:o.observedEligibleMessages,
    blockers,
    transportProviderApiLimitNotEquivalentToSmtpMailVolume:true,
    fullLaunchReady:false,
    truthBoundary:'Capacity, provider quota, mailboxes and costs are scenarios. Never authorize outreach, purchase domains or mailboxes, raise safety caps, release quarantines, override legal checks or claim cleared revenue from this forecast.'
  };
}
