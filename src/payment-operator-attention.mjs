export const PAYMENT_OPERATOR_ATTENTION_POLICY_VERSION = 'payment-operator-attention-1.0.0';

const EXPECTED_PENDING_REASON_CODES = new Set([
  'subscription-status-on_trial'
]);

function reasonCodes(entry) {
  return [...new Set((Array.isArray(entry?.detail?.reasonCodes) ? entry.detail.reasonCodes : [])
    .map(value => String(value || '').trim())
    .filter(Boolean))];
}

export function classifyPaymentAttentionEntry(entry = {}) {
  if (entry?.type !== 'payment_classification') {
    return { state: 'IGNORE', attentionRequired: false, reasonCodes: [] };
  }

  const classification = String(entry?.detail?.classification || '').trim().toUpperCase();
  const reasons = reasonCodes(entry);

  if (classification === 'REVIEW_REQUIRED') {
    return { state: 'REVIEW_REQUIRED', attentionRequired: true, reasonCodes: reasons };
  }

  if (classification === 'PENDING_OR_UNCLEAR') {
    // Only a provider state that is explicitly expected to mean "no charge yet"
    // stays quiet. Everything else fails visible: unpaid/past-due/cancelled
    // creation, failed charge attempts, unknown order states, or a pending row
    // with no reason all require operator attention rather than disappearing.
    const expected = reasons.length > 0
      && reasons.every(reason => EXPECTED_PENDING_REASON_CODES.has(reason));
    return {
      state: expected ? 'EXPECTED_PENDING' : 'ANOMALOUS_PENDING',
      attentionRequired: !expected,
      reasonCodes: reasons
    };
  }

  return { state: 'IGNORE', attentionRequired: false, reasonCodes: reasons };
}

export function summarizePaymentOperatorAttention(entries = []) {
  const summary = {
    reviewRequired: 0,
    expectedPending: 0,
    anomalousPending: 0,
    attentionRequired: 0
  };

  for (const entry of Array.isArray(entries) ? entries : []) {
    const decision = classifyPaymentAttentionEntry(entry);
    if (decision.state === 'REVIEW_REQUIRED') summary.reviewRequired += 1;
    else if (decision.state === 'EXPECTED_PENDING') summary.expectedPending += 1;
    else if (decision.state === 'ANOMALOUS_PENDING') summary.anomalousPending += 1;
    if (decision.attentionRequired) summary.attentionRequired += 1;
  }

  return summary;
}
