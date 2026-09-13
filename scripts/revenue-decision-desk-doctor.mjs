#!/usr/bin/env node
import {runRevenueDecisionDesk} from '../src/revenue-decision-desk.mjs';

const result=runRevenueDecisionDesk([
  {id:'doctor',fingerprint:'doctor',evidenceRefs:['receipt:doctor:opportunity'],authority:true,stopConditions:['stop-on-negative-evidence'],expectedClearedContribution:1,founderMinutes:1,probability:.5,downside:0,reversibility:1,evidenceQuality:1}
],{maxActions:1});
const ok=Array.isArray(result?.selected)&&result.selected.includes('doctor');
const output={ok,status:ok?'REVENUE_DECISION_DESK_READY':'REVENUE_DECISION_DESK_BLOCKED',businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',truthBoundary:'READ_ONLY ZERO-EFFECT DOCTOR. THIS PROVES ONLY SOURCE CALLABILITY AND DOES NOT CREATE OR EXECUTE A COMMERCIAL ACTION.'};
process.stdout.write(`${JSON.stringify(output,null,2)}\n`);
if(!ok)process.exitCode=2;
