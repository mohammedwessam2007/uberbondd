const num = (value, fallback) => (Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : fallback);

export function getLimits(env = process.env) {
  return {
    perIpPerHour: num(env.LITE_MAX_PER_IP_HOUR, 3),
    perEmailPerDay: num(env.LITE_MAX_PER_EMAIL_DAY, 3),
    maxActive: num(env.LITE_MAX_ACTIVE_QUEUE, 25),
    leadsPerIpPerHour: num(env.LITE_MAX_LEADS_PER_IP_HOUR, 5)
  };
}

// Pure decision — counts in, verdict out. Fully unit-testable.
export function decideAuditRateLimit({ perIpCount, perEmailCount, activeCount }, limits) {
  if (activeCount >= limits.maxActive) {
    return { allowed: false, reason: 'queue_full', message: 'The free audit queue is full right now. Please try again in about an hour.' };
  }
  if (perIpCount >= limits.perIpPerHour) {
    return { allowed: false, reason: 'ip_limit', message: 'You have reached the hourly limit for free audits. Please try again later.' };
  }
  if (perEmailCount >= limits.perEmailPerDay) {
    return { allowed: false, reason: 'email_limit', message: 'This email has reached today\u2019s free audit limit. Please try again tomorrow.' };
  }
  return { allowed: true };
}

export function decideLeadRateLimit({ perIpCount }, limits) {
  if (perIpCount >= limits.leadsPerIpPerHour) {
    return { allowed: false, reason: 'ip_limit', message: 'Too many requests from this connection. Please try again shortly.' };
  }
  return { allowed: true };
}
