import {readFileSync,statSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {compileUberMindTaskRoute} from '../src/ubermind-w40-evidence-first-task-compiler.mjs';

export const W40_ROUTE_DOCTOR='uberbond.ubermind.w40.offline-route-doctor.v1';
const testDigest=x=>'sha256:'+x.repeat(64);
const base=()=>({taskDigest:testDigest('a'),sourceDigest:testDigest('b'),
 rubricDigest:testDigest('c')});
const demo=[
 ['routine',base()],
 ['scoped-complex',{...base(),novelty:'complex'}],
 ['frontier',{...base(),novelty:'frontier'}],
 ['exact-reuse-pending-live-verification',{...base(),sourceReplay:{...base(),exactEligible:true}}],
 ['post-native-failure',{...base(),risk:'material',nativeAcceptanceStatus:'failed'}],
 ['owner-side-effect-blocked',{...base(),operation:'side-effect'}]
];
export function sampleUberMindW40Routes(){
 return {schema:W40_ROUTE_DOCTOR,status:'SOURCE_FREE_ROUTING_DEMONSTRATION',
  examples:demo.map(([name,contract])=>({name,result:compileUberMindTaskRoute(contract)})),
  providerCalls:0,actualClaudeProMeter:null,sameTaskQualityProven:false};
}
export function evaluateUberMindW40ContractFile(filepath){
 if(typeof filepath!=='string'||!filepath.trim())throw new Error('CONTRACT_FILE_REQUIRED');
 const p=resolve(filepath),st=statSync(p);
 if(!st.isFile()||st.size>65536)throw new Error('CONTRACT_FILE_TOO_LARGE');
 const raw=readFileSync(p,'utf8');
 const contract=JSON.parse(raw);
 return {schema:W40_ROUTE_DOCTOR,status:'OFFLINE_ROUTING_PROPOSAL',
  result:compileUberMindTaskRoute(contract),
  warning:'Contract facts and SHA digests supplied by caller are not authenticated; live checkout verification and quality acceptance must follow.'};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const output=process.argv.length===3&&process.argv[2]!=='--examples'?
   evaluateUberMindW40ContractFile(process.argv[2]):sampleUberMindW40Routes();
  process.stdout.write(JSON.stringify(output,null,2)+'\n');
 }catch{
  process.stderr.write('UBERMIND_W40_OFFLINE_CONTRACT_VALIDATION_FAILED\n');
  process.exitCode=1;
 }
}
