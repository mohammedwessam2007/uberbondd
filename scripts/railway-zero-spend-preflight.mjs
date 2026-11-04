#!/usr/bin/env node
// No network, provider login, deployment, secrets, or mutations. Evidence only.
import { readFileSync, lstatSync } from 'node:fs';
import { assessRailwayZeroSpendEvidence } from '../src/railway-zero-spend-preflight.mjs';

const input = process.argv[2];
const expectedSha = process.argv[3];
let report;
try {
  if (process.argv.length !== 4 || !input || input.length > 400 || !/^[a-f0-9]{40}$/.test(expectedSha || '')) throw Error('PINNED_SHA_AND_INPUT_REQUIRED');
  const stat = lstatSync(input);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 16_384) throw Error('UNSAFE_INPUT');
  const evidence = JSON.parse(readFileSync(input, 'utf8'));
  report = assessRailwayZeroSpendEvidence(evidence, { expectedSha });
} catch {
  report = assessRailwayZeroSpendEvidence(null);
}
process.stdout.write(`${JSON.stringify(report)}\n`);
// Evidence completion is NOT permission to deploy. Always exit nonzero for use as a deployment gate.
process.exitCode = 2;
