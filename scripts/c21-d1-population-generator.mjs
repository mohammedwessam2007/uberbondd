import crypto from 'node:crypto';
const SEED='b043eeb43bc5434a028b4f78489381c86a4f90b36f1a42afc6e7e17f7eda468e';
let counter=0;
function u64(){const b=Buffer.alloc(8);b.writeBigUInt64BE(BigInt(counter++));return crypto.createHash('sha256').update(Buffer.from(SEED,'hex')).update(b).digest().readBigUInt64BE(0);}
const pick=n=>Number(u64()%BigInt(n));
function uniqInts(n,min,max){const s=new Set();while(s.size<n)s.add(min+pick(max-min+1));return [...s].sort((a,b)=>a-b);}
const searchTopK=uniqInts(24,1,64);
const capabilityPool=Array.from({length:96},(_,i)=>`cap-${String(i).padStart(3,'0')}`);
const buildDistanceCases=Array.from({length:32},(_,i)=>{const existingCount=20+pick(31),requiredCount=6+pick(13),repetitions=[128,256,512,1024][pick(4)];const existing=uniqInts(existingCount,0,95).map(x=>capabilityPool[x]);const required=[];for(let j=0;j<requiredCount;j++){if(j%4===0)required.push(`missing-${i}-${j}`);else required.push(existing[pick(existing.length)]);}return{id:`build-${String(i).padStart(2,'0')}`,existing,required,repetitions};});
const topologyTasks=Array.from({length:32},(_,i)=>({id:`topology-${String(i).padStart(2,'0')}`,nonce:u64().toString(16).padStart(16,'0')}));
const population={schemaVersion:'uberbond.c21-d1-expanded-population.v1',seed:SEED,rng:'SHA256_COUNTER_U64_BE_V1',searchTopK,buildDistanceCases,topologyTasks};
const populationHash=crypto.createHash('sha256').update(JSON.stringify(population)).digest('hex');
console.log(JSON.stringify({populationHash,population},null,2));