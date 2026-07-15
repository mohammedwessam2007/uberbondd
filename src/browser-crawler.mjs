import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { chromium } from 'playwright';
import { getRobots, isAllowed } from './robots.mjs';
import { normalizeDomain, sleep, uniq } from './utils.mjs';
import { assertPublicUrl } from './security.mjs';

const PRIORITY = /(about|team|contact|services?|pricing|book|appointment|reserve|research|doctor|clinic|portfolio|work|case)/i;
const SKIP = /\.(pdf|jpe?g|png|gif|svg|webp|zip|docx?|xlsx?|pptx?|mp4|mp3)(\?|$)/i;
const CTA = /(book|schedule|contact|buy|start|apply|request|reserve|call|whatsapp|appointment|get started|demo|quote|enquire|inquire|shop)/i;
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
      const s=getComputedStyle(el), r=el.getBoundingClientRect();
      return s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity)!==0&&r.width>2&&r.height>2;
    };
    const text = el => (el.innerText||el.textContent||'').replace(/\s+/g,' ').trim();
    const links=[...document.querySelectorAll('a[href]')].map(a=>({url:a.href,text:text(a).slice(0,180)})).filter(x=>x.url);
    const headings=[...document.querySelectorAll('h1,h2,h3')].filter(visible).map(h=>({level:h.tagName.toLowerCase(),text:text(h).slice(0,300)})).filter(x=>x.text).slice(0,60);
    const imgs=[...document.images].map(img=>({src:img.currentSrc||img.src,alt:img.getAttribute('alt')||'',width:img.naturalWidth,height:img.naturalHeight,visible:visible(img)})).slice(0,120);
    const controls=[...document.querySelectorAll('a,button,input[type=submit],[role=button]')].filter(visible).map(el=>{const r=el.getBoundingClientRect();return{tag:el.tagName.toLowerCase(),text:text(el).slice(0,180),href:el.href||'',x:Math.round(r.x),y:Math.round(r.y),width:Math.round(r.width),height:Math.round(r.height),aboveFold:r.top>=0&&r.top<window.innerHeight};}).filter(x=>x.text||x.href).slice(0,100);
    const ctaRx=new RegExp(CTA_SOURCE,'i');
    const ctas=controls.filter(x=>ctaRx.test(`${x.text} ${x.href}`));
    const forms=[...document.forms].map(form=>({action:form.action,method:form.method,text:text(form).slice(0,500),fields:[...form.querySelectorAll('input,select,textarea')].map(el=>({name:el.name,type:el.type,label:el.labels?.[0]?.innerText?.trim()||el.getAttribute('aria-label')||el.getAttribute('placeholder')||''}))}));
    const bodyText=(document.body?.innerText||'').replace(/\s+/g,' ').trim().slice(0,70000);
    const docWidth=Math.max(document.documentElement.scrollWidth,document.body?.scrollWidth||0);
    const viewportWidth=window.innerWidth;
    const genericHero=/\b(welcome|innovative solutions|quality service|your trusted partner|excellence|we are passionate|transforming possibilities|where excellence meets)\b/i.test((document.querySelector('h1')?.innerText||'')+' '+(document.querySelector('main p,header p')?.innerText||''));
    const emails=uniqLocal([...(document.documentElement.innerHTML.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)||[])]).slice(0,40);
    const mailtoLinks=links.filter(x=>x.url.startsWith('mailto:'));
    const phoneLinks=links.filter(x=>x.url.startsWith('tel:'));
    const whatsappLinks=links.filter(x=>/wa\.me|whatsapp/i.test(x.url));
    const contactRx=new RegExp(CONTACT_SOURCE,'i');
    const contactLinks=links.filter(x=>/^https?:/i.test(x.url)&&contactRx.test(`${x.text} ${x.url}`));
    const contactForms=forms.filter(form=>contactRx.test(`${form.action} ${form.text} ${(form.fields||[]).map(field=>`${field.name} ${field.type} ${field.label}`).join(' ')}`));
    const socialLinks=links.filter(x=>/linkedin|instagram|facebook|threads\.net|x\.com|twitter|youtube|tiktok/i.test(x.url));
    const jsonLd=[...document.querySelectorAll('script[type="application/ld+json"]')].map(x=>x.textContent).filter(Boolean).slice(0,10);
    const robotsMeta=[...document.querySelectorAll('meta[name]')]
      .filter(meta=>/^(robots|googlebot|bingbot)$/i.test(meta.getAttribute('name')||''))
      .map(meta=>({name:(meta.getAttribute('name')||'').toLowerCase(),content:(meta.getAttribute('content')||'').trim().slice(0,500)}))
      .filter(item=>item.content);
    return {
      title:document.title||'',description:document.querySelector('meta[name="description"]')?.content||'',lang:document.documentElement.lang||'',
      headings,links,images:imgs,controls,ctas,forms,bodyText,emails,mailtoLinks,phoneLinks,whatsappLinks,contactLinks,contactForms,socialLinks,jsonLd,robotsMeta,
      h1Count:document.querySelectorAll('h1').length,visibleH1:[...document.querySelectorAll('h1')].filter(visible).map(text),
      viewport:{width:viewportWidth,height:window.innerHeight},document:{width:docWidth,height:Math.max(document.documentElement.scrollHeight,document.body?.scrollHeight||0)},
      horizontalOverflow:docWidth>viewportWidth+4,genericHero,
      contactSignals:emails.length+mailtoLinks.length+phoneLinks.length+whatsappLinks.length+contactLinks.length+contactForms.length,
      performance:{navigation:performance.getEntriesByType('navigation')[0]?.toJSON?.()||null,resources:performance.getEntriesByType('resource').length}
    };
    function uniqLocal(a){return [...new Set(a.map(x=>String(x).toLowerCase()))]}
  }, {CTA_SOURCE:CTA.source,CONTACT_SOURCE:CONTACT.source});
}

async function checkBrokenLinks(links, origin, max=12, allowLocal=false) {
  const targets=uniq(links.filter(x=>{try{const u=new URL(x.url);return u.origin===origin&&!SKIP.test(u.pathname);}catch{return false;}}).map(x=>x.url)).slice(0,max);
  const results=[];
  for(const url of targets){
    try{
      await assertPublicUrl(url,{allowLocal});
      const res=await fetch(url,{method:'HEAD',redirect:'manual',headers:{'user-agent':'UberBondNightshift/1.0'}});
      if(res.status>=400) results.push({url,status:res.status});
    }catch(error){results.push({url,error:error.message});}
  }
  return results;
}

export async function crawlSiteBrowser(input, options={}) {
  const allowLocal=Boolean(options.allowLocal);
  const start=(await assertPublicUrl(input,{allowLocal})).href;
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
  const robots=await getRobots(start);
  let executablePath=options.executablePath||process.env.CHROMIUM_PATH||'';
  if(executablePath){try{await fs.access(executablePath);}catch{executablePath='';}}
  const launchArgs=['--no-sandbox','--disable-dev-shm-usage'];
  if(allowLocal)launchArgs.push('--disable-web-security','--disable-features=BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessSendPreflights');
  await emitProgress('loading_website');
  const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{}),args:launchArgs});
  const context=await browser.newContext({viewport:{width:1440,height:900},userAgent:'UberBondNightshift/1.0 (+public website quality research)'});
  const hostChecks=new Map();
  await context.route('**/*', async route=>{
    const req=route.request();
    const url=req.url();
    if(!/^https?:/i.test(url)) return route.continue();
    try{
      const host=new URL(url).hostname;
      let check=hostChecks.get(host);
      if(!check){check=assertPublicUrl(url,{allowLocal});hostChecks.set(host,check);}
      await check;
      return route.continue();
    }catch{return route.abort('blockedbyclient');}
  });
  const queue=[{url:start,depth:0,score:100}]; const seen=new Set(); const pages=[]; const errors=[];
  try{
    while(queue.length&&pages.length<maxPages){
      queue.sort((a,b)=>b.score-a.score); const item=queue.shift(); if(!item||seen.has(item.url)) continue;
      seen.add(item.url); if(!isAllowed(item.url,robots)) {errors.push({url:item.url,error:'blocked_by_robots'});continue;}
      const page=await context.newPage();
      try{
        let finalUrl=item.url,status=200,responseHeaders={};
        if(htmlFetcher){
          const fetched=await htmlFetcher(item.url);
          finalUrl=fetched?.finalUrl||item.url; status=Number(fetched?.status||200);
          responseHeaders=normalizeHeaders(fetched?.headers||{});
          if(status>=400){errors.push({url:item.url,status});continue;}
          const raw=String(fetched?.html||'');
          const withBase=/<head[\s>]/i.test(raw)?raw.replace(/<head([^>]*)>/i,`<head$1><base href="${finalUrl}">`):`<base href="${finalUrl}">${raw}`;
          await page.setContent(withBase,{waitUntil:'domcontentloaded',timeout:timeoutMs});
        } else {
          const response=await page.goto(item.url,{waitUntil:'domcontentloaded',timeout:timeoutMs});
          finalUrl=page.url(); status=response?.status()||0;
          responseHeaders=normalizeHeaders(response?.allHeaders?await response.allHeaders():response?.headers?.()||{});
          if(status>=400){errors.push({url:item.url,status});continue;}
        }
        await page.waitForTimeout(Math.min(1500,Math.max(250,delayMs)));
        await assertPublicUrl(finalUrl,{allowLocal});
        if(normalizeDomain(finalUrl)!==domain){errors.push({url:item.url,finalUrl,error:'cross_site_redirect'});continue;}
        if(pages.length===0)origin=new URL(finalUrl).origin;
        else if(new URL(finalUrl).origin!==origin){errors.push({url:item.url,finalUrl,error:'cross_origin_redirect'});continue;}
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
          await mobile.goto(finalUrl,{waitUntil:'domcontentloaded',timeout:timeoutMs});
        }
        await mobile.waitForTimeout(Math.min(1200,Math.max(200,delayMs)));
        const mobileData=await pageSnapshot(mobile);
        const mobileName=`${pageId}-mobile.png`;
        await mobile.screenshot({path:path.join(screenshotDir,mobileName),fullPage:true,animations:'disabled'});
        await mobile.close();
        await emitProgress('checking_links_and_conversion_paths');
        const brokenLinks=pages.length===0?await checkBrokenLinks(data.links,origin,12,allowLocal):[];
        const record={url:finalUrl,requestedUrl:item.url,status,responseHeaders,depth:item.depth,redirected:finalUrl!==item.url,...data,mobile:mobileData,brokenLinks,screenshots:{desktop:`/screenshots/${desktopName}`,mobile:`/screenshots/${mobileName}`}};
        pages.push(record);
        for(const link of data.links){
          try{
            const u=new URL(link.url);u.hash='';
            if(u.origin!==origin||seen.has(u.href)||SKIP.test(u.pathname)||item.depth>=2) continue;
            queue.push({url:u.href,depth:item.depth+1,score:scoreLink(u.href,link.text)-item.depth});
          }catch{}
        }
      }catch(error){errors.push({url:item.url,error:error.message});}
      finally{await page.close();}
      await sleep(Math.max(delayMs,(robots.crawlDelay||0)*1000));
    }
  } finally { await context.close(); await browser.close(); }
  return {startUrl:start,domain,robots,pages,errors,emails:uniq(pages.flatMap(p=>p.emails)),combinedText:pages.map(p=>`[${p.url}]\n${p.title}\n${(p.headings||[]).map(h=>h.text).join(' | ')}\n${p.bodyText||''}`).join('\n\n').slice(0,120000),completedAt:new Date().toISOString(),engine:'playwright',summary:{pagesVisited:pages.length,errors:errors.length,desktopScreenshots:pages.filter(p=>p.screenshots?.desktop).length,mobileScreenshots:pages.filter(p=>p.screenshots?.mobile).length}};
}
