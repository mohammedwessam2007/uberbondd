// Mail-routing lookup with two independent witnesses.
//
// A cloud container's resolver can be wrong in a way that looks like an answer
// (the build host for this Actor returned "no data" for gmail.com). A wrong
// negative here would become a paid "undeliverable" verdict, so:
//   1. every resolver must pass a canary before it is trusted at all;
//   2. a negative (no such domain / cannot receive mail) is only reported when
//      two different resolvers agree. Disagreement is reported as DNS_ERROR.
import dnsNative from 'node:dns';

export const MAIL_STATUS = Object.freeze({ MX: 'MX', IMPLICIT_A: 'IMPLICIT_A', NULL_MX: 'NULL_MX', NO_MAIL: 'NO_MAIL', NXDOMAIN: 'NXDOMAIN', DNS_ERROR: 'DNS_ERROR' });
const NEGATIVE = new Set([MAIL_STATUS.NULL_MX, MAIL_STATUS.NO_MAIL, MAIL_STATUS.NXDOMAIN]);
const sortMx = list => list.filter(m => m.exchange).sort((a, b) => a.priority - b.priority || a.exchange.localeCompare(b.exchange));
const withTimeout = (promise, ms, label) => Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error(`${label} timeout`), { code: 'ETIMEOUT' })), ms).unref?.())]);

function fromMx(records, via) {
  const mx = records.map(r => ({ exchange: String(r.exchange ?? '').replace(/\.$/, '').toLowerCase(), priority: Number(r.priority) }));
  if (mx.length && mx.every(m => m.exchange === '')) return { status: MAIL_STATUS.NULL_MX, hosts: [], via }; // RFC 7505
  const hosts = sortMx(mx);
  return hosts.length ? { status: MAIL_STATUS.MX, hosts, via } : null;
}

export function nativeResolver({ dns = dnsNative.promises, timeoutMs = 6000 } = {}) {
  const name = 'native';
  return {
    name,
    async resolveMail(domain) {
      try {
        const found = fromMx(await withTimeout(dns.resolveMx(domain), timeoutMs, 'mx'), name);
        if (found) return found;
      } catch (e) {
        if (e.code === 'ENOTFOUND') return { status: MAIL_STATUS.NXDOMAIN, hosts: [], via: name };
        if (e.code !== 'ENODATA') return { status: MAIL_STATUS.DNS_ERROR, hosts: [], via: name, error: e.code ?? String(e.message) };
      }
      for (const fn of ['resolve4', 'resolve6']) {
        try {
          if ((await withTimeout(dns[fn](domain), timeoutMs, fn)).length) return { status: MAIL_STATUS.IMPLICIT_A, hosts: [{ exchange: domain, priority: 0 }], via: name };
        } catch (e) {
          if (e.code === 'ENOTFOUND') return { status: MAIL_STATUS.NXDOMAIN, hosts: [], via: name };
          if (e.code !== 'ENODATA') return { status: MAIL_STATUS.DNS_ERROR, hosts: [], via: name, error: e.code ?? String(e.message) };
        }
      }
      return { status: MAIL_STATUS.NO_MAIL, hosts: [], via: name };
    }
  };
}

// RFC 8484 JSON form, as served by dns.google and cloudflare-dns.com.
export function dohResolver({ endpoint = 'https://dns.google/resolve', name = 'doh:dns.google', fetchImpl = globalThis.fetch, timeoutMs = 8000 } = {}) {
  async function query(domain, type) {
    const res = await fetchImpl(`${endpoint}?name=${encodeURIComponent(domain)}&type=${type}`, { headers: { accept: 'application/dns-json' }, signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) throw Object.assign(new Error(`doh http ${res.status}`), { code: 'EDOH' });
    return res.json();
  }
  return {
    name,
    async resolveMail(domain) {
      try {
        const mx = await query(domain, 'MX');
        if (mx.Status === 3) return { status: MAIL_STATUS.NXDOMAIN, hosts: [], via: name };
        if (mx.Status !== 0) return { status: MAIL_STATUS.DNS_ERROR, hosts: [], via: name, error: `rcode ${mx.Status}` };
        const records = (mx.Answer ?? []).filter(a => a.type === 15).map(a => { const [p, ...x] = String(a.data).trim().split(/\s+/); return { priority: Number(p), exchange: x.join('') === '.' ? '' : x.join('') }; });
        const found = fromMx(records, name);
        if (found) return found;
        for (const type of ['A', 'AAAA']) {
          const r = await query(domain, type);
          if (r.Status === 3) return { status: MAIL_STATUS.NXDOMAIN, hosts: [], via: name };
          if (r.Status !== 0) return { status: MAIL_STATUS.DNS_ERROR, hosts: [], via: name, error: `rcode ${r.Status}` };
          if ((r.Answer ?? []).some(a => a.type === 1 || a.type === 28)) return { status: MAIL_STATUS.IMPLICIT_A, hosts: [{ exchange: domain, priority: 0 }], via: name };
        }
        return { status: MAIL_STATUS.NO_MAIL, hosts: [], via: name };
      } catch (e) {
        return { status: MAIL_STATUS.DNS_ERROR, hosts: [], via: name, error: e.code ?? e.name ?? String(e.message) };
      }
    }
  };
}

// Keeps only resolvers that correctly answer a domain known to have MX records.
export async function trustedResolvers(candidates, canary = 'gmail.com') {
  const checked = await Promise.all(candidates.map(async r => ({ r, answer: await r.resolveMail(canary) })));
  return checked.filter(c => c.answer.status === MAIL_STATUS.MX).map(c => c.r);
}

// Positive answers need one trusted witness; negatives need two that agree.
export function witnessedMailLookup(resolvers) {
  if (!resolvers.length) throw new Error('NO_TRUSTED_DNS_RESOLVER');
  const cache = new Map();
  return domain => {
    if (!cache.has(domain)) cache.set(domain, (async () => {
      const first = await resolvers[0].resolveMail(domain);
      if (!NEGATIVE.has(first.status) && first.status !== MAIL_STATUS.DNS_ERROR) return { ...first, witnesses: [first.via] };
      if (resolvers.length < 2) return first.status === MAIL_STATUS.DNS_ERROR ? { ...first, witnesses: [first.via] } : { status: MAIL_STATUS.DNS_ERROR, hosts: [], error: `UNWITNESSED_${first.status}`, witnesses: [first.via] };
      const second = await resolvers[1].resolveMail(domain);
      if (first.status === MAIL_STATUS.DNS_ERROR) return NEGATIVE.has(second.status) ? { status: MAIL_STATUS.DNS_ERROR, hosts: [], error: `UNWITNESSED_${second.status}`, witnesses: [second.via] } : { ...second, witnesses: [second.via] };
      // Two negatives of different kinds still agree that the domain cannot receive mail.
      if (NEGATIVE.has(first.status) && NEGATIVE.has(second.status)) return { ...first, witnesses: [first.via, second.via] };
      if (!NEGATIVE.has(second.status) && second.status !== MAIL_STATUS.DNS_ERROR) return { ...second, witnesses: [second.via] };
      return { status: MAIL_STATUS.DNS_ERROR, hosts: [], error: `WITNESSES_DISAGREE_${first.status}_${second.status}`, witnesses: [first.via, second.via] };
    })());
    return cache.get(domain);
  };
}
