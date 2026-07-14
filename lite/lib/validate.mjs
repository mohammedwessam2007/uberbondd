import { assertPublicUrl } from './security.mjs';

export class LiteInputError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'LiteInputError';
    this.status = status;
  }
}

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function parseEmail(value, field = 'email') {
  const email = String(value ?? '').trim().toLowerCase();
  if (!email) throw new LiteInputError(`Please enter your ${field}.`);
  if (email.length > 254 || !EMAIL_RX.test(email)) throw new LiteInputError(`Please enter a valid ${field}.`);
  return email;
}

export function normalizeDomain(url) {
  return url.hostname.toLowerCase().replace(/^www\./, '');
}

// Validates syntax + protocol + credentials + private/reserved targets (incl. DNS resolution).
export async function parseWebsite(value, { lookup = null } = {}) {
  const raw = String(value ?? '').trim();
  if (!raw) throw new LiteInputError('Please enter your website address.');
  if (raw.length > 300) throw new LiteInputError('That website address is too long.');
  let url;
  try {
    url = await assertPublicUrl(raw, { lookup });
  } catch (error) {
    throw new LiteInputError(error.message || 'That website address could not be validated.');
  }
  url.hash = '';
  return { href: url.href, domain: normalizeDomain(url) };
}

export function parseLeadInput(body = {}) {
  const name = String(body.name ?? '').trim().slice(0, 120);
  const message = String(body.message ?? '').trim().slice(0, 2000);
  let email = null;
  if (String(body.email ?? '').trim()) email = parseEmail(body.email);
  return { name: name || null, message: message || null, email };
}
