export const OMEGA_PRIVATE_BENCHMARK_GENERATOR_VERSION='uberbond.omega-private-benchmark-generators.v1';
function rng(seed){let x=(Number(seed)>>>0)||1;return()=>{x=(1664525*x+1013904223)>>>0;return x/2**32;};}
function shuffle(a,r){a=[...a];for(let i=a.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
export function generateColoring(seed,id='color',domain='COLORING'){
 const r=rng(seed),n=8,ids=Array.from({length:n},(_,i)=>`v${i}`),hub=Math.floor(r()*n),edges=[];
 for(let i=0;i<n;i++)if(i!==hub)edges.push([ids[hub],ids[i]]);
 for(let k=0;k<4;k++){const a=Math.floor(r()*n),b=Math.floor(r()*n);if(a!==b)edges.push([ids[a],ids[b]]);}
 const order=shuffle(ids,r);return{id,domain,variables:order.map(x=>({id:x,domain:[0,1,2,3]})),constraints:edges.map(vars=>({type:'neq',vars})),givens:{[ids[(hub+1)%n]]:Math.floor(r()*4)}};
}
export function generatePrecedence(seed,id='precedence',domain='PRECEDENCE'){
 const r=rng(seed),n=7,ids=Array.from({length:n},(_,i)=>`t${i}`),hub=ids[3];
 const edges=[[ids[0],hub],[ids[1],hub],[ids[2],hub],[hub,ids[4]],[hub,ids[5]],[hub,ids[6]],[ids[0],ids[1]]],order=shuffle(ids,r);
 return{id,domain,variables:order.map(x=>({id:x,domain:[0,1,2,3,4,5,6,7,8]})),constraints:edges.map(vars=>({type:'lt',vars})),givens:{[ids[0]]:0}};
}
export function generateBalance(seed,id='balance',domain='BALANCE'){
 const r=rng(seed),n=7,ids=Array.from({length:n},(_,i)=>`x${i}`),planted=Object.fromEntries(ids.map((x,i)=>[x,(i*2+Number(seed))%5])),groups=[[0,1,3],[2,3,4],[3,5,6],[0,4,6]];
 const constraints=groups.map(g=>({type:'sumEq',vars:g.map(i=>ids[i]),target:g.reduce((s,i)=>s+planted[ids[i]],0)}));constraints.push({type:'neq',vars:[ids[1],ids[5]]});
 const order=shuffle(ids,r);return{id,domain,variables:order.map(x=>({id:x,domain:[0,1,2,3,4]})),constraints,givens:{[ids[0]]:planted[ids[0]]}};
}
export function generateAllDifferent(seed,id='alldiff',domain='ALL_DIFFERENT'){
 const r=rng(seed),n=6,ids=Array.from({length:n},(_,i)=>`a${i}`),order=shuffle(ids,r);
 return{id,domain,variables:order.map(x=>({id:x,domain:[1,2,3,4,5,6]})),constraints:[{type:'allDifferent',vars:ids.slice(0,4)},{type:'allDifferent',vars:[ids[2],ids[3],ids[4],ids[5]]},{type:'lt',vars:[ids[0],ids[4]]}],givens:{[ids[0]]:1}};
}
export function generateSuite(seedBase,{perFamily=10,domainPrefix='HIDDEN'}={}){
 const out=[];for(let i=0;i<perFamily;i++){
  out.push(generateColoring(seedBase+i,`c${i}`,`${domainPrefix}_RADIO`));
  out.push(generatePrecedence(seedBase+1000+i,`p${i}`,`${domainPrefix}_WORKFLOW`));
  out.push(generateBalance(seedBase+2000+i,`b${i}`,`${domainPrefix}_BALANCE`));
  out.push(generateAllDifferent(seedBase+3000+i,`a${i}`,`${domainPrefix}_ROSTER`));
 }
 return out;
}
export function generateTrainingSuite(){
 const out=[];for(let i=0;i<5;i++){
  out.push(generateColoring(10+i,`sc${i}`,'TRAIN_COLOR'));
  out.push(generatePrecedence(20+i,`sp${i}`,'TRAIN_ORDER'));
  out.push(generateBalance(30+i,`sb${i}`,'TRAIN_BALANCE'));
  out.push(generateAllDifferent(40+i,`sa${i}`,'TRAIN_ALLDIFF'));
 }
 return out;
}
