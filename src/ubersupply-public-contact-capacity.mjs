import crypto from 'node:crypto';

export const UBERSUPPLY_VERSION='uberbond.ubersupply-public-contact-capacity.v1';
const arr=v=>Array.isArray(v)?v:[];
const clean=(v,n=1000)=>String(v??'').trim().slice(0,n);
const lower=v=>clean(v,1000).toLowerCase();
const sha=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const role=/^(info|contact|hello|office|support|sales|marketing|team|enquiries|inquiries|admin)@/i;
const emailOk=v=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v||'').trim());

function contactRows(prospect={}){
  const rows=[];
  const seen=new Set();
  const add=(email,sourceUrl,sourceType='public_website',verification='UNKNOWN')=>{
    const e=lower(email,320);
    if(!emailOk(e)||seen.has(e))return;
    seen.add(e);
    rows.push({email:e,sourceUrl:clean(sourceUrl,1000),sourceType,roleAddress:role.test(e),verification:clean(verification,80).toUpperCase()||'UNKNOWN'});
  };
  if(prospect?.contact?.email)add(prospect.contact.email,prospect.contact.sourceUrl||prospect.sourceUrl||prospect.website,prospect.contact.source||prospect.source||'local',prospect.contact.verified||prospect.contact.verificationStatus);
  for(const c of arr(prospect.contacts))add(c?.email,c?.sourceUrl||prospect.website,c?.source||'public_website',c?.verified||c?.verificationStatus);
  for(const page of arr(prospect?.crawl?.pages))for(const e of arr(page?.emails))add(e,page?.url||prospect.website,'public_website');
  return rows;
}
export function compilePublicContactSupply({
  prospects=[],
  eligibilityByProspect={},
  suppressions=[],
  targetDailyFirstTouches=1000,
  targetBusinessDays=20
}={}){
  const suppressionValues=new Set(arr(suppressions).map(x=>lower(x?.value||x,500)).filter(Boolean));
  const accounts=[];
  const routeSet=new Set();
  let publicExactRoutes=0, genericRoleRoutes=0, personalNamedRoutes=0, verifiedRoutes=0, eligibleRoutes=0, suppressedRoutes=0, contactFormAccounts=0;
  for(const prospect of arr(prospects)){
    const routes=contactRows(prospect);
    const forms=arr(prospect?.crawl?.pages).flatMap(p=>arr(p?.contactForms)).filter(Boolean);
    if(forms.length)contactFormAccounts++;
    let accountEligible=0;
    for(const route of routes){
      if(routeSet.has(route.email))continue;
      routeSet.add(route.email);
      publicExactRoutes++;
      if(route.roleAddress)genericRoleRoutes++; else personalNamedRoutes++;
      const domain=route.email.split('@')[1]||'';
      if(suppressionValues.has(route.email)||suppressionValues.has(domain)){suppressedRoutes++;continue;}
      if(['VALID','VERIFIED','DELIVERABLE'].includes(route.verification))verifiedRoutes++;
      const eligibility=eligibilityByProspect?.[prospect.id];
      if(eligibility?.legal?.status==='PASSED'||eligibility?.sendable===true){eligibleRoutes++;accountEligible++;}
    }
    accounts.push({
      prospectId:clean(prospect.id,240)||null,
      company:clean(prospect.company||prospect.name,180)||null,
      publicExactRouteCount:routes.length,
      genericRoleRouteCount:routes.filter(x=>x.roleAddress).length,
      contactFormCount:forms.length,
      eligibleRouteCount:accountEligible
    });
  }
  const daily=Math.max(1,Math.floor(Number(targetDailyFirstTouches)||1000));
  const days=Math.max(1,Math.floor(Number(targetBusinessDays)||20));
  const monthlyNeed=daily*days;
  const observedEligibleInventory=eligibleRoutes;
  const daysOfTargetInventory=daily?Number((observedEligibleInventory/daily).toFixed(2)):0;
  const coverage=monthlyNeed?Number((observedEligibleInventory/monthlyNeed).toFixed(4)):0;
  const status=observedEligibleInventory>=monthlyNeed?'OBSERVED_MONTH_COVERED':observedEligibleInventory>=daily?'OBSERVED_ONE_DAY_COVERED':'EMPIRICAL_SUPPLY_SHORTFALL';
  const summary={
    prospectAccounts:arr(prospects).length,
    publicExactRoutes,genericRoleRoutes,personalNamedRoutes,verifiedRoutes,eligibleRoutes,suppressedRoutes,
    contactFormAccounts,uniqueRouteCount:routeSet.size,
    targetDailyFirstTouches:daily,targetBusinessDays:days,targetMonthlyFirstTouches:monthlyNeed,
    observedEligibleInventory,daysOfTargetInventory,monthlyCoverageRatio:coverage
  };
  return Object.freeze({
    version:UBERSUPPLY_VERSION,
    status,
    summary,
    accounts,
    supplyDigest:`sha256:${sha(summary)}`,
    paidLeadDataRequired: status==='EMPIRICAL_SUPPLY_SHORTFALL' ? 'UNKNOWN_NOT_PROVEN' : false,
    nextEvidenceNeeded:status==='EMPIRICAL_SUPPLY_SHORTFALL'
      ? 'Harvest a larger lawful public account corpus and measure exact eligible contact yield before buying data.'
      : 'Refresh public-contact and eligibility observations as inventory is consumed.',
    externalEffectAuthority:'NONE',
    providerCalls:0,
    messagesSent:0,
    truthBoundary:'UberSupply measures only exact contact routes already present in supplied public/owner evidence. It never guesses an address, proves mailbox existence from syntax, creates legal eligibility, or guarantees future lead volume.'
  });
}
