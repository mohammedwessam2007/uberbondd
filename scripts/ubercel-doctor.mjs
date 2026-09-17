#!/usr/bin/env node
// Reports UberBond's deployment state through Ubercel.
//
// Reads signals from a file when one is supplied, so the answer is always about
// evidence somebody actually collected. With no signals it says
// UNKNOWN__NO_EVIDENCE, which is the honest reading and the current one: nothing
// in this repository collects contract-bound health evidence yet.
//
// It probes nothing and calls nothing.
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { diagnoseUbercelDeployment } from '../src/ubercel-deployment-doctor.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SIGNALS = process.env.UBERCEL_SIGNALS || 'artifacts/ubercel/deployment-signals.json';

function main() {
  const path = resolve(root, SIGNALS);
  let input = { serviceId: 'uberbondd', healthContract: null, signals: [] };
  if (existsSync(path)) {
    try {
      input = { ...input, ...JSON.parse(readFileSync(path, 'utf8')) };
    } catch (error) {
      // An unreadable signal file is not zero signals. Saying so beats reporting
      // UNKNOWN__NO_EVIDENCE as though the file had been read and was empty.
      console.log(`ubercel: signal file present but unreadable (${error.message})`);
      process.exitCode = 1;
      return;
    }
  }

  const result = diagnoseUbercelDeployment(input);
  if (!result.ok) {
    console.log(`ubercel: ${result.status} — ${result.reasonCodes.join(', ')}`);
    process.exitCode = 1;
    return;
  }

  const report = result.report;
  console.log(`ubercel deployment — ${report.serviceId}`);
  console.log(`  state: ${report.state}`);
  console.log(`  contract-bound authoritative signals: ${report.authoritativeSignals}`);
  if (report.providerBadges.length) {
    console.log(`  provider badges (each establishes nothing about UberBond):`);
    for (const row of report.providerBadges) {
      console.log(`    ${row.provider} [${row.adapterType}] serving=${row.serving} — ${row.sourceRef}`);
    }
  }
  if (report.rejectedSignals.length) {
    console.log(`  refused signals: ${report.rejectedSignals.length}`);
    for (const row of report.rejectedSignals) console.log(`    ${row.sourceRef ?? '(no ref)'}: ${row.reasonCodes.join(', ')}`);
  }
  if (!existsSync(path)) {
    console.log(`  no signal file at ${SIGNALS} — nothing in this repository collects contract-bound health evidence yet`);
  }
  console.log(`  deploymentAuthority: ${report.deploymentAuthority}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
export { main };
