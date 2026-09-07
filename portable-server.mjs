import http from 'node:http';
import coreHandler from './server.mjs';
import { POST as paypalOrder } from './api/payments/paypal-order.mjs';
import { GET as paypalCapture } from './api/payments/paypal-capture.mjs';
import { POST as paypalWebhook } from './api/webhooks/paypal.mjs';
import { createPortablePayPalBridge } from './src/portable-paypal-bridge.mjs';
import { config, validateStartupConfig } from './src/config.mjs';

validateStartupConfig(config);
const handler = createPortablePayPalBridge({
  coreHandler,
  handlers: { order: paypalOrder, capture: paypalCapture, webhook: paypalWebhook }
});
const server = http.createServer(handler);
server.listen(config.port, () => console.log(`UberBond portable backend running on ${config.baseUrl} using ${config.storeBackend}`));

async function shutdown(signal) { server.close(); console.log(`Received ${signal}; portable backend stopped.`); }
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
