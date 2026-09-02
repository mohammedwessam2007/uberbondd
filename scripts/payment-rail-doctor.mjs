#!/usr/bin/env node
// Which payment rail this runtime could actually take money through, and what
// is missing if it could not.
//
// Reads environment PRESENCE only -- never a value, never a fragment of one.
// LIVE_READY is deliberately unreachable from presence alone: it needs a
// durable provider verification receipt and a fresh owner KYC attestation,
// because "the variables are set" and "money can clear" are different claims.
import { diagnosePaymentRail, summarizePaymentRail } from '../src/payment-rail-doctor.mjs';

export function buildPaymentRailReport({ env = process.env, mode = 'SANDBOX', at = new Date() } = {}) {
  const report = diagnosePaymentRail({ env, mode, at });
  return { ...report, summary: summarizePaymentRail(report) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const mode = process.argv.includes('--live') ? 'LIVE' : 'SANDBOX';
  process.stdout.write(`${JSON.stringify(buildPaymentRailReport({ mode }), null, 2)}\n`);
}
