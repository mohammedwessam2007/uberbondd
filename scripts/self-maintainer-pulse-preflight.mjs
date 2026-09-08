#!/usr/bin/env node
import fs from 'node:fs';
import { gateSelfMaintainerPulse } from '../src/self-maintainer-continuation-policy.mjs';

const priorPath = process.argv[2] || '';
const currentBaseRevision = String(process.env.GITHUB_SHA || '').trim().toLowerCase();
let priorReceipt = null;
if (priorPath && fs.existsSync(priorPath)) {
  try {
    priorReceipt = JSON.parse(fs.readFileSync(priorPath, 'utf8'));
  } catch {
    priorReceipt = { malformed: true };
  }
}

const result = gateSelfMaintainerPulse({ currentBaseRevision, priorReceipt });
process.stdout.write(`${JSON.stringify({
  schemaVersion: 'uberbond.self-maintainer-pulse-preflight.v1',
  ...result,
  businessEffectAuthority: 'NONE'
}, null, 2)}\n`);
if (!result.ok) process.exit(2);
