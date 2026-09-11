#!/usr/bin/env node
import crypto from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileC21EvidenceCampaign, C21_EVIDENCE_FACTORY_VERSION } from '../src/c21-evidence-factory.mjs';
import { summarizeBenchmarkEvidence, BENCHMARK_EVIDENCE_LEDGER_VERSION } from '../src/benchmark-evidence-ledger.mjs';

export const C21_EVIDENCE_DOCTOR_VERSION='uberbond.c21-evidence-doctor.v1';

export function runC21EvidenceDoctor({candidateRevision='SOURCE_ONLY_DOCTOR'}={}){
  const rotationSaltDigest=crypto.createHash('sha256').update('uberbond-c21-evidence-doctor-source-only').digest('hex');
  const campaignResult=compileC21EvidenceCampaign({
    candidateId:'uberbond-source-only-doctor',
    candidateRevision,
    frozenAt:'2026-09-11T00:00:00.000Z',
    rotationSaltDigest,
    minimumIndependentVerifierIdentities:3
  });
  const ledger=campaignResult.ok?summarizeBenchmarkEvidence({campaign:campaignResult.campaign,receipts:[]}):null;
  const ok=campaignResult.ok===true
    && ledger?.counts?.required===20
    && ledger?.counts?.observedNonsynthetic===0
    && ledger?.counts?.missing===20
    && ledger?.counts?.missingCritical===7
    && ledger?.asiStatus==='SYSTEM_LEVEL_ASI_NOT_ESTABLISHED';
  return {
    ok,
    status:ok?'C21_EVIDENCE_SOURCE_ACCOUNTING_READY':'C21_EVIDENCE_SOURCE_ACCOUNTING_REFUSED',
    versions:{doctor:C21_EVIDENCE_DOCTOR_VERSION,factory:C21_EVIDENCE_FACTORY_VERSION,ledger:BENCHMARK_EVIDENCE_LEDGER_VERSION},
    campaignStatus:campaignResult.status,
    ledgerStatus:ledger?.status||null,
    counts:ledger?.counts||null,
    asiStatus:ledger?.asiStatus||'SYSTEM_LEVEL_ASI_NOT_ESTABLISHED',
    businessEffectAuthority:'NONE',
    externalEffectAuthority:'NONE',
    truthBoundary:'SOURCE_REACHABILITY_AND_EVIDENCE_ACCOUNTING_ONLY__ZERO_AUTHENTICATED_OBSERVED_RECEIPTS_REMAIN_ZERO_SYSTEM_LEVEL_EVIDENCE'
  };
}

const direct=process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(direct){const result=runC21EvidenceDoctor();process.stdout.write(`${JSON.stringify(result,null,2)}\n`);if(!result.ok)process.exitCode=2;}
