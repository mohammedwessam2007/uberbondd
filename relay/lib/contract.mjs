// Small Vercel-native relay adapter contract.  This surface is intentionally
// read-only/failed-closed: it does not pretend to be the durable Node worker.

export const RELAY_ADAPTER_VERSION = 'vercel-relay-adapter-1.0.0';

export const ZERO_EXTERNAL_EFFECTS = Object.freeze({
  providerCalls: 0,
  messages: 0,
  purchases: 0,
  deployments: 0,
  credentialChanges: 0,
  dnsChanges: 0,
  productionMutations: 0,
  spendCents: 0
});

export function responseBody({ status, reasonCodes = [], supported = false } = {}) {
  return {
    ok: status === 'HEALTHY_PARTIAL_ADAPTER',
    service: 'uberbondd-relay',
    adapter: 'vercel-native',
    adapterVersion: RELAY_ADAPTER_VERSION,
    status,
    durableQueue: 'NOT_CONFIGURED',
    cloudWorker: 'NOT_DEPLOYED',
    supported,
    reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
    truth: {
      cloudRelay: 'INTERFACE_ONLY',
      fullDurableRelay: 'NOT_DEPLOYED',
      externalProvider: 'DISABLED',
      execution: 'NOT_RUN'
    },
    externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS }
  };
}

export function sendJson(res, statusCode, body) {
  if (res && typeof res.status === 'function' && typeof res.json === 'function') {
    res.status(statusCode).setHeader?.('cache-control', 'no-store');
    return res.status(statusCode).json(body);
  }
  if (res && typeof res.writeHead === 'function' && typeof res.end === 'function') {
    res.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    return res.end(JSON.stringify(body));
  }
  return undefined;
}

export function methodNotAllowed(req, res, allowed) {
  if (allowed.includes(String(req?.method || 'GET').toUpperCase())) return false;
  sendJson(res, 405, responseBody({ status: 'REJECTED', reasonCodes: ['method-not-allowed'] }));
  return true;
}
