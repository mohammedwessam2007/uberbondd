// Address parsing and offline classification. Pure: no network, no clock.
import fs from 'node:fs';
import { domainToASCII } from 'node:url';

const ATEXT = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/;
const LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;

export const ROLE_LOCALS = new Set(['abuse', 'accounts', 'accounting', 'admin', 'administrator', 'billing', 'careers', 'contact', 'customerservice', 'enquiries', 'enquiry', 'finance', 'hello', 'help', 'hi', 'hr', 'info', 'inquiries', 'inquiry', 'jobs', 'legal', 'mail', 'marketing', 'media', 'newsletter', 'no-reply', 'noreply', 'office', 'orders', 'postmaster', 'press', 'privacy', 'recruiting', 'sales', 'security', 'service', 'support', 'team', 'webmaster']);
export const FREE_PROVIDERS = new Set(['gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.uk', 'yahoo.fr', 'yahoo.de', 'ymail.com', 'rocketmail.com', 'outlook.com', 'hotmail.com', 'hotmail.co.uk', 'hotmail.fr', 'live.com', 'msn.com', 'icloud.com', 'me.com', 'mac.com', 'aol.com', 'proton.me', 'protonmail.com', 'pm.me', 'gmx.com', 'gmx.de', 'gmx.net', 'web.de', 'mail.com', 'zoho.com', 'yandex.com', 'yandex.ru', 'mail.ru', 'qq.com', '163.com', '126.com', 'fastmail.com', 'hey.com', 'tutanota.com', 'tuta.io']);
// Misspellings of consumer domains. A suggestion only: typo domains often do receive mail.
const TYPOS = new Map(Object.entries({
  'gmial.com': 'gmail.com', 'gmai.com': 'gmail.com', 'gmal.com': 'gmail.com', 'gmail.co': 'gmail.com', 'gmail.con': 'gmail.com', 'gmail.cm': 'gmail.com', 'gnail.com': 'gmail.com', 'gamil.com': 'gmail.com', 'gmaill.com': 'gmail.com',
  'hotmial.com': 'hotmail.com', 'hotmai.com': 'hotmail.com', 'hotmal.com': 'hotmail.com', 'hotmail.co': 'hotmail.com', 'hotmail.con': 'hotmail.com',
  'yaho.com': 'yahoo.com', 'yahooo.com': 'yahoo.com', 'yahoo.co': 'yahoo.com', 'yahoo.con': 'yahoo.com',
  'outlok.com': 'outlook.com', 'outllok.com': 'outlook.com', 'outlook.co': 'outlook.com', 'outlook.con': 'outlook.com',
  'iclould.com': 'icloud.com', 'icloud.co': 'icloud.com', 'icoud.com': 'icloud.com'
}));

let disposable = null;
export function loadDisposableDomains(file = new URL('./disposable-domains.txt', import.meta.url)) {
  if (!disposable) disposable = new Set(fs.readFileSync(file, 'utf8').split('\n').map(s => s.trim().toLowerCase()).filter(s => s && !s.startsWith('#')));
  return disposable;
}
export function isDisposableDomain(domain, list = loadDisposableDomains()) {
  const parts = String(domain).toLowerCase().split('.');
  for (let i = 0; i < parts.length - 1; i += 1) if (list.has(parts.slice(i).join('.'))) return true;
  return false;
}

// Returns { ok, reason, local, domain, normalized }. `normalized` lower-cases the
// domain only: the local part is case-preserved because RFC 5321 leaves its
// case to the receiving host. Dedupe keys lower-case both (see dedupeKey).
export function parseAddress(raw) {
  let s = String(raw ?? '').trim();
  if (!s) return { ok: false, reason: 'EMPTY' };
  s = s.replace(/^mailto:/i, '').replace(/^<(.*)>$/, '$1').trim();
  if (/\s/.test(s)) return { ok: false, reason: 'CONTAINS_WHITESPACE' };
  const at = s.lastIndexOf('@');
  if (at < 1 || at === s.length - 1) return { ok: false, reason: 'MISSING_AT_OR_PART' };
  const local = s.slice(0, at);
  const rawDomain = s.slice(at + 1).replace(/\.$/, '');
  if (local.startsWith('"')) return { ok: false, reason: 'QUOTED_LOCAL_UNSUPPORTED' };
  if (local.length > 64 || !ATEXT.test(local)) return { ok: false, reason: 'INVALID_LOCAL_PART' };
  if (rawDomain.startsWith('[')) return { ok: false, reason: 'IP_LITERAL_UNSUPPORTED' };
  const domain = domainToASCII(rawDomain).toLowerCase();
  const labels = domain.split('.');
  if (!domain || labels.length < 2 || !labels.every(l => LABEL.test(l))) return { ok: false, reason: 'INVALID_DOMAIN' };
  const tld = labels.at(-1);
  if (!/^(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/.test(tld)) return { ok: false, reason: 'INVALID_TLD' };
  if (local.length + 1 + domain.length > 254) return { ok: false, reason: 'TOO_LONG' };
  return { ok: true, reason: null, local, domain, normalized: `${local}@${domain}` };
}
export const dedupeKey = parsed => `${parsed.local.toLowerCase()}@${parsed.domain}`;

export function classifyOffline(parsed) {
  const local = parsed.local.toLowerCase();
  return {
    role: ROLE_LOCALS.has(local) || ROLE_LOCALS.has(local.replace(/[._+-].*$/, '')),
    freeProvider: FREE_PROVIDERS.has(parsed.domain),
    disposable: isDisposableDomain(parsed.domain),
    didYouMean: TYPOS.has(parsed.domain) ? `${parsed.local}@${TYPOS.get(parsed.domain)}` : null
  };
}
