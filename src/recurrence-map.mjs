import crypto from 'node:crypto';
const h=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const key=(o,k)=>o?.[k]==null?null:h(o[k]);
export function buildRecurrenceMap(records=[]){
 if(!Array.isArray(records))throw new Error('records-required');
 const dimensions=['obligation','claim','sourceDependencies','taskArchetype','decisionBoundary','evidenceTransform','verificationStep','rendering'];
 const out={schemaVersion:'uberbond.recurrence-map.v1',recordCount:records.length,dimensions:{},priorityDomains:[]};
 for(const d of dimensions){const m=new Map();for(const r of records){const k=key(r,d);if(!k)continue;const x=m.get(k)??{hash:k,count:0,taskClasses:new Set(),examples:[]};x.count++;if(r.taskClass)x.taskClasses.add(r.taskClass);if(x.examples.length<3)x.examples.push(r.id??null);m.set(k,x);}const rows=[...m.values()].map(x=>({hash:x.hash,count:x.count,taskClasses:[...x.taskClasses],examples:x.examples})).sort((a,b)=>b.count-a.count);out.dimensions[d]={unique:rows.length,repeated:rows.filter(x=>x.count>1).length,maxFanout:rows[0]?.count??0,top:rows.slice(0,20)};}
 const byClass=new Map();for(const r of records){if(!r.taskClass)continue;const x=byClass.get(r.taskClass)??{taskClass:r.taskClass,n:0,stable:0};x.n++;if(r.driftClass==='LOW'||r.driftClass==='MODERATE')x.stable++;byClass.set(r.taskClass,x);}out.priorityDomains=[...byClass.values()].map(x=>({...x,stabilityShare:x.n?x.stable/x.n:0})).sort((a,b)=>(b.n*b.stabilityShare)-(a.n*a.stabilityShare));
 return out;
}
