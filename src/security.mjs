import dns from 'node:dns/promises';
import net from 'node:net';

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

// Matches any explicit "<scheme>://" prefix, not just http(s). A bare
// startsWith('http') test is unsafe: for 'ftp://x' it is false, so 'https://' is
// prepended, yielding 'https://ftp://x' which parses with hostname 'ftp' instead
// of being cleanly rejected at the scheme check below. It also matches 'httpx://'.
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;

export async function assertPublicUrl(input, {allowLocal=false} = {}) {
  const raw = String(input);
  let url;
  try { url = new URL(HAS_SCHEME.test(raw) ? raw : `https://${raw}`); }
  catch { throw new Error('Invalid website URL'); }
  if (!['http:','https:'].includes(url.protocol)) throw new Error('Only HTTP and HTTPS URLs are allowed');
  if (url.username || url.password) throw new Error('URLs with embedded credentials are not allowed');
  const host = url.hostname.toLowerCase();
  if (!host) throw new Error('Website hostname is missing');
  if (allowLocal && ['localhost','127.0.0.1','::1'].includes(host)) return url;
  if (host === 'localhost' || host.endsWith('.local')) throw new Error('Local addresses are blocked');
  if (net.isIP(host) && isPrivateIp(host)) throw new Error('Private and reserved IP addresses are blocked');
  const records = await dns.lookup(host,{all:true,verbatim:true});
  if (!records.length) throw new Error('Hostname did not resolve');
  if (records.some(r => isPrivateIp(r.address))) throw new Error('Hostname resolves to a private or reserved IP');
  return url;
}

export async function safeRedirectTarget(input, options={}) {
  return assertPublicUrl(input, options);
}
