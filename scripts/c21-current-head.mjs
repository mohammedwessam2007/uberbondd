#!/usr/bin/env node
import fs from 'node:fs';
import {freezeCurrentHeadCampaign,evaluateCurrentHeadC21} from '../src/c21-current-head-tribunal.mjs';

const args=Object.fromEntries(process.argv.slice(2).filter(x=>x.startsWith('--')).map(x=>{const i=x.indexOf('=');return i<0?[x.slice(2),true]:[x.slice(2,i),x.slice(i+1)];}));
const revision=String(args['candidate-revision']||process.env.UBERBOND_C21_CANDIDATE_REVISION||'').trim();
const frozenAt=String(args['frozen-at']||process.env.UBERBOND_C21_FROZEN_AT||'').trim();
const observedAt=String(args['observed-at']||process.env.UBERBOND_C21_OBSERVED_AT||frozenAt).trim();
const salt=String(args['rotation-salt-digest']||process.env.UBERBOND_C21_ROTATION_SALT_DIGEST||'').trim().toLowerCase();
if(!/^[0-9a-f]{40}$/.test(revision)){console.error('candidate revision must be an exact 40-char git SHA');process.exit(2);}
const frozen=freezeCurrentHeadCampaign({candidateRevision:revision,frozenAt,rotationSaltDigest:salt});
if(!frozen.ok){console.log(JSON.stringify(frozen,null,2));process.exit(2);}
let receipts=[];
if(args.receipts){const parsed=JSON.parse(fs.readFileSync(String(args.receipts),'utf8'));receipts=Array.isArray(parsed)?parsed:(Array.isArray(parsed?.receipts)?parsed.receipts:[]);}
const result=evaluateCurrentHeadC21({campaign:frozen.campaign,currentRevision:revision,receipts,observedAt});
const critical=result.nextEvidenceCells?.filter(x=>x.critical).map(x=>({dimension:x.dimension,benchmarkSurfaces:x.benchmarkSurfaces,taskPopulationHash:x.taskPopulationHash}))||[];
const output={schemaVersion:'uberbond.c21-current-head-runner.v1',candidateRevision:revision,campaignDigest:frozen.campaignDigest,receiptCount:receipts.length,result,nextCriticalEvidenceCells:critical,externalEffectAuthority:'NONE',externalEffectLedger:{customerMessages:0,providerCalls:0,spendCents:0,deployments:0,dnsChanges:0,credentialChanges:0,paymentMutations:0,productionMutations:0}};
console.log(JSON.stringify(output,null,2));
process.exit(result.ok?0:3);
