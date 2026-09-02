export const FIRST_CASH_CANARY_GUARD_VERSION = 'uberbond.first-cash-canary-guard-1.0.0';
export const FIRST_CASH_MAX_QUALIFIED_CONVERSATIONS = 5;

export function evaluateFirstCashCanary({ qualifiedConversations = 0, paidPilots = 0 } = {}) {
  const q = Number(qualifiedConversations);
  const p = Number(paidPilots);
  if (!Number.isInteger(q) || q < 0) return { ok:false, status:'INVALID', reasonCodes:['qualified-conversation-count-invalid'] };
  if (!Number.isInteger(p) || p < 0) return { ok:false, status:'INVALID', reasonCodes:['paid-pilot-count-invalid'] };
  if (p > q) return { ok:false, status:'INVALID', reasonCodes:['paid-pilots-exceed-qualified-conversations'] };
  if (p > 0) {
    return { ok:true, status:'PAID_PILOT_PROVEN', mayOpenAnotherQualifiedConversation:true, qualifiedConversations:q, paidPilots:p, remainingBeforeReview:null };
  }
  if (q > FIRST_CASH_MAX_QUALIFIED_CONVERSATIONS) {
    return { ok:false, status:'CANARY_VIOLATION', reasonCodes:['qualified-conversation-cap-exceeded-without-paid-pilot'], qualifiedConversations:q, paidPilots:p, mayOpenAnotherQualifiedConversation:false, requiredAction:'KILL_OR_RETHINK' };
  }
  if (q === FIRST_CASH_MAX_QUALIFIED_CONVERSATIONS) {
    return { ok:true, status:'KILL_OR_RETHINK', qualifiedConversations:q, paidPilots:p, mayOpenAnotherQualifiedConversation:false, remainingBeforeReview:0, requiredAction:'KILL_OR_RETHINK' };
  }
  return { ok:true, status:'CANARY_OPEN', qualifiedConversations:q, paidPilots:p, mayOpenAnotherQualifiedConversation:true, remainingBeforeReview:FIRST_CASH_MAX_QUALIFIED_CONVERSATIONS - q };
}
