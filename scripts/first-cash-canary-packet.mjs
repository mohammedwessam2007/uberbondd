#!/usr/bin/env node
// The one machine-consumable answer to "can UberBond take its first $450 yet",
// with every gate named and the reason each one is or is not open.
//
// canContact is a pure function of the gates and is false today. It is printed
// first because it is the only line that matters until it changes.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compileFirstCashCanaryPacket } from '../src/first-cash-canary-packet.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const REGISTRY_PATH = 'artifacts/outreach/free-first-provider-registry-2026-09-01.json';

export function buildFirstCashCanaryPacket({ root = repoRoot, date = new Date('2026-09-02T00:00:00.000Z') } = {}) {
  const providers = JSON.parse(readFileSync(join(root, REGISTRY_PATH), 'utf8')).providers;
  return compileFirstCashCanaryPacket({ providers, date });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.stdout.write(`${JSON.stringify(buildFirstCashCanaryPacket(), null, 2)}\n`);
}
