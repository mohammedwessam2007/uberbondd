import { methodNotAllowed, responseBody, sendJson } from '../../../lib/contract.mjs';

export default function handler(req, res) {
  if (methodNotAllowed(req, res, ['POST'])) return;
  return sendJson(res, 501, responseBody({
    status: 'NOT_IMPLEMENTED',
    reasonCodes: ['durable-queue-required', 'cloud-worker-not-deployed']
  }));
}
