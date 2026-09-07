export const FOUNDER_MINUTE_PRIORITY_VERSION = 'founder-minute-priority-1.0.0';

function paymentAttentionCount(paymentAttention = {}) {
  const value = Number(paymentAttention.attentionRequired);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function nonNegative(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

export function deriveFounderMinuteActions({ outbound = null, paymentAttention = {}, revenue = null } = {}) {
  const actions = [];
  const attentionRequired = paymentAttentionCount(paymentAttention);

  if (attentionRequired > 0) {
    actions.push({
      action: `Review ${attentionRequired} payment event(s) requiring operator attention`,
      reason: 'REVIEW_REQUIRED events and unexpected pending/unclear payment states need a human decision. Expected free-trial creation remains quiet.',
      expectedValue: 'Prevents a real payment or anomalous provider state from being silently lost or misattributed',
      timeRequired: '5-10 minutes',
      cost: 'None',
      evidence: `${nonNegative(paymentAttention.reviewRequired)} REVIEW_REQUIRED, ${nonNegative(paymentAttention.anomalousPending)} anomalous pending, ${nonNegative(paymentAttention.expectedPending)} expected pending`,
      risk: 'A real customer payment or failed charge could go unfulfilled if ignored',
      completionTest: 'paymentTruth.operatorAttentionRecently returns to zero'
    });
  }

  const recoverable = nonNegative(outbound?.staleRecoveryPreview?.wouldRecover);
  const quarantinable = nonNegative(outbound?.staleRecoveryPreview?.wouldQuarantine);
  if (recoverable > 0 || quarantinable > 0) {
    actions.push({
      action: 'Run the outbound reservation recovery sweep',
      reason: 'Stuck reservations are consuming capacity and delaying visibility into real send state.',
      expectedValue: 'Restores accurate capacity accounting',
      timeRequired: '<1 minute (automated)',
      cost: 'None',
      evidence: `${recoverable} recoverable, ${quarantinable} to quarantine`,
      risk: 'None: the sweep never sends anything',
      completionTest: 'staleRecoveryPreview counts return to zero'
    });
  }

  if (!actions.length) {
    actions.push({
      action: 'No binding action required',
      reason: `The canonical first-cash path does not require legacy static checkout URLs. Payment anomalies and stuck reservations are clear as of this report. Cleared revenue so far: $${revenue?.clearedRevenue ?? 'UNKNOWN'}.`,
      expectedValue: 'Avoids founder time spent configuring noncanonical payment paths',
      timeRequired: 'N/A',
      cost: 'N/A',
      evidence: 'See canonicalFirstCashPath, paymentTruth, outbound and nonBlockingLegacyCheckoutGaps',
      risk: 'External live-rail/contact/legal gates remain outside this report and are not inferred.',
      completionTest: 'N/A'
    });
  }

  return actions.slice(0, 3);
}
