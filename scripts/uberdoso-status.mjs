#!/usr/bin/env node
import { compileUberDosoActivation } from '../src/uberdoso-activation.mjs';
import { compileUberDosoVerifierContracts } from '../src/uberdoso-dns-contract.mjs';
import { UBERDOSO_ALLOWED_RELATIONSHIPS } from '../src/uberdoso-delivery-policy.mjs';
import { compileContaboMailCellPlan, UBERCLOUD_CONTABO_CELL_VERSION } from '../src/ubercloud-contabo-cell-actuator.mjs';
import { discoverContaboMailCellInputs, UBERCLOUD_CONTABO_PREFLIGHT_VERSION } from '../src/ubercloud-contabo-cell-preflight.mjs';

const result={
  ok:true,
  status:'UBERDOSO_OPERATOR_SURFACE_READY',
  capabilities:{
    activationCompiler:typeof compileUberDosoActivation==='function',
    dnsVerifierContractCompiler:typeof compileUberDosoVerifierContracts==='function',
    permittedRelationshipClasses:[...UBERDOSO_ALLOWED_RELATIONSHIPS],
    physicalCellAcquisition:{
      available:typeof compileContaboMailCellPlan==='function',
      version:UBERCLOUD_CONTABO_CELL_VERSION,
      providerCandidate:'contabo',
      spendAuthorityRequired:'EXPLICIT_ONE_SHOT',
      automaticSpendAllowed:false,
      preflight:{
        available:typeof discoverContaboMailCellInputs==='function',
        version:UBERCLOUD_CONTABO_PREFLIGHT_VERSION,
        mode:'READ_ONLY_ACCOUNT_METADATA',
        automaticCredentialCreation:false
      }
    }
  },
  externalEffectAuthority:'NONE'
};
process.stdout.write(`${JSON.stringify(result,null,2)}\n`);
