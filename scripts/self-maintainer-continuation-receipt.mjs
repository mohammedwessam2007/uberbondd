#!/usr/bin/env node
import fs from 'node:fs';
import { decideSelfMaintainerContinuation } from '../src/self-maintainer-continuation-policy.mjs';

const inputPath = process.argv[2];
if (!inputPath || !fs.existsSync(inputPath)) {
  console.error('self-maintainer result path required');
  process.exit(2);
}

const primary = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const baseRevision = String(primary.baseRevision || process.env.GITHUB_SHA || '').trim().toLowerCase();
if (!/^[a-f0-9]{40}$/.test(baseRevision)) {
  console.error('exact self-maintainer base revision required');
  process.exit(2);
}
const taskId = String(primary.taskId || `uberbond_self_maintain_${baseRevision.slice(0, 24)}`);
const reasonCodes = Array.isArray(primary.reasonCodes) ? primary.reasonCodes.map(String) : [];
const evidenceRefs = [
  `self-maintainer-status:${String(primary.status || 'UNKNOWN')}`,
  ...reasonCodes.map(code => `reason:${code}`)
];

const receipt = decideSelfMaintainerContinuation({
  taskId,
  baseRevision,
  relayStatus: primary.status,
  reasonCodes,
  evidenceRefs
});

process.stdout.write(`${JSON.stringify({
  schemaVersion: 'uberbond.self-maintainer-continuation-receipt.v1',
  observedBaseRevision: baseRevision,
  observedPrimaryStatus: primary.status || null,
  observedReasonCodes: reasonCodes,
  observedTaskId: primary.taskId || taskId,
  observedIssueNumber: primary.issueNumber || null,
  continuation: receipt,
  businessEffectAuthority: 'NONE',
  truthBoundary: 'THIS RECEIPT IS BOUND TO ONE EXACT MAIN BASE AND MAY PREVENT A REPEATED STRATEGY; IT DOES NOT EXECUTE THE ALTERNATIVE, MERGE, DEPLOY, SEND, SPEND, OR CREATE EXTERNAL TRUTH'
}, null, 2)}\n`);
