import { methodNotAllowed, responseBody, sendJson } from '../../lib/contract.mjs';

export default function handler(req, res) {
  if (methodNotAllowed(req, res, ['GET'])) return;
  return sendJson(res, 200, responseBody({
    status: 'HEALTHY_PARTIAL_ADAPTER',
    supported: true
  }));
}
