#!/usr/bin/env node
import canaries from '../config/moonshot-reality-canaries.json' with { type: 'json' };
import { compileCanaryWave } from '../src/moonshot-canary-compiler.mjs';

const result = compileCanaryWave({ canaries: canaries.canaries });
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (!result.ok) process.exitCode = 1;
