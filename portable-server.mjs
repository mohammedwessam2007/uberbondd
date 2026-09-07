import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { POST as paypalOrder } from './api/payments/paypal-order.mjs';
import { GET as paypalCapture } from './api/payments/paypal-capture.mjs';
import { POST as paypalWebhook } from './api/webhooks/paypal.mjs';
import { createPortablePayPalBridge } from './src/portable-paypal-bridge.mjs';

// Compose outside the canonical hardened server facade rather than importing
// server-core.mjs directly. server.mjs must remain the externally reachable
// authentication/credential-transport boundary. When this file is the process
// entrypoint, presenting server.mjs as argv[1] lets that facade preserve the
// mature server-core listen, scheduler, worker/store shutdown, and signal
// lifecycle while this outer interposition adds only the provider-neutral
// PayPal route bridge.
const nativeCreateServer = http.createServer;
const originalArgv1 = process.argv[1];
const portablePath = fileURLToPath(import.meta.url);
const portableIsEntryPoint = originalArgv1 === portablePath;
const serverFacadeUrl = new URL('./server.mjs', import.meta.url);
const serverFacadePath = fileURLToPath(serverFacadeUrl);
let requestHandler = null;

http.createServer = function createPortableServer(hardenedHandler, ...rest) {
  requestHandler = createPortablePayPalBridge({
    coreHandler: hardenedHandler,
    handlers: { order: paypalOrder, capture: paypalCapture, webhook: paypalWebhook }
  });
  return nativeCreateServer.call(http, requestHandler, ...rest);
};

if (portableIsEntryPoint) process.argv[1] = serverFacadePath;
let serverFacade;
try {
  serverFacade = await import(serverFacadeUrl.href);
} finally {
  process.argv[1] = originalArgv1;
  http.createServer = nativeCreateServer;
}

// Imported test/operator callers still receive the exact same composed handler
// without starting a listening socket. If the inner server construction did not
// occur for any future implementation reason, compose explicitly from the
// canonical hardened export rather than falling back to server-core.
if (!requestHandler) {
  requestHandler = createPortablePayPalBridge({
    coreHandler: serverFacade.requestHandler,
    handlers: { order: paypalOrder, capture: paypalCapture, webhook: paypalWebhook }
  });
}

export { requestHandler };
