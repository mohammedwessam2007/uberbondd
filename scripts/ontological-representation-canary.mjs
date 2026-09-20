#!/usr/bin/env node
import { runOntologicalRepresentationCanary } from '../src/ontological-representation-canary.mjs';

const result = runOntologicalRepresentationCanary();
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (!result.ok || result.falsifierTriggered) process.exitCode = 1;
