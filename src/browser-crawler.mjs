import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { chromium } from 'playwright';
import { getRobots, isAllowed } from './robots.mjs';
import { normalizeDomain, sleep, uniq } from './utils.mjs';
import {
  assertPublicIpAddress,
  assertPublicUrl,
  chromiumHostResolverRules,
  resolvePublicUrl
} from './security.mjs';
import { crawlErrorRecord } from './qualification.mjs';

const PRIORITY = /(about|team|contact|services?|pricing|book|appointment|reserve|research|doctor|clinic|portfolio|work|case)/i;
const SKIP = /\.(pdf|jpe?g|png|gif|svg|webp|zip|docx?|xlsx?|pptx?|mp4|mp3)(\?|$)/i;
const CTA = /\b(book(?:ing)?|schedule|contact|buy|purchase|order|checkout|start|begin|run|app(?:ly|lication)|request|reserve|call|whatsapp|appointment|audit|demo|quote|consult(?:ation)?|enquir(?:e|y)|inquir(?:e|y)|shop|registr(?:ation|er)|sign\s*up|subscribe|join|try|trial|send)\b/i;
const CONTACT = /(contact|support|help|customer service|get in touch|enquir|inquir|request a quote|book|schedule|appointment|demo)/i;

const slug = value => String(value).toLowerCase().replace(/^https?:\/\//,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,90) || crypto.randomUUID();

function scoreLink(url, text='') {
  let score=0; const hay=`${url} ${text}`;
  if(PRIORITY.test(hay)) score+=10;
  if(/contact|book|appointment|reserve|pricing/i.test(hay)) score+=5;
  if(/privacy|terms|cookie|login|signin|cart|tag|author|feed/i.test(hay)) score-=10;
  return score;
}

function normalizeHeaders(headers = {}) {
  if (headers && typeof headers.entries === 'function') return Object.fromEntries([...headers.entries()].map(([key, value]) => [String(key).toLowerCase(), String(value)]));
  return Object.fromEntries(Object.entries(headers || {}).map(([key, value]) => [String(key).toLowerCase(), String(value)]));
}

async function pageSnapshot(page) {
  return page.evaluate(({CTA_SOURCE,CONTACT_SOURCE}) => {
    const visible = el => {
      if (!el || !el.isConnected || el.closest?.('template')) return false;
      if (el.closest?.('[hidden],[aria-hidden="true"],[inert]')) return false;
      if (el.matches?.(':disabled,[disabled],[aria-disabled="true"]') || ('disabled' in el && el.disabled)) return false;
      for(let current=el;current;current=current.parentElement){
        const style=getComputedStyle(current);
        if(style.display==='none'||style.visibility==='hidden'||style.visibility==='collapse'||Number(style.opacity)===0)return false;
      }
      const r=el.getBoundingClientRect();
      return r.width>2&&r.height>2&&el.getClientRects().length>0;
    };
    const text = el => (el.innerText||el.textContent||'').replace(/\s+/g,' ').trim();
    const labelledByText = el => String(el.getAttribute?.('aria-labelledby')||'')
      .split(/\s+/)
      .filter(Boolean)
      .map(id=>document.getElementById(id))
      .filter(Boolean)
      .map(text)
      .filter(Boolean)
      .join(' ');
    const accessibleName = el => {
      const tag=el.tagName?.toLowerCase()||'';
      const type=String(el.getAttribute?.('type')||'').toLowerCase();
      const inputName=tag==='input'&&['submit','button','image'].includes(type)
        ? (el.value||el.getAttribute('alt')||'')
        : '';
      return (labelledByText(el)||el.getAttribute?.('aria-label')||inputName||text(el)||el.getAttribute?.('title')||'')
        .replace(/\s+/g,' ')
        .trim()
        .slice(0,180);
    };
    const links=[...document.querySelectorAll('a[href]')].map(a=>({url:a.href,text:text(a).slice(0,180),visible:visible(a)})).filter(x=>x.url);
    const headings=[...document.querySelectorAll('h1,h2,h3')].filter(visible).map(h=>({level:h.tagName.toLowerCase(),text:text(h).slice(0,300)})).filter(x=>x.text).slice(0,60);
    const imgs=[...document.images].map(img=>({src:img.currentSrc||img.src,alt:img.getAttribute('alt')||'',width:img.naturalWidth,height:img.naturalHeight,visible:visible(img)})).slice(0,120);
    const ctaRx=new RegExp(CTA_SOURCE,'i');
    const allForms=[...document.forms];
    const controls=[...document.querySelectorAll('a[href],button,input[type=submit],input[type=image],[role=button],[role=link]')]
      .filter(visible)
      .map(el=>{
        const r=el.getBoundingClientRect();
        const tag=el.tagName.toLowerCase();
        const type=String(el.getAttribute('type')||'').toLowerCase();
        const form=el.form||el.closest?.('form')||null;
        const functionalSubmit=Boolean(form)&&(
          (tag==='button'&&(!type||type==='submit'))||
          (tag==='input'&&['submit','image'].includes(type))
        );
        const name=accessibleName(el);
        const href=el.href||'';
        const formAction=form?.action||'';
        const role=String(el.getAttribute('role')||'').toLowerCase();
        return {
          tag,type,role,text:text(el).slice(0,180),accessibleName:name,href,
          formAction,formMethod:form?.method||'',formIndex:form?allForms.indexOf(form):-1,
          functionalSubmit,actionLanguage:ctaRx.test(`${name} ${text(el)} ${href} ${formAction}`),
          x:Math.round(r.x),y:Math.round(r.y),width:Math.round(r.width),height:Math.round(r.height),
          aboveFold:r.top>=0&&r.top<window.innerHeight
        };
      })
      .filter(x=>x.accessibleName||x.href||x.functionalSubmit)
      .slice(0,100);
    const ctas=controls.filter(x=>x.actionLanguage||x.functionalSubmit);
    const ctaEvidence=ctas.map(control=>({
      type:'visible_action',
      controlType:control.functionalSubmit?'form_submit':control.tag==='a'?'action_link':control.role||control.tag,
      accessibleName:control.accessibleName,
      destination:control.href||'',
      formAction:control.formAction||'',
      formMethod:control.formMethod||'',
      aboveFold:control.aboveFold,
      x:control.x,
      y:control.y,
      width:control.width,
      height:control.height
    }));
    const forms=allForms.map((form,index)=>{
      const fields=[...form.querySelectorAll('input,select,textarea')].map(el=>({
        name:el.name,type:el.type,
        label:el.labels?.[0]?.innerText?.trim()||el.getAttribute('aria-label')||el.getAttribute('placeholder')||'',
        visible:visible(el)
      }));
      return {
        action:form.action,method:form.method,text:text(form).slice(0,500),fields,
        visible:visible(form),
        functionalSubmit:controls.some(control=>control.formIndex===index&&control.functionalSubmit)
      };
    });
    const bodyText=(document.body?.innerText||'').replace(/\s+/g,' ').trim().slice(0,70000);
    const readyState=document.readyState;
    const bodyPresent=Boolean(document.body);
    const visibleElementCount=bodyPresent
      ? [document.body,...document.body.querySelectorAll('*')].filter(visible).length
      : 0;
    const renderQualityReasons=[];
    if(!bodyPresent)renderQualityReasons.push('body_missing');
    if(readyState==='loading')renderQualityReasons.push('document_still_loading');
    if(bodyPresent&&document.body.childElementCount>0&&visibleElementCount===0)renderQualityReasons.push('all_content_non_rendered');
    const renderQuality={
      reliable:renderQualityReasons.length===0,
      degraded:renderQualityReasons.length>0,
      reasons:renderQualityReasons,
      readyState,
      bodyPresent,
      bodyTextLength:bodyText.length,
      visibleElementCount,
      controlsInspected:controls.length,
      primaryActionInspection:renderQualityReasons.length?'degraded':'complete'
    };
    const docWidth=Math.max(document.documentElement.scrollWidth,document.body?.scrollWidth||0);
    const viewportWidth=window.innerWidth;
    const genericHero=/\b(welcome|innovative solutions|quality service|your trusted partner|excellence|we are passionate|transforming possibilities|where excellence meets)\b/i.test((document.querySelector('h1')?.innerText||'')+' '+(document.querySelector('main p,header p')?.innerText||''));
    const emailPattern=/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
    const normalizeEmail=value=>{
      let raw=String(value||'').trim();
      if(/^mailto:/i.test(raw))raw=raw.replace(/^mailto:/i,'').split('?')[0];
      try{raw=decodeURIComponent(raw)}catch{}
      return (raw.match(emailPattern)||[])[0]?.toLowerCase()||'';
    };
    const emailExcerpt=(value,email)=>{
      const normalized=String(value||'').replace(/\s+/g,' ').trim();
      const index=normalized.toLowerCase().indexOf(email.toLowerCase());
      if(index<0)return email;
      const start=Math.max(0,index-120),end=Math.min(normalized.length,index+email.length+120);
      return `${start>0?'…':''}${normalized.slice(start,end)}${end<normalized.length?'…':''}`.slice(0,360);
    };
    const pageContext=(el=null)=>{
      if(el?.closest?.('header'))return 'header';
      if(el?.closest?.('footer'))return 'footer';
      if(el?.closest?.('address'))return 'address';
      if(/contact|reach|enquir|inquir|appointment|book/i.test(location.pathname))return 'contact_page';
      if(/team|people|staff|doctor|dentist|leadership|about/i.test(location.pathname))return 'team_page';
      return 'page';
    };
    const emailEvidence=[];
    const mailtoLinks=links.filter(x=>x.url.startsWith('mailto:')&&x.visible);
    for(const link of mailtoLinks){
      const email=normalizeEmail(link.url);if(!email)continue;
      const anchor=[...document.querySelectorAll('a[href^="mailto:"]')].find(item=>item.href===link.url&&visible(item));
      const surrounding=anchor?text(anchor.closest('address,li,p,div,header,footer')||anchor):link.text;
      emailEvidence.push({email,sourceUrl:location.href,sourceType:'mailto',extractionMethod:'mailto',evidenceExcerpt:emailExcerpt(`${surrounding} ${email}`,email),context:pageContext(anchor),published:true});
    }
    if(document.body){
      const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
      let node,inspected=0;
      while((node=walker.nextNode())&&inspected<12000&&emailEvidence.length<60){
        inspected+=1;
        const parent=node.parentElement;
        if(!parent||!visible(parent)||/^(?:script|style|template|noscript)$/i.test(parent.tagName))continue;
        for(const match of String(node.nodeValue||'').match(emailPattern)||[]){
          const email=normalizeEmail(match);if(!email)continue;
          const surrounding=text(parent.closest('address,li,p,div,header,footer')||parent);
          emailEvidence.push({email,sourceUrl:location.href,sourceType:'visible_text',extractionMethod:'visible_text',evidenceExcerpt:emailExcerpt(surrounding,email),context:pageContext(parent),published:true});
        }
      }
    }
    const structuredIdentity=(node,inherited={})=>({
      name:typeof node?.name==='string'?node.name:inherited.name||'',
      firstName:typeof node?.givenName==='string'?node.givenName:inherited.firstName||'',
      lastName:typeof node?.familyName==='string'?node.familyName:inherited.lastName||'',
      position:typeof node?.jobTitle==='string'?node.jobTitle:inherited.position||''
    });
    const addStructuredEmails=(node,inherited={},seen=new Set())=>{
      if(!node||typeof node!=='object'||seen.has(node)||emailEvidence.length>=60)return;
      seen.add(node);
      if(Array.isArray(node)){for(const item of node)addStructuredEmails(item,inherited,seen);return;}
      const identity=structuredIdentity(node,inherited);
      const values=Array.isArray(node.email)?node.email:node.email?[node.email]:[];
      for(const value of values){
        const email=normalizeEmail(value);if(!email)continue;
        const excerpt=[identity.name||[identity.firstName,identity.lastName].filter(Boolean).join(' '),identity.position,email].filter(Boolean).join(' — ').slice(0,360);
        emailEvidence.push({email,sourceUrl:location.href,sourceType:'structured_data',extractionMethod:'structured_data',evidenceExcerpt:excerpt,context:'structured_data',published:true,...identity});
      }
      for(const child of Object.values(node))addStructuredEmails(child,identity,seen);
    };
    const phoneLinks=links.filter(x=>x.url.startsWith('tel:'));
    const whatsappLinks=links.filter(x=>/wa\.me|whatsapp/i.test(x.url));
    const contactRx=new RegExp(CONTACT_SOURCE,'i');
    const contactLinks=links.filter(x=>x.visible&&/^https?:/i.test(x.url)&&contactRx.test(`${x.text} ${x.url}`));
    const contactForms=forms.filter(form=>contactRx.test(`${form.action} ${form.text} ${(form.fields||[]).map(field=>`${field.name} ${field.type} ${field.label}`).join(' ')}`));
    const socialLinks=links.filter(x=>/linkedin|instagram|facebook|threads\.net|x\.com|twitter|youtube|tiktok/i.test(x.url));
    const jsonLd=[...document.querySelectorAll('script[type="application/ld+json"]')].map(x=>x.textContent).filter(Boolean).slice(0,10);
    for(const raw of jsonLd){try{addStructuredEmails(JSON.parse(raw))}catch{}}
    const uniqueEmailEvidence=[...new Map(emailEvidence.map(item=>[`${item.email}\n${item.sourceType}\n${item.evidenceExcerpt}`,item])).values()].slice(0,60);
    const emails=uniqLocal(uniqueEmailEvidence.map(item=>item.email)).slice(0,40);
    const robotsMeta=[...document.querySelectorAll('meta[name]')]
      .filter(meta=>/^(robots|googlebot|bingbot)$/i.test(meta.getAttribute('name')||''))
      .map(meta=>({name:(meta.getAttribute('name')||'').toLowerCase(),content:(meta.getAttribute('content')||'').trim().slice(0,500)}))
      .filter(item=>item.content);
    return {
      title:document.title||'',description:document.querySelector('meta[name="description"]')?.content||'',lang:document.documentElement.lang||'',
      headings,links,images:imgs,controls,ctas,ctaEvidence,forms,bodyText,emails,emailEvidence:uniqueEmailEvidence,mailtoLinks,phoneLinks,whatsappLinks,contactLinks,contactForms,socialLinks,jsonLd,robotsMeta,renderQuality,
      h1Count:document.querySelectorAll('h1').length,visibleH1:[...document.querySelectorAll('h1')].filter(visible).map(text),
      viewport:{width:viewportWidth,height:window.innerHeight},document:{width:docWidth,height:Math.max(document.documentElement.scrollHeight,document.body?.scrollHeight||0)},
      horizontalOverflow:docWidth>viewportWidth+4,genericHero,
      contactSignals:emails.length+mailtoLinks.length+phoneLinks.length+whatsappLinks.length+contactLinks.length+contactForms.length,
      performance:{navigation:performance.getEntriesByType('navigation')[0]?.toJSON?.()||null,resources:performance.getEntriesByType('resource').length}
    };
    function uniqLocal(a){return [...new Set(a.map(x=>String(x).toLowerCase()))]}
  }, {CTA_SOURCE:CTA.source,CONTACT_SOURCE:CONTACT.source});
}

async function checkBrokenLinks(links, origin, fetcher, max=12, allowLocal=false) {
  const targets=uniq(links.filter(x=>{try{const u=new URL(x.url);return u.origin===origin&&!SKIP.test(u.pathname);}catch{return false;}}).map(x=>x.url)).slice(0,max);
  const results=[];
  for(const url of targets){
    try{
      await assertPublicUrl(url,{allowLocal});
      const res=await fetcher(url);
      if(res.status>=400) results.push({url,status:res.status});
    }catch(error){results.push({url,error:error.message});}
  }
  return results;
}

export async function crawlSiteBrowser(input, options={}) {
  const allowLocal=Boolean(options.allowLocal);
  const resolvedStart=await resolvePublicUrl(input,{allowLocal});
  const start=resolvedStart.url.href;
  let origin=new URL(start).origin;
  const domain=normalizeDomain(start);
  const maxPages=Math.max(1,Math.min(12,Number(options.maxPages||5)));
  const delayMs=Math.max(0,Number(options.delayMs||500));
  const timeoutMs=Math.max(5000,Number(options.timeoutMs||25000));
  const htmlFetcher=options.htmlFetcher||null;
  const onProgress=typeof options.onProgress==='function'?options.onProgress:null;
  const emittedProgress=new Set();
  const emitProgress=async stage=>{
    if(!onProgress||emittedProgress.has(stage))return;
    emittedProgress.add(stage);
    await onProgress(stage);
  };
  const screenshotDir=path.resolve(options.screenshotDir||'./data/screenshots');
  await fs.mkdir(screenshotDir,{recursive:true});
  const startHost=resolvedStart.url.hostname.toLowerCase();
  const pinEntries=[];
  const allowedHosts=new Set([startHost]);
  const addResolvedHost=(hostname,resolved)=>{
    const selected=resolved.addresses.find(item=>item.family===4)||resolved.addresses[0];
    if(selected)pinEntries.push({hostname,address:selected.address});
  };
  if(!allowLocal){
    addResolvedHost(startHost,resolvedStart);
    const counterpart=startHost.startsWith('www.')?domain:`www.${domain}`;
    if(counterpart!==startHost){
      try{
        const resolved=await resolvePublicUrl(`${resolvedStart.url.protocol}//${counterpart}`,{allowLocal:false});
        allowedHosts.add(counterpart);
        addResolvedHost(counterpart,resolved);
      }catch{}
    }
  }
  let executablePath=options.executablePath||process.env.CHROMIUM_PATH||'';
  if(executablePath){try{await fs.access(executablePath);}catch{executablePath='';}}
  const launchArgs=['--no-sandbox','--disable-dev-shm-usage'];
  if(allowLocal)launchArgs.push('--disable-web-security','--disable-features=BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessSendPreflights');
  else{
    const resolverRules=chromiumHostResolverRules(pinEntries);
    if(!resolverRules)throw new Error('No public DNS address was available for browser pinning');
    launchArgs.push(`--host-resolver-rules=${resolverRules}`);
  }
  await emitProgress('loading_website');
  const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{}),args:launchArgs});
  const context=await browser.newContext({viewport:{width:1440,height:900},userAgent:'UberBondNightshift/1.0 (+public website quality research)'});
  let blockedCrossDomainRequests=0;
  await context.route('**/*', async route=>{
    const req=route.request();
    const url=req.url();
    if(!/^https?:/i.test(url)) return route.continue();
    try{
      const host=new URL(url).hostname;
      if(!allowLocal&&!allowedHosts.has(host.toLowerCase())){
        blockedCrossDomainRequests+=1;
        return route.abort('blockedbyclient');
      }
      await assertPublicUrl(url,{allowLocal});
      return route.continue();
    }catch{return route.abort('blockedbyclient');}
  });
  const browserFetch=async url=>{
    const page=await context.newPage();
    try{
      const response=await page.goto(url,{waitUntil:'commit',timeout:timeoutMs});
      if(!response)return{ok:false,status:0,text:async()=>''};
      const server=await response.serverAddr();
      assertPublicIpAddress(server?.ipAddress,{allowLocal});
      const body=await response.text().catch(()=> '');
      return{ok:response.ok(),status:response.status(),text:async()=>body};
    }finally{await page.close();}
  };
  const robots=await getRobots(start,browserFetch,{allowLocal});
  const queue=[{url:start,depth:0,score:100}]; const seen=new Set(); const pages=[]; const errors=[];
  try{
    while(queue.length&&pages.length<maxPages){
      queue.sort((a,b)=>b.score-a.score); const item=queue.shift(); if(!item||seen.has(item.url)) continue;
      seen.add(item.url); if(!isAllowed(item.url,robots)) {errors.push(crawlErrorRecord({category:'robots_disallowed',retryable:false,error:'blocked_by_robots'},{url:item.url}));continue;}
      const page=await context.newPage();
      try{
        let finalUrl=item.url,status=200,responseHeaders={};
        if(htmlFetcher){
          const fetched=await htmlFetcher(item.url);
          finalUrl=fetched?.finalUrl||item.url; status=Number(fetched?.status||200);
          responseHeaders=normalizeHeaders(fetched?.headers||{});
          if(status>=400){errors.push(crawlErrorRecord({status},{url:item.url,status}));continue;}
          const raw=String(fetched?.html||'');
          const withBase=/<head[\s>]/i.test(raw)?raw.replace(/<head([^>]*)>/i,`<head$1><base href="${finalUrl}">`):`<base href="${finalUrl}">${raw}`;
          await page.setContent(withBase,{waitUntil:'domcontentloaded',timeout:timeoutMs});
        } else {
          const response=await page.goto(item.url,{waitUntil:'domcontentloaded',timeout:timeoutMs});
          const server=await response?.serverAddr();
          assertPublicIpAddress(server?.ipAddress,{allowLocal});
          finalUrl=page.url(); status=response?.status()||0;
          responseHeaders=normalizeHeaders(response?.allHeaders?await response.allHeaders():response?.headers?.()||{});
          if(status>=400){errors.push(crawlErrorRecord({status},{url:item.url,status}));continue;}
        }
        await page.waitForTimeout(Math.min(1500,Math.max(250,delayMs)));
        await assertPublicUrl(finalUrl,{allowLocal});
        if(normalizeDomain(finalUrl)!==domain){errors.push(crawlErrorRecord({category:'cross_domain_redirect',retryable:false,error:'cross_site_redirect'},{url:item.url,finalUrl}));continue;}
        if(pages.length===0)origin=new URL(finalUrl).origin;
        else if(new URL(finalUrl).origin!==origin){errors.push(crawlErrorRecord({category:'cross_domain_redirect',retryable:false,error:'cross_origin_redirect'},{url:item.url,finalUrl}));continue;}
        await emitProgress('testing_desktop_experience');
        const data=await pageSnapshot(page);
        const pageId=`${slug(domain)}-${pages.length+1}-${crypto.createHash('sha1').update(finalUrl).digest('hex').slice(0,8)}`;
        const desktopName=`${pageId}-desktop.png`;
        await page.screenshot({path:path.join(screenshotDir,desktopName),fullPage:true,animations:'disabled'});
        const mobile=await context.newPage();
        await mobile.setViewportSize({width:390,height:844});
        await emitProgress('testing_mobile_experience');
        if(htmlFetcher){
          const fetched=await htmlFetcher(finalUrl);
          const raw=String(fetched?.html||'');
          const withBase=/<head[\s>]/i.test(raw)?raw.replace(/<head([^>]*)>/i,`<head$1><base href="${finalUrl}">`):`<base href="${finalUrl}">${raw}`;
          await mobile.setContent(withBase,{waitUntil:'domcontentloaded',timeout:timeoutMs});
        } else {
          const mobileResponse=await mobile.goto(finalUrl,{waitUntil:'domcontentloaded',timeout:timeoutMs});
          const mobileServer=await mobileResponse?.serverAddr();
          assertPublicIpAddress(mobileServer?.ipAddress,{allowLocal});
        }
        await mobile.waitForTimeout(Math.min(1200,Math.max(200,delayMs)));
        const mobileData=await pageSnapshot(mobile);
        const mobileName=`${pageId}-mobile.png`;
        await mobile.screenshot({path:path.join(screenshotDir,mobileName),fullPage:true,animations:'disabled'});
        await mobile.close();
        await emitProgress('checking_links_and_conversion_paths');
        const brokenLinks=pages.length===0?await checkBrokenLinks(data.links,origin,browserFetch,12,allowLocal):[];
        const record={url:finalUrl,requestedUrl:item.url,status,responseHeaders,depth:item.depth,redirected:finalUrl!==item.url,...data,mobile:mobileData,brokenLinks,screenshots:{desktop:`/screenshots/${desktopName}`,mobile:`/screenshots/${mobileName}`}};
        pages.push(record);
        for(const link of data.links){
          try{
            const u=new URL(link.url);u.hash='';
            if(u.origin!==origin||seen.has(u.href)||SKIP.test(u.pathname)||item.depth>=2) continue;
            queue.push({url:u.href,depth:item.depth+1,score:scoreLink(u.href,link.text)-item.depth});
          }catch{}
        }
      }catch(error){errors.push(crawlErrorRecord(error,{url:item.url}));}
      finally{await page.close();}
      await sleep(Math.max(delayMs,(robots.crawlDelay||0)*1000));
    }
  } finally { await context.close(); await browser.close(); }
  const renderQualityReasons=uniq(pages.flatMap(page=>[
    ...(page.renderQuality?.reasons||[]),
    ...(page.mobile?.renderQuality?.reasons||[]).map(reason=>`mobile_${reason}`)
  ]));
  const qualityReasons=uniq([
    ...(pages.length?[]:['no_usable_pages']),
    ...(errors.length?['crawl_errors_recorded']:[]),
    ...(blockedCrossDomainRequests?['cross_domain_resources_blocked']:[]),
    ...renderQualityReasons
  ]);
  const failureCategories=Object.fromEntries(Object.entries(errors.reduce((summary,error)=>{
    const category=error.category||'crawl_failure';
    summary[category]=(summary[category]||0)+1;
    return summary;
  },{})).sort(([a],[b])=>a.localeCompare(b)));
  return {
    startUrl:start,domain,robots,pages,errors,
    quality:{degraded:qualityReasons.length>0,reasons:qualityReasons,failureCategories},
    publicAccess:{robotsChecked:robots.checked===true,robotsPolicyAvailable:robots.policyAvailable===true,robotsStatus:Number(robots.status||0),robotsCrawlDelaySeconds:Number(robots.crawlDelay||0),ssrfGuard:'dns-pinned-public-network-only',blockedCrossDomainRequests},
    emails:uniq(pages.flatMap(p=>p.emails)),
    contactEvidence:pages.flatMap(page=>(page.emailEvidence||[]).map(item=>({ ...item, sourceUrl:item.sourceUrl||page.url }))),
    combinedText:pages.map(p=>`[${p.url}]\n${p.title}\n${(p.headings||[]).map(h=>h.text).join(' | ')}\n${p.bodyText||''}`).join('\n\n').slice(0,120000),
    completedAt:new Date().toISOString(),engine:'playwright',
    summary:{pagesVisited:pages.length,errors:errors.length,desktopScreenshots:pages.filter(p=>p.screenshots?.desktop).length,mobileScreenshots:pages.filter(p=>p.screenshots?.mobile).length,quality:qualityReasons.length?'degraded':'complete'}
  };
}
