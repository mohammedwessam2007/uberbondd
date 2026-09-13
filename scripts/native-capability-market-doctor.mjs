#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectNativeCapabilityMarket } from '../src/native-capability-market.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sourceRevision=String(process.env.UBERBOND_SOURCE_SHA||'WORKTREE');
const result=inspectNativeCapabilityMarket({rootDir:root,sourceRevision});
process.stdout.write(`${JSON.stringify(result,null,2)}\n`);
if(!result.ok)process.exitCode=2;
