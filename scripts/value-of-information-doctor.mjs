#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { evaluateValueOfInformation, VALUE_OF_INFORMATION_GOVERNOR_VERSION } from '../src/value-of-information-governor.mjs';

const ZERO = Object.freeze({customerMessages:0,providerCalls:0,spendCents:0,deployments:0,dnsChanges:0,credentialChanges:0,paymentMutations:0,productionMutations:0});

export function runValueOfInformationDoctor(){
  const result=evaluateValueOfInformation({
    decision:'whether one more bounded observation is worth collecting',
    unit:'synthetic-information-unit',
    budgetUnits:10,
    currentEvidenceSufficient:false,
    observe:{canChangeDecision:true,discriminating:true,informationValueUnits:8,costUnits:1,delayCostUnits:1,optionDecayUnits:0,requiresExternalEffect:false},
    defer:{informationGainUnits:1,delayCostUnits:2,optionDecayUnits:0,windowRemainsOpen:true}
  });
  if(!result.ok)return{ok:false,status:'VOI_DOCTOR_REFUSED',reasonCodes:result.reasonCodes||['voi-governor-refused'],businessEffectAuthority:'NONE',externalEffectLedger:{...ZERO}};
  return{ok:true,status:'VOI_ZERO_EFFECT_OPERATOR_PATH_READY',governorVersion:VALUE_OF_INFORMATION_GOVERNOR_VERSION,decisionStatus:result.status,executionBoundary:result.executionBoundary,businessEffectAuthority:'NONE',externalEffectLedger:{...ZERO}};
}

const direct=process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1];
if(direct){const receipt=runValueOfInformationDoctor();process.stdout.write(`${JSON.stringify(receipt,null,2)}\n`);if(!receipt.ok)process.exitCode=1;}
