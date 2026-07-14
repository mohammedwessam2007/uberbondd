import { isEmail, normalizeDomain, uniq } from './utils.mjs';

const generic = /^(info|contact|hello|admin|office|support|sales|marketing|team|enquiries|inquiries)@/i;
function rank(email, position='') {
  let score = generic.test(email) ? 35 : 60;
  if (/owner|founder|chief|director|partner|marketing|manager|doctor|consultant|professor/i.test(position)) score += 25;
  if (/noreply|no-reply|privacy|abuse|webmaster/i.test(email)) score = 0;
  return Math.min(100, score);
}
async function hunter(path, params, key) {
  const url = new URL(`https://api.hunter.io/v2/${path}`);
  for (const [k,v] of Object.entries(params)) if (v !== undefined && v !== '') url.searchParams.set(k, v);
  const res = await fetch(url, {headers:{'X-API-KEY':key}});
  if (!res.ok) throw new Error(`Hunter ${res.status}: ${await res.text()}`);
  return res.json();
}
export async function discoverContacts(prospect, crawl, hunterKey='') {
  const domain = normalizeDomain(prospect.website || crawl.startUrl);
  const found = uniq(crawl.emails || []).filter(isEmail).filter(e => e.endsWith(`@${domain}`)).map(email => ({email,source:'website',personal:!generic.test(email),position:'',confidence:generic.test(email)?45:68,verified:'unverified'}));
  if (hunterKey) {
    try {
      const result = await hunter('domain-search',{domain,limit:20},hunterKey);
      for (const x of result.data?.emails || []) found.push({email:x.value,firstName:x.first_name||'',lastName:x.last_name||'',position:x.position||'',source:'hunter',personal:x.type==='personal',confidence:x.confidence||rank(x.value,x.position),verified:x.verification?.status||'unknown',sources:x.sources||[]});
    } catch (error) { found.push({error:error.message,source:'hunter'}); }
  }
  const valid = found.filter(x => x.email && isEmail(x.email));
  valid.sort((a,b) => (rank(b.email,b.position)+Number(b.confidence||0))-(rank(a.email,a.position)+Number(a.confidence||0)));
  return {domain, candidates: valid, selected: valid[0] || null};
}
export async function verifyEmail(email, hunterKey='') {
  if (!hunterKey || !isEmail(email)) return {email,status:'unverified',score:0};
  const result = await hunter('email-verifier',{email},hunterKey);
  return result.data || {email,status:'unknown',score:0};
}
