import { clamp, uniq } from './utils.mjs';

const finding=(code,title,severity,confidence,page,excerpt,implication,service,category='Experience',safe=true,evidence=null)=>{
  const evidenceUrl=page?.url||'';
  const evidenceExcerpt=String(excerpt||'').slice(0,320);
  return {
    code,title,severity,confidence:Number(confidence.toFixed(2)),category,
    evidenceUrl,evidenceExcerpt,screenshots:page?.screenshots||{},
    evidence:evidence||{type:'page_observation',url:evidenceUrl,excerpt:evidenceExcerpt},
    implication,service,safeForOutreach:safe
  };
};
const hasRx=(text,rx)=>rx.test(String(text||''));
const firstPage=crawl=>crawl.pages?.[0];

function supportsAbsenceFinding(crawl,page) {
  if (crawl?.quality?.degraded === true || crawl?.renderQuality?.degraded === true) return false;
  if (Array.isArray(crawl?.errors) && crawl.errors.length > 0) return false;
  if (page?.renderQuality?.degraded === true || page?.renderQuality?.reliable === false) return false;
  if (page?.renderQuality?.primaryActionInspection === 'degraded') return false;
  return true;
}

export function deterministicAudit(crawl, prospect={}) {
  const pages=crawl.pages||[]; const home=firstPage(crawl); if(!home) return [];
  const issues=[]; const allText=pages.map(p=>p.bodyText||'').join(' ').toLowerCase();
  const niche=`${prospect.niche||''} ${prospect.industry||''}`.toLowerCase();
  const homepageCopy=[...(home.visibleH1||[]),...(home.headings||[]).slice(0,4).map(x=>x.text)].join(' | ');
  const absenceSupported=supportsAbsenceFinding(crawl,home);

  if(!home.title?.trim()) {
    if(absenceSupported) issues.push(finding('missing-title','Homepage has no document title',4,0.99,home,'The document title is empty or absent.','Search results and browser tabs lose a basic relevance and trust signal.','Website foundation','SEO'));
  } else if(home.title.trim().length<12) issues.push(finding('thin-title','Homepage title is unusually short',2,0.86,home,home.title,'The page may communicate too little context in search results and browser tabs.','Website copy','SEO'));
  if(absenceSupported&&!home.description?.trim()) issues.push(finding('missing-description','Homepage has no meta description',2,0.98,home,'The meta description was not detected.','The business has less control over how the page may be summarized in search results.','Website foundation','SEO'));
  if(absenceSupported&&home.h1Count===0) issues.push(finding('missing-h1','Homepage has no H1 heading',4,0.99,home,'No H1 element was detected.','Visitors and search engines receive a weaker signal about the page’s primary purpose.','Information architecture','SEO'));
  if(home.h1Count>=3) issues.push(finding('excessive-h1','Homepage uses many H1 headings',2,0.96,home,`${home.h1Count} H1 elements were detected.`,'Competing primary headings can make the page structure and central message less clear.','Information architecture','SEO'));
  const noindexDirectives=[
    ...(home.robotsMeta||[]).map(item=>`${item.name}: ${item.content}`),
    home.responseHeaders?.['x-robots-tag']?`x-robots-tag: ${home.responseHeaders['x-robots-tag']}`:''
  ].filter(value=>/\bnoindex\b/i.test(value));
  if(noindexDirectives.length) issues.push(finding(
    'noindex','Homepage explicitly requests no indexing',5,0.99,home,
    noindexDirectives.join(' | '),
    'Search engines that honor this directive may exclude the homepage from their index.',
    'Indexing configuration repair','SEO',true,
    {type:'page_metadata',url:home.url,field:'robots_directive',observedValue:noindexDirectives.join(' | ')}
  ));
  if(home.genericHero) issues.push(finding('generic-hero','Opening message appears generic',4,0.82,home,homepageCopy,'A broad promise can make the business interchangeable with competitors.','Positioning and conversion copy','Positioning'));
  if((home.visibleH1||[]).every(x=>x.length<12) && (home.visibleH1||[]).length) issues.push(finding('thin-hero','Primary headline communicates very little detail',3,0.8,home,(home.visibleH1||[]).join(' | '),'Visitors may not understand the offer, audience, or difference quickly.','Positioning and conversion copy','Positioning'));

  if(!(home.ctas||[]).length) {
    if(absenceSupported) issues.push(finding('no-cta','No obvious primary action was detected',5,0.94,home,'No visible booking, contact, audit, demo, quote, consultation, purchase, application, registration, trial, or start action was detected.','A ready visitor may not know what to do next.','Conversion design','Conversion'));
  } else {
    const above=(home.ctas||[]).filter(x=>x.aboveFold);
    if(!above.length) issues.push(finding('cta-below-fold','Primary actions appear below the opening viewport',4,0.9,home,(home.ctas||[]).slice(0,3).map(x=>x.text||x.href).join(' | '),'High-intent visitors must scroll before finding a clear next step.','Conversion design','Conversion'));
    if((home.ctas||[]).length>=7) issues.push(finding('cta-clutter','The homepage presents many competing action links',3,0.82,home,`${home.ctas.length} CTA-like controls were detected.`,'Too many competing actions can dilute the primary conversion path.','Conversion strategy','Conversion'));
  }

  if(home.mobile?.horizontalOverflow) issues.push(finding('mobile-overflow','The mobile page overflows horizontally',5,0.99,home,`Document width ${home.mobile.document?.width}px exceeds viewport ${home.mobile.viewport?.width}px.`,'Visitors may need to drag sideways or encounter clipped content on phones.','Responsive web design','Mobile'));
  const tinyMobile=(home.mobile?.controls||[]).filter(x=>x.width>0&&x.height>0&&x.width<32&&x.height<32);
  if(tinyMobile.length>=3) issues.push(finding('small-touch-targets','Several mobile controls have clearly small tap areas',3,0.92,home,tinyMobile.slice(0,5).map(x=>`${x.text||x.tag} ${x.width}×${x.height}`).join(' | '),'Very small tap areas can increase friction and accidental taps on phones.','Mobile UX','Mobile'));
  const desktopPrimary=(home.ctas||[]).filter(x=>x.aboveFold);
  const mobilePrimary=(home.mobile?.ctas||[]).filter(x=>x.aboveFold);
  const mobileAbsenceSupported=absenceSupported&&home.mobile?.renderQuality?.degraded!==true&&home.mobile?.renderQuality?.reliable!==false;
  if(mobileAbsenceSupported&&desktopPrimary.length&&mobilePrimary.length===0) issues.push(finding(
    'mobile-primary-action-hidden','The primary action is not available in the initial mobile viewport',4,0.93,home,
    `${desktopPrimary.length} primary action${desktopPrimary.length===1?' was':'s were'} visible in the desktop opening viewport; none were visible in the mobile opening viewport.`,
    'Mobile visitors may need to search or scroll before they can take the main next step.',
    'Mobile conversion path','Mobile'
  ));

  const protocol=(()=>{try{return new URL(home.url).protocol;}catch{return '';}})();
  if(protocol==='http:') issues.push(finding(
    'https-not-enforced','The website remains available without secure HTTPS enforcement',5,0.99,home,
    `Final page URL uses HTTP: ${home.url}`,
    'Information exchanged with this page is not protected by HTTPS in transit.',
    'HTTPS configuration','Trust',true,
    {type:'url_observation',url:home.url,field:'final_protocol',observedValue:'http'}
  ));

  const navigation=home.performance?.navigation;
  const domReadyRaw=Number(navigation?.domContentLoadedEventEnd);
  if(Number.isFinite(domReadyRaw)&&domReadyRaw>=3000){
    const measuredMs=Math.round(domReadyRaw/100)*100;
    issues.push(finding(
      'slow-dom-content-loaded','Laboratory page readiness was slow',3,0.94,home,
      `PerformanceNavigationTiming.domContentLoadedEventEnd was ${measuredMs} ms in the desktop laboratory run.`,
      'A slower initial page readiness observation can delay when visitors begin using the page; real-user performance may differ.',
      'Performance optimization','Performance',true,
      {type:'measurement',url:home.url,metric:'PerformanceNavigationTiming.domContentLoadedEventEnd',value:measuredMs,unit:'ms',context:'laboratory'}
    ));
  }

  const imgs=pages.flatMap(p=>p.images||[]).filter(x=>x.visible);
  const missingAlt=imgs.filter(x=>!x.alt?.trim());
  if(imgs.length>=3&&missingAlt.length/imgs.length>=0.5) issues.push(finding('missing-alt','Most visible images lack descriptive alt text',2,0.98,home,`${missingAlt.length} of ${imgs.length} visible images have empty alt text.`,'This weakens accessibility and removes useful context when images cannot be seen.','Accessibility remediation','Accessibility'));

  const unlabeled=pages.flatMap(p=>(p.forms||[]).flatMap(f=>f.fields||[])).filter(f=>!f.label&&f.type!=='hidden'&&f.type!=='submit');
  if(unlabeled.length>=2) issues.push(finding('unlabeled-form','Form fields appear to lack accessible labels',4,0.94,home,`${unlabeled.length} fields had no label, aria-label, or placeholder.`,'Users and assistive technologies may struggle to understand required inputs.','Form and accessibility redesign','Accessibility'));

  const broken=pages.flatMap(p=>p.brokenLinks||[]);
  if(broken.length) issues.push(finding('broken-links','Broken internal links were detected',5,0.99,home,broken.slice(0,5).map(x=>`${x.url} (${x.status?`HTTP ${x.status}`:'request failed'})`).join(' | '),'Broken paths interrupt trust and can block inquiries or purchases.','Website repair sprint','Technical'));

  const contactSignals=pages.reduce((n,p)=>n+Number(p.contactSignals||0),0);
  if(absenceSupported&&contactSignals===0) issues.push(finding('weak-contact-path','No clear public contact path was detected',5,0.92,home,'No visible email, phone link, contact form, support route, or equivalent contact path was found.','Potential customers may leave when they cannot find a clear way to reach the business.','Lead capture system','Trust'));

  const medical=hasRx(`${niche} ${allText}`,/(clinic|medical|health|hospital|doctor|dent|pharma|therapy|physio)/i);
  if(medical&&!hasRx(allText,/(consultant|specialist|board certified|fellowship|credentials|license|professor|md\b|m\.d\.|دكتور|استشاري|أخصائي)/i)) issues.push(finding('medical-trust','Professional credentials are not prominent in extracted public copy',4,0.74,home,homepageCopy,'Healthcare visitors often need immediate authority and qualification signals before taking action.','Medical trust communication','Trust'));

  const premium=hasRx(`${niche} ${allText}`,/(hotel|resort|luxury|premium|real estate|architect|fashion|jewelry|restaurant|spa)/i);
  if(premium&&home.genericHero) issues.push(finding('premium-positioning','The opening language may undersell a premium offer',4,0.78,home,homepageCopy,'Generic language can make a high-value experience feel ordinary before visitors see the details.','Premium positioning system','Positioning'));

  const gulf=hasRx(`${prospect.country||''} ${allText}`,/(uae|dubai|abu dhabi|saudi|riyadh|jeddah|qatar|doha|kuwait|bahrain|oman)/i);
  const arabic=pages.some(p=>/^ar\b/i.test(p.lang||''))||/[\u0600-\u06ff]{40,}/.test(allText);
  if(gulf&&!arabic) issues.push(finding('arabic-opportunity','No substantial Arabic experience was detected',3,0.72,home,'The crawled pages did not expose an Arabic language version or substantial Arabic copy.','An Arabic journey may expand accessibility and trust for part of the regional audience.','Arabic–English localization','Localization',true));

  if(absenceSupported&&pages.length===1) issues.push(finding('thin-discovery','Only one usable public page was discovered',2,0.6,home,`Crawler completed with ${crawl.errors?.length||0} recorded errors.`,'The public information architecture may be shallow, heavily scripted, or restrictive to automated access.','Information architecture review','Technical',false));

  return issues
    .filter(x=>x.evidenceUrl&&x.evidenceExcerpt)
    .sort((a,b)=>b.severity*b.confidence-a.severity*a.confidence)
    .slice(0,12);
}

export function scoreProspect(prospect,audit,contact) {
  const serious=audit.filter(x=>x.safeForOutreach!==false&&x.confidence>=0.72);
  const impact=serious.reduce((n,x)=>n+x.severity*x.confidence,0);
  const visibleProblem=clamp(Math.round(Math.min(25,impact*2.2)),0,25);
  const serviceFit=clamp(Number(prospect.serviceFit||0)||(serious.length?Math.min(20,12+serious.length):5),0,20);
  const abilityToPay=clamp(Number(prospect.abilityToPay||8),0,15);
  const decisionMaker=clamp(contact?.email?(contact.personal?15:9):3,0,15);
  const evidenceConfidence=clamp(Math.round((serious.slice(0,3).reduce((n,x)=>n+x.confidence,0)/Math.max(1,Math.min(3,serious.length)))*15),0,15);
  const advantageText=`${prospect.niche||''} ${prospect.country||''} ${serious.map(x=>x.service).join(' ')}`;
  const marketAdvantage=clamp(Number(prospect.marketAdvantage||0)||(/medical|scient|arabic|university|hospitality|luxury/i.test(advantageText)?9:6),0,10);
  const total=visibleProblem+serviceFit+abilityToPay+decisionMaker+evidenceConfidence+marketAdvantage;
  return {total,tier:total>=85?'A':total>=70?'B':total>=55?'C':'Reject',breakdown:{visibleProblem,serviceFit,abilityToPay,decisionMaker,evidenceConfidence,marketAdvantage},explanation:[
    `${visibleProblem}/25 visible problem`,`${serviceFit}/20 service fit`,`${abilityToPay}/15 ability to pay`,`${decisionMaker}/15 contact confidence`,`${evidenceConfidence}/15 evidence confidence`,`${marketAdvantage}/10 market advantage`
  ]};
}

export function chooseIssue(audit, minimumConfidence=0.72){
  const parsed=Number(minimumConfidence);
  const threshold=Number.isFinite(parsed)?Math.max(0.65,Math.min(1,parsed)):0.72;
  return audit.find(x=>x.safeForOutreach!==false&&x.evidenceValidation?.valid!==false&&x.confidence>=Math.max(0.8,threshold))
    ||audit.find(x=>x.safeForOutreach!==false&&x.evidenceValidation?.valid!==false&&x.confidence>=threshold)
    ||null;
}
export function capabilitiesFromAudit(audit){return uniq(audit.map(x=>x.service));}
