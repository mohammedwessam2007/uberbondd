// Owner notifications via Resend's plain HTTPS API — no SDK dependency.
// With no RESEND_API_KEY or OWNER_EMAIL configured this is a graceful no-op:
// leads are always persisted in PostgreSQL; Actions logs contain only a
// non-PII lead reference when email delivery is unavailable.
export function formatPendingLeadLog(lead = {}) {
  const clean = value => String(value || '').replace(/[\r\n\t]+/g, ' ').trim();
  const domain = clean(lead.domain).slice(0, 255) || 'unknown domain';
  const id = clean(lead.id).slice(0, 80) || 'unknown id';
  const created = Number.isNaN(new Date(lead.created_at).getTime())
    ? 'unknown time'
    : new Date(lead.created_at).toISOString();
  return `[lite] LEAD pending → ${domain} (lead ${id}, ${created}); contact details remain in PostgreSQL`;
}

export async function sendOwnerEmail({ subject, text }, { fetchImpl = fetch, env = process.env } = {}) {
  const key = env.RESEND_API_KEY;
  const to = env.OWNER_EMAIL;
  if (!key || !to) {
    return { skipped: true, reason: !key ? 'missing RESEND_API_KEY' : 'missing OWNER_EMAIL' };
  }
  const from = env.LITE_EMAIL_FROM || 'UberBond Lite <onboarding@resend.dev>';
  try {
    const res = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject: String(subject).slice(0, 200), text: String(text).slice(0, 10_000) })
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      return { skipped: false, ok: false, status: res.status, error: detail.slice(0, 300) };
    }
    return { skipped: false, ok: true };
  } catch (error) {
    return { skipped: false, ok: false, error: String(error?.message || error).slice(0, 300) };
  }
}
