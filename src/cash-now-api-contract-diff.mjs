// Cash Now prototype A: deterministic OpenAPI contract change evidence, no network or deployment.
// Input is user-supplied; origin/licensing and commercial demand remain UNVERIFIED.
import crypto from 'node:crypto';
const digest = x => crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const verbs = ['get','post','put','patch','delete','options','head'];
const isObject = x => x && typeof x === 'object' && !Array.isArray(x);
const fail = reason => ({ok:false, status:'ABSTAIN', reason, evidenceClass:'UNVERIFIED_INPUT', findings:[]});
function operations(doc) {
  const result = new Map();
  for (const [path, data] of Object.entries(doc.paths)) {
    if (!path.startsWith('/') || !isObject(data)) continue;
    for (const verb of verbs) if (isObject(data[verb])) result.set(`${verb.toUpperCase()} ${path}`, data[verb]);
  }
  return result;
}
export function diffApiContracts(previous, current) {
  if (![previous,current].every(doc => isObject(doc) && typeof doc.openapi === 'string' && /^3\./.test(doc.openapi) && isObject(doc.paths))) return fail('two OpenAPI 3.x documents with paths are required');
  const before = operations(previous), after = operations(current), findings = [];
  const add = (key,kind,severity,detail) => findings.push({operation:key,kind,severity,detail});
  for (const [key, old] of before) {
    const next = after.get(key);
    if (!next) { add(key,'OPERATION_REMOVED','BREAKING','documented operation no longer exists'); continue; }
    const oldRequired = new Set((old.parameters??[]).filter(p=>isObject(p) && p.required===true).map(p=>`${p.in}:${p.name}`));
    for (const p of (next.parameters??[])) if (isObject(p) && p.required===true && !oldRequired.has(`${p.in}:${p.name}`)) add(key,'NEW_REQUIRED_PARAMETER','POTENTIALLY_BREAKING',`${p.in}:${p.name}`);
    const beforeResponses = new Set(Object.keys(old.responses??{}));
    for (const code of beforeResponses) if (!(code in (next.responses??{}))) add(key,'RESPONSE_REMOVED','POTENTIALLY_BREAKING',code);
    if (!old.requestBody?.required && next.requestBody?.required===true) add(key,'REQUIRED_BODY_ADDED','POTENTIALLY_BREAKING','request body became required');
    if (JSON.stringify(old.security??[]) !== JSON.stringify(next.security??[])) add(key,'SECURITY_DECLARATION_CHANGED','REVIEW','manual authentication compatibility check required');
  }
  for (const key of after.keys()) if (!before.has(key)) add(key,'OPERATION_ADDED','INFORMATIONAL','new documented operation');
  findings.sort((a,b)=>a.operation.localeCompare(b.operation)||a.kind.localeCompare(b.kind));
  return {ok:true,status:'GENERATED_NOT_VALIDATED',previousDigest:digest(previous),currentDigest:digest(current),evidenceClass:'LOCAL_DOCUMENT_COMPARISON_ONLY',findings,summary:{operationsBefore:before.size,operationsAfter:after.size,findings:findings.length},caveat:'Does not verify API behavior, provider identity, original authorship or buyer demand. Do not call a change breaking in production without tests.'};
}
