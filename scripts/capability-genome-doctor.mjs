#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectCapabilityGenome } from '../src/capability-genome-doctor.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
const pilotPath = 'artifacts/capability-genome/pilot/world-repository-candidates-2026-08-31.json';
const bodyPilotPath = 'artifacts/capability-genome/pilot/world-skill-bodies-2026-08-31.json';
const normalizedPath = 'artifacts/capability-genome/pilot/normalized-capability-records-2026-09-01.json';
const corpusState = fs.existsSync(path.join(root, pilotPath)) ? read(pilotPath) : null;
const bodyCorpusState = fs.existsSync(path.join(root, bodyPilotPath)) ? read(bodyPilotPath) : null;
// The records themselves, not a number describing them. Passing [] here is how
// the doctor came to report zero normalized capabilities while the artifact
// holding them sat beside it.
const normalizedRecordState = fs.existsSync(path.join(root, normalizedPath)) ? read(normalizedPath) : null;
const result = inspectCapabilityGenome({
  sourceRegistry: read('artifacts/capability-genome/source-registry.json'),
  atomTaxonomy: read('artifacts/capability-genome/capability-atoms.json'),
  capabilityRecords: normalizedRecordState?.capabilities || [],
  existingSupplierRegistry: read('artifacts/external-skill-plugin-registry.json'),
  corpusState,
  bodyCorpusState,
  normalizedRecordState
});
console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exitCode = 1;
