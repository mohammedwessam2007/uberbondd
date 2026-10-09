import {auctionUberMindW41} from '../src/ubermind-w41-proof-constrained-route-auction.mjs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export const W41_DOCTOR_SCHEMA='uberbond.ubermind.w41.price-doctor.v1';
const A='sha256:'+'a'.repeat(64),B='sha256:'+'b'.repeat(64),C='sha256:'+'c'.repeat(64);
const receipt={taskDigest:A,sourceDigest:B,rubricDigest:C,
 independentAccepted:true,comparableBaseline:true,
 evidencePointer:'illustrative:NOT_ACTUAL_QUALITY_EVIDENCE',baselineScore:.95,candidateScore:.95};
const model=(model,inputTokens,outputTokens,effort='medium')=>({
 model,inputTokens,outputTokens,effort,count:1
});
const unit=(id,classification,input,output,routes=[])=>({
 id,classification,taskDigest:A,sourceDigest:B,rubricDigest:C,
 baselineInputTokens:input,baselineOutputTokens:output,routes
});
const exactRoute={id:'native-exact-source',kind:'exact',calls:[],
  receipt,fullTraceDeclared:true,reverifyInLiveCheckout:true};
const alt=(id,modelName,input,output,effort)=>({
 id,kind:'model',calls:[model(modelName,input,output,effort)],receipt,
 fullTraceDeclared:true,reverifyInLiveCheckout:true
});
export function uberMindW41IllustrativeAuction(){
 const units=[
  unit('existing-proven-work','routine',600000,120000,[exactRoute]),
  unit('novel-architecture','frontier',60000,12000),
  unit('bounded-implementation','scoped',100000,20000,
   [alt('sonnet-build','sonnet',100000,20000,'medium')])
 ];
 for(let i=1;i<=4;i++)units.push(unit('source-lookup-'+i,'routine',60000,12000,
  [alt('haiku-scout-'+i,'haiku',60000,12000,'low')]));
 const result=auctionUberMindW41({units,overheadCalls:[
  model('sonnet',15000,3000,'high')
 ]});
 return {schema:W41_DOCTOR_SCHEMA,
  status:'SYNTHETIC_SCENARIO_QUALITY_EVIDENCE_FABRICATED_FOR_ARITHMETIC_ONLY',
  exampleBasedOnOfficial2026_10_10Claude55ApiTariffs:true,
  callCounting:'All model calls and one 15k/3k high-effort Sonnet final-verifier modeled; no hidden additional calls asserted.',
  selectedQualityReceiptsReal:false,actualClaudeProFiveHourSavedPercent:null,
  result};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))
 process.stdout.write(JSON.stringify(uberMindW41IllustrativeAuction(),null,2)+'\n');
