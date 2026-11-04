#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { estimateRailwayFreeFloor } from '../src/railway-free-cost-floor.mjs';
const result = (() => {
  if (process.argv.length !== 3) return {status:'HOLD',reason:'ONE_SANITIZED_JSON_PATH_REQUIRED',deploymentPermitted:false};
  try {
    const data = JSON.parse(readFileSync(process.argv[2], 'utf8'));
    return estimateRailwayFreeFloor(data);
  } catch { return {status:'HOLD',reason:'UNREADABLE_OR_INVALID_JSON',deploymentPermitted:false}; }
})();
process.stdout.write(JSON.stringify(result,null,2)+'\n');
process.exitCode=2; // Always nonzero: this is an estimator, never a deployment approval.
