import crypto from 'node:crypto';

export const ECONOMIC_ROUTE_DEPENDENCY_VERSION='uberbond.economic-route-dependency.v1';
export const REQUIRED_DEPENDENCY_FACTORS=Object.freeze([
  'demandSource','buyerPool','distributionRail','paymentRail','fulfillmentRail','platformDependency','providerDependency'
]);

const text=(v,max=300)=>{const s=String(v??'').trim().toLowerCase();return s&&s.length<=max?s:null;};
const refs=v=>Array.isArray(v)?[...new Set(v.map(x=>String(x??'').trim()).filter(Boolean))]:[];
const digest=v=>`sha256:${crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex')}`;

export function compileEconomicRouteDependencyReceipt({routeId,factors={},factorEvidence={},observedAt=new Date()}={}){
  const id=text(routeId,180);
  const when=observedAt instanceof Date?observedAt:new Date(observedAt);
  const normalized={};
  const evidence={};
  const reasons=[];
  if(!id) reasons.push('route-id-required');
  if(!Number.isFinite(when.getTime())) reasons.push('valid-observation-time-required');
  for(const factor of REQUIRED_DEPENDENCY_FACTORS){
    const value=text(factors?.[factor],240);
    const evidenceRefs=refs(factorEvidence?.[factor]);
    if(!value) reasons.push(`factor-required:${factor}`);
    if(!evidenceRefs.length) reasons.push(`factor-evidence-required:${factor}`);
    normalized[factor]=value;
    evidence[factor]=evidenceRefs;
  }
  if(reasons.length) return {ok:false,status:'ECONOMIC_ROUTE_DEPENDENCY_RECEIPT_REFUSED',reasonCodes:reasons};
  const payload={schemaVersion:ECONOMIC_ROUTE_DEPENDENCY_VERSION,routeId:id,factors:normalized,factorEvidence:evidence,observedAt:when.toISOString(),truthBoundary:'This receipt proves only an evidenced dependency fingerprint. It does not by itself prove statistical independence, demand, execution, settlement, or profit.'};
  return {ok:true,status:'ECONOMIC_ROUTE_DEPENDENCY_RECEIPT_READY',receipt:{...payload,receiptDigest:digest(payload)}};
}

export function validateEconomicRouteDependencyReceipt(receipt,routeId){
  if(!receipt||receipt.schemaVersion!==ECONOMIC_ROUTE_DEPENDENCY_VERSION) return {ok:false,reasonCodes:['dependency-receipt-version-required']};
  if(text(receipt.routeId,180)!==text(routeId,180)) return {ok:false,reasonCodes:['dependency-route-id-mismatch']};
  const payload={schemaVersion:receipt.schemaVersion,routeId:receipt.routeId,factors:receipt.factors,factorEvidence:receipt.factorEvidence,observedAt:receipt.observedAt,truthBoundary:receipt.truthBoundary};
  if(receipt.receiptDigest!==digest(payload)) return {ok:false,reasonCodes:['dependency-receipt-digest-mismatch']};
  for(const factor of REQUIRED_DEPENDENCY_FACTORS){
    if(!text(receipt.factors?.[factor],240)||!refs(receipt.factorEvidence?.[factor]).length) return {ok:false,reasonCodes:[`dependency-factor-invalid:${factor}`]};
  }
  if(!Number.isFinite(Date.parse(receipt.observedAt||''))) return {ok:false,reasonCodes:['dependency-observation-time-invalid']};
  return {ok:true,receipt};
}

export function routesShareCriticalDependency(a,b){
  for(const factor of REQUIRED_DEPENDENCY_FACTORS){
    const av=text(a?.factors?.[factor],240),bv=text(b?.factors?.[factor],240);
    if(av&&bv&&av===bv) return {shared:true,factor,value:av};
  }
  return {shared:false,factor:null,value:null};
}

export function buildEconomicDependencyComponents(routes=[]){
  const n=routes.length;
  const parent=Array.from({length:n},(_,i)=>i);
  const find=i=>parent[i]===i?i:(parent[i]=find(parent[i]));
  const join=(a,b)=>{a=find(a);b=find(b);if(a!==b)parent[b]=a;};
  const sharedEdges=[];
  for(let i=0;i<n;i++) for(let j=i+1;j<n;j++){
    const shared=routesShareCriticalDependency(routes[i].dependencyReceipt,routes[j].dependencyReceipt);
    if(shared.shared){join(i,j);sharedEdges.push({a:routes[i].routeId,b:routes[j].routeId,...shared});}
  }
  const groups=new Map();
  for(let i=0;i<n;i++){
    const root=find(i);
    if(!groups.has(root))groups.set(root,[]);
    groups.get(root).push(routes[i]);
  }
  return {components:[...groups.values()],sharedEdges};
}
