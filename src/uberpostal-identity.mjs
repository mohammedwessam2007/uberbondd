import crypto from 'node:crypto';

export const UBERPOSTAL_VERSION='uberbond.uberpostal.v1';
const clean=(v,max=2000)=>String(v??'').trim().slice(0,max);
const sha=v=>crypto.createHash('sha256').update(String(v)).digest('hex');

export function compileUberPostalIdentity({legalName='',line1='',line2='',city='',region='',postalCode='',country='',ownerAuthorized=false,evidenceRef='',publicFooterAuthorized=false,now=new Date()}={}){
  const fields={legalName:clean(legalName,240),line1:clean(line1,240),line2:clean(line2,240),city:clean(city,160),region:clean(region,160),postalCode:clean(postalCode,80),country:clean(country,120)};
  const blockers=[];
  if(!fields.legalName) blockers.push('sender-legal-name-required');
  if(!fields.line1) blockers.push('physical-postal-line1-required');
  if(!fields.city) blockers.push('physical-postal-city-required');
  if(!fields.country) blockers.push('physical-postal-country-required');
  if(!ownerAuthorized) blockers.push('founder-address-authorization-required');
  if(!publicFooterAuthorized) blockers.push('public-footer-publication-authorization-required');
  if(!clean(evidenceRef,1000)) blockers.push('postal-address-evidence-reference-required');
  const footer=[fields.legalName,fields.line1,fields.line2,[fields.city,fields.region,fields.postalCode].filter(Boolean).join(', '),fields.country].filter(Boolean).join(' · ');
  const identity={version:UBERPOSTAL_VERSION,...fields,footer,evidenceRef:clean(evidenceRef,1000)||null,ownerAuthorized:ownerAuthorized===true,publicFooterAuthorized:publicFooterAuthorized===true,compiledAt:new Date(now).toISOString()};
  return Object.freeze({ok:blockers.length===0,status:blockers.length?'UBERPOSTAL_WAIT_OWNER_FACT':'UBERPOSTAL_IDENTITY_READY',blockers,identity: blockers.length?null:identity,identityDigest: blockers.length?null:sha(JSON.stringify(identity)),truthBoundary:'UberPostal can compile and bind a real founder-authorized postal identity. It cannot invent, geocode, infer, purchase, or publish an address without the founder supplying and authorizing the exact address.'});
}
