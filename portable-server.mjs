import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { POST as paypalOrder } from './api/payments/paypal-order.mjs';
import { GET as paypalCapture } from './api/payments/paypal-capture.mjs';
import { POST as paypalWebhook } from './api/webhooks/paypal.mjs';
import { createPortablePayPalBridge } from './src/portable-paypal-bridge.mjs';
const originalCreateServer = http.createServer;
const originalArgv1 = process.argv[1];
const coreUrl = new URL('./server-core.mjs', import.meta.url);
const corePath = fileURLToPath(coreUrl);
let requestHandler;
http.createServer = function createPortableServer(coreHandler, ...rest) {
  requestHandler = createPortablePayPalBridge({
    coreHandler,
    handlers: { order: paypalOrder, capture: paypalCapture, webhook: paypalWebhook }
  });
  return originalCreateServer.call(http, requestHandler, ...rest);
};
process.argv[1] = corePath;
try { await import(coreUrl.href); }
finally { process.argv[1] = originalArgv1; http.createServer = originalCreateServer; }

export { requestHandler };
