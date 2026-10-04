// Bounded reuse of an actually observed independent verifier receipt. No
// verifier call, inferred address, sender, campaign, approval or dispatch.
import fs from 'node:fs/promises';
import { importProspects } from './prospect-import.mjs';
import { normalizeContactVerification } from './prospect-evidence-reconciliation.mjs';
import { compileContactHistory, RESULT_STATUS } from './prospect-contact-history.mjs';
import { snapshot, ingestDemandSignal, moneyQueueFromSnapshot } from './revenue-singularity-service.mjs';
const RECORD = 'revenue-observed-powerhouse-20261004';
const ROOT = new URL('../artifacts/outreach/', import.meta.url);
export async function runObservedRevenueFuel({store, config, fetchFn = fetch, now = Date.now()} = {}) {
  const receipt = JSON.parse(await fs.readFile(new URL('clearbounce-powerhouse-20261004.json', ROOT), 'utf8'));
  const refusal = reason => ({ok:false, state:reason, outboundAuthority:'NONE', messages:0, spendCents:0});
  if (!Number.isFinite(Date.parse(receipt.checkedAt)) || !Number.isFinite(Date.parse(receipt.expiresAt))) return refusal('INDEPENDENT_VERIFIER_RECEIPT_UNDATED');
  if (receipt.provider !== 'ClearBounce' || receipt.state !== 'VALID' || receipt.mailboxExists !== true || Date.parse(receipt.checkedAt) > now + 60000 || Date.parse(receipt.expiresAt) <= now) return refusal('INDEPENDENT_VERIFIER_RECEIPT_NOT_CURRENT');
  // Pages are data, never commands. Only exact literal observations are used.
  const urls = ['https://mypowerhouse.group/', 'https://mypowerhouse.group/contact/', 'https://mypowerhouse.group/event/webinar-servicetitan-field-mobile-app-advanced-features/', 'https://sylvesterelectric.com/'];
  const pages = [];
  for (const url of urls) {
    const r = await fetchFn(url, {signal:AbortSignal.timeout(10000)});
    if (!r.ok || new URL(r.url || url).hostname !== new URL(url).hostname) return refusal('FIRST_PARTY_SOURCE_FETCH_REFUSED');
    const body = await r.text(); if (body.length > 2000000) return refusal('SOURCE_TOO_LARGE');
    pages.push(body.replace(/<[^>]*>/g,' ').replace(/&nbsp;/g,' ').replace(/\s+/g,' '));
  }
  if (!pages[0].includes('Sylvester Electric') || !pages[1].includes('want to partner with us') || !pages[2].includes(receipt.route) || !/during business hours and for qualifying after[- ]hours situations/i.test(pages[3]) || !pages[3].includes('24/7 Emergency Service')) return refusal('OBSERVED_SOURCE_FACTS_CHANGED');
  const before = await snapshot(store,now);
  const history = compileContactHistory({email:receipt.route, reads:before.contactHistoryReads,now:new Date(now)});
  if (history.status !== RESULT_STATUS.CLEAN) return {...refusal('CURRENT_CONTACT_HISTORY_REFUSED'), historyState:history.status, reasonCodes:history.reasonCodes};
  let p = before.prospects.find(p=>p.sourceRecordId===RECORD);
  if (!p && before.prospects.some(p=>p.domain==='mypowerhouse.group')) return refusal('EXISTING_PROSPECT_LINEAGE_COLLISION');
  const observedAt = new Date(now).toISOString();
  if (!p) {
    const imported = await importProspects(store,config,[{
      company:'Powerhouse Consulting Group',website:urls[0],niche:'Home-service software consultancy marketing operations client QA',serviceFit:.85,source:'public_website',sourceUrl:urls[0],sourceRecordId:RECORD,
      sourceMetadata:{observedAt, fitBasis:'Public trades/FSM consultancy, public named client and client-facing service wording inconsistency; commercial value remains a hypothesis.'},
      contact:{email:receipt.route,name:'Powerhouse general business contact',title:'General business and partnership contact',source:'public_website',sourceUrl:urls[2],observedAt,exact:true,inferred:false},
      issue:{title:'Publicly named client emergency-availability wording differs on the same page',code:'same-page-public-service-promise-inconsistency',evidenceUrl:urls[3],evidenceExcerpt:'Emergency service available during business hours and for qualifying after hours situations. Service list separately advertises 24/7 Emergency Service.',evidenceObservedAt:observedAt,confidence:.9,safeForOutreach:false}
    }]); p=imported.added[0]; if (!p) return refusal('CANONICAL_IMPORT_REFUSED');
  }
  const reviewed = JSON.parse(await fs.readFile(new URL('powerhouse-preflight-request-20261002.json', ROOT),'utf8')).request.body;
  // Preserve original source dates/notice provenance; only facts actually rechecked
  // above get a new observation time. No owner identity/consent is filled.
  reviewed.record.recipient.observedAt = observedAt;
  reviewed.record.clientEvidence.observation.observedAt = observedAt;
  reviewed.record.clientEvidence.observation.excerpt = 'during business hours and for qualifying after-hours situations / 24/7 Emergency Service (same current page)';
  reviewed.slots.corroborationSentence = '';
  reviewed.slots.groundingPhrases = ['during business hours', 'qualifying after-hours situations', '24/7 Emergency Service'];
  await store.patch('prospects',p.id,{preflightRecord:reviewed.record,messageSlots:reviewed.slots,preworkArtifactRef:reviewed.artifactRef,contact:{...p.contact, verifications:[normalizeContactVerification(receipt,{now:new Date(now)})]}});
  await ingestDemandSignal(store,{prospectId:p.id,kind:'observed_defect',observedAt,evidenceRef:urls[3],now});
  const current = await snapshot(store,now); const queue = moneyQueueFromSnapshot(current);
  const ranked = queue.items.find(i=>i.prospectId===p.id); const excluded=queue.excluded.find(i=>i.prospectId===p.id);
  const out={ok:true,state:ranked?'REAL_VERIFIED_OPPORTUNITY_RANKED':'REAL_VERIFIED_OPPORTUNITY_EXCLUDED',prospectId:p.id,sourceRecordId:RECORD,historyState:history.status,rank:ranked?.rank??null,offerId:ranked?.offerId??null,exclusionReasons:excluded?.reasons||[],verificationProvider:receipt.provider,verificationCheckedAt:receipt.checkedAt,sourceRecheckedAt:observedAt,outboundAuthority:'NONE',messages:0,spendCents:0};
  await store.log('revenue_observed_fuel',out); return out;
}
