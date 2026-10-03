// One owner for "which host is this https URL on" and "do these two hosts
// belong to the same site family". Shared by the prospect intake, the contact
// source verifier, the inbox classifier and the legal-form verifier so the rule
// is stated once.

const clean = (value, max = 1000) => String(value ?? '').trim().slice(0, max);

/** Lowercased hostname (no leading www.) of an https URL without credentials, else ''. */
export function httpsHostOf(url) {
  try {
    const u = new URL(clean(url));
    return u.protocol === 'https:' && !u.username && !u.password ? u.hostname.toLowerCase().replace(/^www\./, '') : '';
  } catch { return ''; }
}

/** Equal hosts, or one is a subdomain of the other. Empty never matches. */
export function sameDomainFamily(a, b) {
  const x = clean(a, 255).toLowerCase().replace(/^www\./, '');
  const y = clean(b, 255).toLowerCase().replace(/^www\./, '');
  return Boolean(x && y) && (x === y || x.endsWith(`.${y}`) || y.endsWith(`.${x}`));
}
