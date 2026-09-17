import { isEmail, normalizeDomain } from './utils.mjs';

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
  const pageEmailRecords = (Array.isArray(crawl.pages) ? crawl.pages : [])
    .flatMap(page => (Array.isArray(page?.emails) ? page.emails : []).map(email => ({ email, sourceUrl: page.url || '' })));
  const fallbackEmailRecords = pageEmailRecords.length
    ? pageEmailRecords
    : (crawl.emails || []).map(email => ({ email, sourceUrl: crawl.startUrl || prospect.website || '' }));
  const publicByEmail = new Map();
  for (const record of fallbackEmailRecords) {
    const email = String(record.email || '').trim().toLowerCase();
    if (isEmail(email) && email.endsWith(`@${domain}`) && !publicByEmail.has(email)) publicByEmail.set(email, record.sourceUrl || '');
  }
  const found = [...publicByEmail.entries()].map(([email, sourceUrl]) => ({
    email, source:'website', sourceUrl, observedAt: crawl.completedAt || '', exact:true, inferred:false,
    personal:!generic.test(email), position:'', confidence:generic.test(email)?45:68, verified:'unverified'
  }));
  if (hunterKey) {
    try {
      const result = await hunter('domain-search',{domain,limit:20},hunterKey);
      for (const x of result.data?.emails || []) found.push({email:x.value,firstName:x.first_name||'',lastName:x.last_name||'',position:x.position||'',source:'hunter',sourceUrl:x.sources?.[0]?.uri||x.sources?.[0]?.url||'',personal:x.type==='personal',confidence:x.confidence||rank(x.value,x.position),verified:x.verification?.status||'unknown',sources:x.sources||[],exact:true,inferred:false});
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
