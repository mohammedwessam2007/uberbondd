import fs from 'node:fs';
import { performance } from 'node:perf_hooks';
import { runVerifiedDefectsSale } from '../src/inquiry-findings.mjs';
import { probeInquiryPath } from '../src/inquiry-path-probe.mjs';
const websites=['https://www.bakerbrothersplumbing.com/','https://www.mrelectric.com/'];
const metrics=[];
const probe=async website=>{
 const start=performance.now();
 const receipt=await probeInquiryPath({website,maxPages:2,maxSiteMs:20000,witnessImpl:null});
 metrics.push({website,wallClockMs:Math.round(performance.now()-start),pages:receipt.pages?.length??0,rawFindings:receipt.analysis?.findings?.length??0,outcome:receipt.runtimeMetrics?.outcome??'UNKNOWN'});
 return receipt;
};
const delivered=[];
const result=await runVerifiedDefectsSale({buyerId:'BENCHMARK_NO_CUSTOMER',websites,probe,verifyProbe:probe,pushItem: async item=>delivered.push(item)});
const output={schema:'uberbond.delivery-only-reverification-benchmark.v1',dateUtc:new Date().toISOString(),websites,mode:'DELIVERY_ONLY_NO_PROVIDER_NO_CUSTOMER_NO_CHARGE',metrics,receipt:{ requested:result.requested,delivered:result.delivered,charged:result.charged,refused:result.refused,chargingMode:result.chargingMode },deliveredCount:delivered.length,externalPaymentEvidence:'NONE'};
fs.writeFileSync('artifacts/commercialization/delivery-only-benchmark-2026-10.json',JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify(output));
