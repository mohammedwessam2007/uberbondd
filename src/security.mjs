import dns from 'node:dns/promises';
import net from 'node:net';
import crypto from 'node:crypto';

export const PRIVATE_REFERRER_POLICY = 'no-referrer';

const PRIVATE_V4 = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16],
  ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4]
];

function v4ToInt(ip) {
  return ip.split('.').reduce((n, x) => ((n << 8) + Number(x)) >>> 0, 0);
}
function inCidr(ip, base, bits) {
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (v4ToInt(ip) & mask) === (v4ToInt(base) & mask);
}
export function isPrivateIp(ip) {
  if (net.isIPv4(ip)) return PRIVATE_V4.some(([base,bits]) => inCidr(ip,base,bits));
  if (net.isIPv6(ip)) {
    const x = ip.toLowerCase();
    // Block IPv4-embedded IPv6 forms (for example ::ffff:127.0.0.1) rather
    // than risk bypassing the IPv4 CIDR checks through alternate notation.
    return x.includes('.') || x.startsWith('::ffff:') || x === '::1' || x === '::' || x.startsWith('fc') || x.startsWith('fd') || x.startsWith('fe8') || x.startsWith('fe9') || x.startsWith('fea') || x.startsWith('feb') || x.startsWith('2001:db8');
  }
  return true;
}

export function assertPublicIpAddress(ip, { allowLocal = false } = {}) {
  const value = String(ip || '').trim();
  if (!net.isIP(value)) throw new Error('Connected server address is unavailable');
  if (!allowLocal && isPrivateIp(value)) throw new Error('Connected server used a private or reserved IP');
  return value;
}

// Matches any explicit "<scheme>://" prefix, not just http(s). A bare
// startsWith('http') test is unsafe: for 'ftp://x' it is false, so 'https://' is
// prepended, yielding 'https://ftp://x' which parses with hostname 'ftp' instead
// of being cleanly rejected at the scheme check below. It also matches 'httpx://'.
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;

const INTERNAL_HOSTS = new Set([
  'localhost', 'metadata', 'instance-data', 'metadata.google.internal',
  'metadata.aws.internal', 'metadata.azure.internal'
]);
const INTERNAL_SUFFIXES = ['.local', '.localhost', '.internal', '.home', '.lan', '.corp'];

export function parsePublicUrl(input, {allowLocal=false} = {}) {
  const raw = String(input || '').trim();
  let url;
  try { url = new URL(HAS_SCHEME.test(raw) ? raw : `https://${raw}`); }
  catch { throw new Error('Invalid website URL'); }
  if (!['http:','https:'].includes(url.protocol)) throw new Error('Only HTTP and HTTPS URLs are allowed');
  if (url.username || url.password) throw new Error('URLs with embedded credentials are not allowed');
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (!host) throw new Error('Website hostname is missing');
  if (allowLocal && ['localhost','127.0.0.1','::1'].includes(host)) return url;
  if (INTERNAL_HOSTS.has(host) || INTERNAL_SUFFIXES.some(suffix => host.endsWith(suffix))) {
    throw new Error('Local addresses and metadata endpoints are blocked');
  }
  if (!host.includes('.') && !net.isIP(host)) throw new Error('Website hostname must be a public domain');
  if (net.isIP(host) && isPrivateIp(host)) throw new Error('Private and reserved IP addresses are blocked');
  return url;
}

export async function resolvePublicUrl(input, {allowLocal=false} = {}) {
  const url = parsePublicUrl(input, {allowLocal});
  const host = url.hostname.toLowerCase();
  if (allowLocal && ['localhost','127.0.0.1','::1'].includes(host)) {
    return { url, addresses: [{ address: host === 'localhost' ? '127.0.0.1' : host, family: net.isIPv6(host) ? 6 : 4 }] };
  }
  const records = await dns.lookup(host,{all:true,verbatim:true});
  if (!records.length) throw new Error('Hostname did not resolve');
  if (records.some(r => isPrivateIp(r.address))) throw new Error('Hostname resolves to a private or reserved IP');
  return { url, addresses: records.map(record => ({ address: record.address, family: record.family })) };
}

export async function assertPublicUrl(input, options = {}) {
  return (await resolvePublicUrl(input, options)).url;
}

export async function safeRedirectTarget(input, options={}) {
  return assertPublicUrl(input, options);
}

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export function adminRequestAuthorized(req, expectedToken = '') {
  if (!expectedToken) return true;
  const raw = req?.headers?.authorization;
  const header = Array.isArray(raw) ? raw[0] : String(raw || '');
  const match = /^Bearer ([^\s]+)$/.exec(header);
  return Boolean(match && safeEqual(match[1], expectedToken));
}

export function redactSensitiveText(value = '') {
  let text = String(value ?? '');
  text = text.replace(/\b(?:postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|redis|rediss):\/\/[^\s"'<>]+/gi, '[redacted-database-url]');
  text = text.replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]');
  text = text.replace(/([?&](?:access_?token|refresh_?token|token|code|state|client_secret|api_?key|password)=)[^&#\s]*/gi, '$1[redacted]');
  text = text.replace(/\b(token|secret|password|authorization|client[_ -]?secret|api[_ -]?key|oauth[_ -]?code)\s*[:=]\s*["']?[^\s,;"'}&]+/gi, '$1=[redacted]');
  text = text.replace(/(\/api\/public\/report\/)[A-Za-z0-9_-]+/gi, '$1[redacted]');
  text = text.replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[redacted-jwt]');
  text = text.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-email]');
  return text;
}

export function safeErrorDetails(error) {
  return {
    name: String(error?.name || 'Error').replace(/[^a-z0-9_.:-]/gi, '').slice(0, 80) || 'Error',
    code: String(error?.code || '').replace(/[^a-z0-9_.:-]/gi, '').slice(0, 80),
    message: redactSensitiveText(error?.message || error || 'Unknown operational failure').slice(0, 1000)
  };
}

export function sanitizeLogDetail(value, depth = 0) {
  if (depth > 6) return '[truncated]';
  if (typeof value === 'string') return redactSensitiveText(value).slice(0, 2000);
  if (typeof value === 'number' || typeof value === 'boolean' || value == null) return value;
  if (Array.isArray(value)) return value.slice(0, 100).map(item => sanitizeLogDetail(item, depth + 1));
  if (typeof value !== 'object') return redactSensitiveText(String(value)).slice(0, 2000);
  const output = {};
  for (const [key, item] of Object.entries(value).slice(0, 100)) {
    const normalizedKey = key.replace(/[^a-z0-9]/gi, '').toLowerCase();
    if (['token', 'secret', 'password', 'authorization', 'databaseurl', 'oauthcode', 'apikey'].some(part => normalizedKey.includes(part))) output[key] = '[redacted]';
    else output[key] = sanitizeLogDetail(item, depth + 1);
  }
  return output;
}

export function chromiumHostResolverRules(entries = []) {
  const rules = [];
  const seen = new Set();
  for (const entry of entries) {
    const hostname = String(entry?.hostname || '').toLowerCase().replace(/\.$/, '');
    const address = String(entry?.address || '');
    if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?))+$/i.test(hostname)) continue;
    if (!net.isIP(address) || isPrivateIp(address) || seen.has(hostname)) continue;
    seen.add(hostname);
    rules.push(`MAP ${hostname} ${net.isIPv6(address) ? `[${address}]` : address}`);
  }
  return rules.length ? `${rules.join(', ')}, EXCLUDE localhost` : '';
}
