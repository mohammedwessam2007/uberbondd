import crypto from 'node:crypto';

export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
export const now = () => new Date().toISOString();
export const id = prefix => `${prefix}_${crypto.randomUUID()}`;
export const clamp = (n, min, max) => Math.max(min, Math.min(max, Number(n) || 0));
export const safeJson = (text, fallback = null) => { try { return JSON.parse(text); } catch { return fallback; } };
export const normalizeDomain = input => {
  const raw = String(input || '').trim().toLowerCase();
  if (!raw) return '';
  try { return new URL(raw.startsWith('http') ? raw : `https://${raw}`).hostname.replace(/^www\./, ''); }
  catch { return raw.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]; }
};
export const absoluteUrl = (href, base) => { try { return new URL(href, base).href; } catch { return ''; } };
export const stripHtml = html => String(html || '')
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"')
  .replace(/&#39;/gi, "'").replace(/\s+/g, ' ').trim();
export const uniq = arr => [...new Set(arr.filter(Boolean))];
export const emailRx = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
export const isEmail = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
export const csvEscape = value => {
  const raw = String(value ?? '');
  // Spreadsheet applications can execute formula-leading CSV cells. Prefix
  // untrusted formula syntax with an apostrophe so exports remain inert.
  const s = /^(?:[\t\r]|\s*[=+@-])/.test(raw) ? `'${raw}` : raw;
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};
export function redact(value = '') {
  const s = String(value);
  if (s.includes('@')) { const [a, b] = s.split('@'); return `${a.slice(0,2)}***@${b}`; }
  return s.length > 8 ? `${s.slice(0,4)}…${s.slice(-3)}` : '***';
}
