import { Readable } from 'node:stream';

const ROUTES = Object.freeze({
  'POST /api/payments/paypal-order': 'order',
  'GET /api/payments/paypal-capture': 'capture',
  'POST /api/webhooks/paypal': 'webhook'
});

async function readBody(req, maxBytes = 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    const bytes = Buffer.from(chunk);
    size += bytes.length;
    if (size > maxBytes) throw Object.assign(new Error('Request body too large'), { status: 413 });
    chunks.push(bytes);
  }
  return Buffer.concat(chunks);
}

export function createPortablePayPalBridge({ coreHandler, handlers }) {
  return async function requestHandler(req, res) {
    const method = String(req.method || 'GET').toUpperCase();
    const url = new URL(req.url || '/', 'http://uberbond.local');
    const key = `${method} ${url.pathname}`;
    const route = ROUTES[key];
    if (!route) return coreHandler(req, res);
    let body;
    try { body = method === 'POST' ? await readBody(req) : undefined; }
    catch (error) {
      res.writeHead(error.status === 413 ? 413 : 400, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      return res.end(JSON.stringify({ ok: false, status: 'REFUSED', reasonCodes: [error.status === 413 ? 'body-too-large' : 'raw-body-read-failed'] }));
    }
    const request = new Request(url, {
      method,
      headers: req.headers,
      body: body?.length ? Readable.toWeb(Readable.from(body)) : undefined,
      duplex: body?.length ? 'half' : undefined
    });
    let response;
    try { response = await handlers[route](request); }
    catch { response = Response.json({ ok: false, status: 'REFUSED', reasonCodes: ['portable-route-handler-failed'] }, { status: 503 }); }
    res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
    res.end(Buffer.from(await response.arrayBuffer()));
  };
}
