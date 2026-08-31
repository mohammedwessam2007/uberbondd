#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CAPABILITY_GENOME_BODY_IMPORT_VERSION, buildMeasuredSkillBodyCorpus } from '../src/capability-genome-body-import.mjs';
import { CAPABILITY_GENOME_BODY_FETCH_VERSION, executeGithubSkillBodyReads } from '../src/capability-genome-body-fetch.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = new Map(process.argv.slice(2).map(arg => {
  const index = arg.indexOf('=');
  return index === -1 ? [arg, true] : [arg.slice(0, index), arg.slice(index + 1)];
}));
const execute = args.has('--execute-github');
const requestFile = args.get('--requests');

if (!execute) {
  const pilotPath = path.join(root, 'artifacts/capability-genome/pilot/world-skill-bodies-2026-08-31.json');
  const pilot = fs.existsSync(pilotPath) ? JSON.parse(fs.readFileSync(pilotPath, 'utf8')) : null;
  console.log(JSON.stringify({
    ok: true,
    status: 'SKILL_BODY_IMPORT_PLAN_ONLY',
    importVersion: CAPABILITY_GENOME_BODY_IMPORT_VERSION,
    fetchVersion: CAPABILITY_GENOME_BODY_FETCH_VERSION,
    networkReadsExecuted: false,
    measuredPilotBodies: pilot?.skillBodiesImported || 0,
    next: 'SUPPLY_--requests=<json>_AND_--execute-github_WITH_EXPLICIT_HOST_NETWORK_READ_AUTHORITY',
    businessEffectAuthority: 'NONE'
  }, null, 2));
} else if (process.env.UBERBOND_CAPABILITY_GENOME_NETWORK_READS !== '1') {
  console.log(JSON.stringify({
    ok: false,
    status: 'SKILL_BODY_NETWORK_READS_NOT_AUTHORIZED_ON_HOST',
    reasonCodes: ['set-UBERBOND_CAPABILITY_GENOME_NETWORK_READS=1-for-public-read-only-execution'],
    businessEffectAuthority: 'NONE'
  }, null, 2));
  process.exitCode = 2;
} else if (!requestFile) {
  console.log(JSON.stringify({ ok: false, status: 'SKILL_BODY_REQUEST_FILE_REQUIRED', reasonCodes: ['--requests=<json>-required'], businessEffectAuthority: 'NONE' }, null, 2));
  process.exitCode = 2;
} else {
  const resolved = path.resolve(requestFile);
  let payload;
  try {
    payload = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  } catch (error) {
    console.log(JSON.stringify({ ok: false, status: 'SKILL_BODY_REQUEST_FILE_INVALID', errorClass: error?.code || error?.name || 'UNKNOWN', businessEffectAuthority: 'NONE' }, null, 2));
    process.exitCode = 2;
  }
  if (payload) {
    const execution = await executeGithubSkillBodyReads({
      requests: payload.requests,
      maxProviderCalls: Number(args.get('--max-provider-calls') || 50),
      maxBodyBytes: Number(args.get('--max-body-bytes') || 512 * 1024)
    });
    const corpus = execution.imports?.length
      ? buildMeasuredSkillBodyCorpus({ bodyImports: execution.imports, providerCalls: execution.providerCalls, observedAt: new Date() })
      : null;
    console.log(JSON.stringify({
      ok: execution.ok && (!corpus || corpus.ok),
      executionStatus: execution.status,
      providerCalls: execution.providerCalls,
      importedBodyCount: execution.imports?.length || 0,
      receipts: execution.receipts || [],
      corpusManifest: corpus?.manifest || null,
      businessEffectAuthority: 'NONE',
      externalEffectLedger: execution.externalEffectLedger
    }, null, 2));
    if (!execution.ok || (corpus && !corpus.ok)) process.exitCode = 1;
  }
}
