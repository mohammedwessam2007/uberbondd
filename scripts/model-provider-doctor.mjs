#!/usr/bin/env node
// Operator entry point for the model-provider doctor.
//
// Prints presence, never values. The report is JSON so it can be pasted into a
// handoff or diffed between runs; the exit code is 1 while no lane is
// configured, so a scheduled check fails loudly instead of printing red into a
// log nobody reads.

import { inspectModelProviders } from '../src/model-provider-doctor.mjs';

try {
  const report = inspectModelProviders({ env: process.env });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  // Not-configured is a real blocker, and it is a human one. Exiting non-zero
  // says the system cannot route, without pretending code can fix it.
  if (!report.ok) process.exitCode = 1;
} catch (error) {
  process.stderr.write(`${JSON.stringify({
    ok: false,
    status: 'MODEL_PROVIDER_DOCTOR_FAILED',
    reason: error?.message || 'unknown-error'
  }, null, 2)}\n`);
  process.exitCode = 1;
}
