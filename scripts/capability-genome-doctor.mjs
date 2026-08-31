#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectCapabilityGenome } from '../src/capability-genome-doctor.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
const pilotPath = 'artifacts/capability-genome/pilot/world-repository-candidates-2026-08-31.json';
const bodyPilotPath = 'artifacts/capability-genome/pilot/world-skill-bodies-2026-08-31.json';
const corpusState = fs.existsSync(path.join(root, pilotPath)) ? read(pilotPath) : null;
const bodyCorpusState = fs.existsSync(path.join(root, bodyPilotPath)) ? read(bodyPilotPath) : null;
const result = inspectCapabilityGenome({
  sourceRegistry: read('artifacts/capability-genome/source-registry.json'),
  atomTaxonomy: read('artifacts/capability-genome/capability-atoms.json'),
  capabilityRecords: [],
  existingSupplierRegistry: read('artifacts/external-skill-plugin-registry.json'),
  corpusState,
  bodyCorpusState
});
console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exitCode = 1;
