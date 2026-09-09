#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { compileSovereignReleaseRequest } from '../src/sovereign-release-handoff.mjs';

const path = process.argv[2];
if (!path) {
  process.stdout.write(`${JSON.stringify({ ok: false, status: 'SOVEREIGN_RELEASE_REQUEST_REFUSED', reasonCodes: ['merge-receipt-path-required'], signingAuthority: 'NONE', deploymentAuthority: 'NONE', businessEffectAuthority: 'NONE', externalEffectAuthority: 'NONE' }, null, 2)}\n`);
  process.exitCode = 2;
} else {
  try {
    const mergeReceipt = JSON.parse(readFileSync(path, 'utf8'));
    const result = compileSovereignReleaseRequest({ mergeReceipt });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.ok) process.exitCode = 2;
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ ok: false, status: 'SOVEREIGN_RELEASE_REQUEST_REFUSED', reasonCodes: ['merge-receipt-read-or-parse-failed'], detail: String(error?.message || error).slice(0, 300), signingAuthority: 'NONE', deploymentAuthority: 'NONE', businessEffectAuthority: 'NONE', externalEffectAuthority: 'NONE' }, null, 2)}\n`);
    process.exitCode = 2;
  }
}
