// GET-only pinned-IP HTTP client: DNS rebinding cannot redirect an established
// connection to a private address between the address check and the socket.
import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns/promises';
import { isPrivateIp, assertPublicUrl } from './security.mjs';
import { abortable } from './inquiry-probe-budget.mjs';
const LIMIT = 2_000_000;
export async function fetchPublicPinned(input, { method = 'GET', signal, headers = {} } = {}) {
  if (method !== 'GET') throw Error('ONLY_READ_ONLY_GET_SUPPORTED');
  const url = await abortable(assertPublicUrl(input), signal);
  const records = await abortable(dns.lookup(url.hostname, { all: true, verbatim: true }), signal);
  if (!records.length || records.some(record => isPrivateIp(record.address))) throw Error('NON_PUBLIC_DNS_RESPONSE');
  const pinned = records[0];
  return abortable(new Promise((resolve, reject) => {
    const request = (url.protocol === 'https:' ? https : http).request(url, {
      method: 'GET', headers: { 'User-Agent': 'UberBondInquiryPathProbe/1.0 (read-only)', Accept: 'text/html,*/*;q=0.8', ...Object.fromEntries(Object.entries(headers).filter(([name]) => /^(?:user-agent|accept)$/i.test(name))) },
      lookup: (_hostname, options, callback) => options?.all ? callback(null, [pinned]) : callback(null, pinned.address, pinned.family),
      rejectUnauthorized: true, timeout: 20_000,
      agent: false
    }, response => {
      let received = false;
      resolve({
        status: response.statusCode,
        headers: { get: name => response.headers[String(name).toLowerCase()] ?? null },
        body: { cancel: async () => { response.destroy(); } },
        text: async () => {
          if (received) throw Error('RESPONSE_ALREADY_CONSUMED');
          received = true;
          const chunks = []; let bytes = 0;
          try {
            for await (const chunk of response) {
              if (signal?.aborted) throw Error('HTTP_DEADLINE_EXCEEDED');
              bytes += chunk.length;
              if (bytes > LIMIT) throw Error('RESPONSE_BODY_TOO_LARGE');
              chunks.push(chunk);
            }
          } finally { response.destroy(); }
          return Buffer.concat(chunks).toString('utf8');
        }
      });
    });
    request.once('error', reject);
    request.once('timeout', () => request.destroy(Error('HTTP_DEADLINE_EXCEEDED')));
    if (signal) {
      if (signal.aborted) request.destroy(signal.reason);
      else signal.addEventListener('abort', () => request.destroy(Error('HTTP_DEADLINE_EXCEEDED')), { once: true });
    }
    request.end();
  }), signal);
}
