#!/usr/bin/env node
import { inspectCapabilityTotalState } from '../src/capability-total-state.mjs';

const sourceRevision=String(process.env.UBERBOND_SOURCE_SHA||'WORKTREE');
const result=inspectCapabilityTotalState({sourceRevision});
process.stdout.write(`${JSON.stringify(result,null,2)}\n`);
if(!result.ok)process.exitCode=2;
