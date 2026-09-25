#!/usr/bin/env node
// Observe public DNS for all 30 owned domains and print (or write) a receipt.
//   node scripts/outreach-fleet-dns-observe.mjs            # print only
//   node scripts/outreach-fleet-dns-observe.mjs --write    # also write artifacts/outreach/fleet-dns-observation-<date>.json
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { observeFleetDns } from '../src/outreach-fleet-dns-observatory.mjs';

const receipt = await observeFleetDns({ observer: `${os.hostname()}:${process.platform}` });
const body = `${JSON.stringify(receipt, null, 2)}\n`;
if (process.argv.includes('--write')) {
  const file = path.join('artifacts', 'outreach', `fleet-dns-observation-${receipt.observedAt.slice(0, 10)}.json`);
  fs.writeFileSync(file, body);
  process.stderr.write(`wrote ${file}\n`);
}
process.stdout.write(process.argv.includes('--summary') ? `${JSON.stringify({ observedAt: receipt.observedAt, domainsObserved: receipt.domainsObserved, summary: receipt.summary }, null, 2)}\n` : body);
process.exitCode = receipt.domains.some(row => row.mailState === 'OBSERVATION_INCOMPLETE') ? 2 : 0;
