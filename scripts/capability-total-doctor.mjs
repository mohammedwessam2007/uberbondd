#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectCapabilityTotalState } from '../src/capability-total-state.mjs';
import { loadCapabilityReceipts } from '../src/capability-receipt-loader.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sourceRevision=String(process.env.UBERBOND_SOURCE_SHA||'WORKTREE');
const loaded=loadCapabilityReceipts({rootDir:root});
if(!loaded.ok){process.stderr.write(`${JSON.stringify(loaded,null,2)}\n`);process.exitCode=2;}else{
  const result=inspectCapabilityTotalState({sourceRevision,externalRealityReceipts:loaded.receipts});
  process.stdout.write(`${JSON.stringify({...result,receiptStoreStatus:loaded.status},null,2)}\n`);
  if(!result.ok)process.exitCode=2;
}
