import { resolveChromium } from './resolve-chromium.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { chromium } from 'playwright';
import { getRobots, isAllowed } from './robots.mjs';
import { normalizeDomain, sleep, uniq } from './utils.mjs';
import { assertPublicUrl } from './security.mjs';
import { getSharedBrowserRuntime } from './browser-runtime-pool.mjs';

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

async function pageSnapshot(page, timeoutMs = 20000) {
  let timer;
  try {
    return await Promise.race([
      page.evaluate(({CTA_SOURCE,CONTACT_SOURCE}) => {
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
  }, {CTA_SOURCE:CTA.source,CONTACT_SOURCE:CONTACT.source}),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('page-snapshot-timeout')), Math.max(1000, Number(timeoutMs || 20000)));
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function boundedAction(operation, timeoutMs = 20000, code = 'bounded-operation-timeout') {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(code)), Math.max(1000, Number(timeoutMs || 20000)));
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function checkBrokenLinks(links, origin, max=4, allowLocal=false, robots={allow:[],disallow:[]}) {
  const targets=uniq(links.filter(x=>{try{const u=new URL(x.url);return u.origin===origin&&!SKIP.test(u.pathname)&&isAllowed(x.url,robots);}catch{return false;}}).map(x=>x.url)).slice(0,Math.min(4,max));
  const results=[];
  const linkTimeoutMs=5000;
  for(const url of targets){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),linkTimeoutMs);
    const wallClockTimeout=new Promise((_,reject)=>setTimeout(()=>reject(new Error('head-request-timeout')),linkTimeoutMs));
    try{
      await assertPublicUrl(url,{allowLocal});
      const res=await Promise.race([
        fetch(url,{method:'HEAD',redirect:'manual',headers:{'user-agent':'UberBondNightshift/1.0'},signal:controller.signal}),
        wallClockTimeout
      ]);
      if(res.status>=400) results.push({url,status:res.status});
    }catch(error){results.push({url,error:error.message});}
    finally{clearTimeout(timer);}
  }
  return results;
}

function decodeHtml(value = '') {
  return String(value || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Math.min(0x10ffff, Number(code))))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Math.min(0x10ffff, Number.parseInt(code, 16))));
}

function htmlAttr(attrs = '', name = '') {
  const match = String(attrs).match(new RegExp(name + '\\s*=\\s*(?:"([^"]*)"|\\'([^\\']*)\\'|([^\\s>]+))', 'i'));
  return decodeHtml(match?.[1] ?? match?.[2] ?? match?.[3] ?? '');
}

function htmlText(raw = '') {
  return decodeHtml(String(raw || '')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|template|svg)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim());
}

function absoluteHtmlUrl(value, baseUrl) {
  try {
    const url = new URL(String(value || '').trim(), baseUrl);
    return /^https?:$/i.test(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

function parseHtmlSnapshot(raw, finalUrl, viewport = { width: 1440, height: 900 }) {
  const html = String(raw || '');
  const title = htmlText((html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '');
  const metaTags = [...html.matchAll(/<meta\b([^>]*)>/gi)].map(match => match[1] || '');
  const description = htmlAttr(
    metaTags.find(attrs => /^description$/i.test(htmlAttr(attrs, 'name'))) || '',
    'content'
  );
  const lang = htmlAttr((html.match(/<html\b([^>]*)>/i) || [])[1] || '', 'lang');
  const headings = [...html.matchAll(/<(h[1-3])\b[^>]*>([\s\S]*?)<\/\1>/gi)]
    .map(match => ({ level: match[1].toLowerCase(), text: htmlText(match[2]).slice(0, 300) }))
    .filter(item => item.text)
    .slice(0, 60);
  const links = [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)]
    .map(match => ({
      url: absoluteHtmlUrl(htmlAttr(match[1], 'href'), finalUrl),
      text: htmlText(match[2]).slice(0, 180)
    }))
    .filter(item => item.url)
    .filter((item, index, all) => all.findIndex(other => other.url === item.url && other.text === item.text) === index)
    .slice(0, 400);
  const images = [...html.matchAll(/<img\b([^>]*)>/gi)]
    .map(match => ({
      src: absoluteHtmlUrl(htmlAttr(match[1], 'src') || htmlAttr(match[1], 'data-src'), finalUrl),
      alt: htmlAttr(match[1], 'alt'),
      width: Number(htmlAttr(match[1], 'width') || 0),
      height: Number(htmlAttr(match[1], 'height') || 0),
      visible: true
    }))
    .filter(item => item.src)
    .slice(0, 120);
  const buttons = [...html.matchAll(/<(button|input)\b([^>]*)>/gi)]
    .map(match => ({
      tag: match[1].toLowerCase(),
      text: htmlText(htmlAttr(match[2], 'value') || htmlAttr(match[2], 'aria-label') || htmlAttr(match[2], 'placeholder')),
      href: '',
      x: 0, y: 0, width: 0, height: 0, aboveFold: true
    }))
    .filter(item => item.text);
  const controls = [
    ...links.map(item => ({ tag: 'a', text: item.text, href: item.url, x: 0, y: 0, width: 0, height: 0, aboveFold: true })),
    ...buttons
  ].slice(0, 100);
  const ctaRx = new RegExp(CTA.source, 'i');
  const ctas = controls.filter(item => ctaRx.test(item.text + ' ' + item.href));
  const forms = [...html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)]
    .map(match => ({
      action: absoluteHtmlUrl(htmlAttr(match[1], 'action') || finalUrl, finalUrl),
      method: htmlAttr(match[1], 'method') || 'get',
      text: htmlText(match[2]).slice(0, 500),
      fields: [...match[2].matchAll(/<(input|select|textarea)\b([^>]*)>/gi)].map(field => ({
        name: htmlAttr(field[2], 'name'),
        type: htmlAttr(field[2], 'type') || field[1].toLowerCase(),
        label: htmlAttr(field[2], 'aria-label') || htmlAttr(field[2], 'placeholder')
      }))
    }));
  const bodyText = htmlText(html).slice(0, 70000);
  const emails = [...new Set((html.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []).map(value => value.toLowerCase()))].slice(0, 40);
  const mailtoLinks = links.filter(item => item.url.startsWith('mailto:'));
  const phoneLinks = links.filter(item => item.url.startsWith('tel:'));
  const whatsappLinks = links.filter(item => /wa\.me|whatsapp/i.test(item.url));
  const contactRx = new RegExp(CONTACT.source, 'i');
  const contactLinks = links.filter(item => contactRx.test(item.text + ' ' + item.url));
  const contactForms = forms.filter(form => contactRx.test(form.action + ' ' + form.text + ' ' + form.fields.map(field => field.name + ' ' + field.type + ' ' + field.label).join(' ')));
  const socialLinks = links.filter(item => /linkedin|instagram|facebook|threads\.net|x\.com|twitter|youtube|tiktok/i.test(item.url));
  const jsonLd = [...html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
    .map(match => match[1])
    .filter(Boolean)
    .slice(0, 10);
  const robotsMeta = metaTags
    .map(attrs => ({ name: htmlAttr(attrs, 'name').toLowerCase(), content: htmlAttr(attrs, 'content').slice(0, 500) }))
    .filter(item => /^(robots|googlebot|bingbot)$/.test(item.name) && item.content);
  const visibleH1 = headings.filter(item => item.level === 'h1').map(item => item.text);
  const genericHero = /\b(welcome|innovative solutions|quality service|your trusted partner|excellence|we are passionate|transforming possibilities|where excellence meets)\b/i.test((visibleH1[0] || '') + ' ' + bodyText.slice(0, 800));
  return {
    title, description, lang, headings, links, images, controls, ctas, forms, bodyText,
    emails, mailtoLinks, phoneLinks, whatsappLinks, contactLinks, contactForms, socialLinks,
    jsonLd, robotsMeta, h1Count: visibleH1.length, visibleH1,
    viewport,
    document: { width: viewport.width, height: Math.max(viewport.height, Math.ceil(bodyText.length / 2)) },
    horizontalOverflow: false,
    genericHero,
    contactSignals: emails.length + mailtoLinks.length + phoneLinks.length + whatsappLinks.length + contactLinks.length + contactForms.length,
    performance: { navigation: null, resources: 0 }
  };
}

async function fetchHtmlBounded(url, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1000, Number(timeoutMs || 10000)));
  try {
    const response = await fetch(url, { headers: { 'user-agent': 'UberBondNightshift/1.0 (+public website quality research)' }, signal: controller.signal });
    return {
      status: response.status,
      finalUrl: response.url,
      headers: response.headers,
      html: await response.text()
    };
  } finally {
    clearTimeout(timer);
  }
}

async function crawlSiteHtml(input, options = {}) {
  const allowLocal = Boolean(options.allowLocal);
  const start = (await assertPublicUrl(input, { allowLocal })).href;
  let origin = new URL(start).origin;
  const domain = normalizeDomain(start);
  const maxPages = Math.max(1, Math.min(12, Number(options.maxPages || 1)));
  const delayMs = Math.max(0, Number(options.delayMs || 500));
  const timeoutMs = Math.max(5000, Number(options.timeoutMs || 10000));
  const htmlFetcher = typeof options.htmlFetcher === 'function' ? options.htmlFetcher : fetchHtmlBounded;
  const robots = await getRobots(start, options.robotsFetcher || fetch);
  if (robots.available === false) {
    return {
      startUrl: start, domain, robots, pages: [],
      errors: [{ url: start, error: robots.error || 'robots-unavailable', status: robots.status || 0 }],
      emails: [], combinedText: '', completedAt: new Date().toISOString(), engine: 'html-fetch',
      summary: { pagesVisited: 0, errors: 1, desktopScreenshots: 0, mobileScreenshots: 0 }
    };
  }
  const queue = [{ url: start, depth: 0, score: 100 }];
  const seen = new Set();
  const pages = [];
  const errors = [];
  while (queue.length && pages.length < maxPages) {
    queue.sort((a, b) => b.score - a.score);
    const item = queue.shift();
    if (!item || seen.has(item.url)) continue;
    seen.add(item.url);
    if (!isAllowed(item.url, robots)) {
      errors.push({ url: item.url, error: 'blocked_by_robots' });
      continue;
    }
    try {
      const fetched = htmlFetcher === fetchHtmlBounded
        ? await fetchHtmlBounded(item.url, timeoutMs)
        : await htmlFetcher(item.url);
      const status = Number(fetched?.status || 200);
      const finalUrl = fetched?.finalUrl || item.url;
      if (status >= 400) {
        errors.push({ url: item.url, status });
        continue;
      }
      await assertPublicUrl(finalUrl, { allowLocal });
      if (normalizeDomain(finalUrl) !== domain) {
        errors.push({ url: item.url, finalUrl, error: 'cross_site_redirect' });
        continue;
      }
      if (pages.length === 0) origin = new URL(finalUrl).origin;
      else if (new URL(finalUrl).origin !== origin) {
        errors.push({ url: item.url, finalUrl, error: 'cross_origin_redirect' });
        continue;
      }
      const data = parseHtmlSnapshot(fetched?.html || '', finalUrl, { width: 1440, height: 900 });
      const mobileData = parseHtmlSnapshot(fetched?.html || '', finalUrl, { width: 390, height: 844 });
      const brokenLinks = pages.length === 0 ? await checkBrokenLinks(data.links, origin, 12, allowLocal, robots) : [];
      pages.push({
        url: finalUrl, requestedUrl: item.url, status,
        responseHeaders: normalizeHeaders(fetched?.headers || {}),
        depth: item.depth, redirected: finalUrl !== item.url,
        ...data, mobile: mobileData, brokenLinks,
        screenshots: { desktop: '', mobile: '' }
      });
      for (const link of data.links) {
        try {
          const u = new URL(link.url);
          u.hash = '';
          if (u.origin !== origin || seen.has(u.href) || SKIP.test(u.pathname) || item.depth >= 2) continue;
          queue.push({ url: u.href, depth: item.depth + 1, score: scoreLink(u.href, link.text) - item.depth });
        } catch {}
      }
    } catch (error) {
      errors.push({ url: item.url, error: error.message });
    }
    await sleep(Math.max(delayMs, (robots.crawlDelay || 0) * 1000));
  }
  return {
    startUrl: start, domain, robots, pages,
    errors, emails: uniq(pages.flatMap(page => page.emails)),
    combinedText: pages.map(page => '[' + page.url + ']\n' + page.title + '\n' + page.headings.map(item => item.text).join(' | ') + '\n' + page.bodyText).join('\n\n').slice(0, 120000),
    completedAt: new Date().toISOString(), engine: 'html-fetch',
    summary: {
      pagesVisited: pages.length, errors: errors.length, desktopScreenshots: 0, mobileScreenshots: 0
    }
  };
}

export async function crawlSiteBrowser(input, options={}) {
  if (options.htmlOnly) return crawlSiteHtml(input, options);
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
  const robots=await getRobots(start, options.robotsFetcher || fetch);
  if (robots.available === false) {
    return {
      startUrl: start, domain, robots, pages: [],
      errors: [{url: start, error: robots.error || 'robots-unavailable', status: robots.status || 0}],
      emails: [], combinedText: '', completedAt: new Date().toISOString(), engine: 'playwright',
      summary: {pagesVisited: 0, errors: 1, desktopScreenshots: 0, mobileScreenshots: 0}
    };
  }
  // Fall back to whatever Chromium is actually installed.
  //
  // CHROMIUM_PATH is how this repository names a browser and nothing sets it, so
  // the crawler fell through to Playwright's own default -- which points at the
  // exact build its package was published against. On a host carrying a
  // different build that is a launch failure telling you to run `npx playwright
  // install`, on a machine that already has a working browser sitting next to
  // the one it wants.
  //
  // resolveChromium only returns paths that exist and are executable, and
  // returns nothing rather than a guess, so an explicit executablePath still
  // wins and a host with no browser still fails the same way it did before.
  let executablePath=options.executablePath||process.env.CHROMIUM_PATH||resolveChromium()||'';
  if(executablePath){try{await fs.access(executablePath);}catch{executablePath='';}}
  const launchArgs=['--no-sandbox','--disable-dev-shm-usage'];
  if(allowLocal)launchArgs.push('--disable-web-security','--disable-features=BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessSendPreflights');
  await emitProgress('loading_website');
  const runtime=getSharedBrowserRuntime({
    key:options.browserRuntimeKey||'browser-crawler',
    launchBrowser:launchOptions=>chromium.launch(launchOptions),
    launchOptions:{headless:true,...(executablePath?{executablePath}:{}),args:launchArgs},
    maxConcurrentContexts:options.maxConcurrentContexts,
    recycleAfterContexts:options.recycleAfterContexts
  });
  const runtimeLease=await runtime.acquire({contextOptions:{viewport:{width:1440,height:900},userAgent:'UberBondNightshift/1.0 (+public website quality research)'}});
  const context=runtimeLease.context;
  const hostChecks=new Map();
  // Declared out here, not inside the try, because the return statement below
  // the finally reads them. Moving these into the try when the pool lease was
  // introduced made every crawl throw `ReferenceError: pages is not defined`
  // -- a total failure of the audit path that check:syntax cannot see, the
  // deterministic suite does not cover, and the pool's own unit tests miss
  // because they mock the browser. Only the real browser gate catches it.
  const queue=[{url:start,depth:0,score:100}]; const seen=new Set(); const pages=[]; const errors=[];
  try{
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
          await boundedAction(() => page.setContent(withBase,{waitUntil:'domcontentloaded',timeout:timeoutMs}), timeoutMs, 'page-set-content-timeout');
        } else {
          const response=await page.goto(item.url,{waitUntil:'commit',timeout:timeoutMs});
          if (typeof page.waitForLoadState === 'function') {
            await page.waitForLoadState('domcontentloaded',{timeout:Math.min(timeoutMs,10000)}).catch(()=>{});
          }
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
        const data=await pageSnapshot(page,Math.min(timeoutMs,20000));
        const pageId=`${slug(domain)}-${pages.length+1}-${crypto.createHash('sha1').update(finalUrl).digest('hex').slice(0,8)}`;
        const desktopName=`${pageId}-desktop.png`;
        let desktopScreenshot = false;
        try {
          await page.screenshot({path:path.join(screenshotDir,desktopName),fullPage:true,animations:'disabled',timeout:Math.min(timeoutMs,10000)});
          desktopScreenshot = true;
        } catch {}
        const mobile=await context.newPage();
        await mobile.setViewportSize({width:390,height:844});
        await emitProgress('testing_mobile_experience');
        if(htmlFetcher){
          const fetched=await htmlFetcher(finalUrl);
          const raw=String(fetched?.html||'');
          const withBase=/<head[\s>]/i.test(raw)?raw.replace(/<head([^>]*)>/i,`<head$1><base href="${finalUrl}">`):`<base href="${finalUrl}">${raw}`;
          await boundedAction(() => mobile.setContent(withBase,{waitUntil:'domcontentloaded',timeout:timeoutMs}), timeoutMs, 'mobile-set-content-timeout');
        } else {
          await mobile.goto(finalUrl,{waitUntil:'commit',timeout:timeoutMs});
          if (typeof mobile.waitForLoadState === 'function') {
            await mobile.waitForLoadState('domcontentloaded',{timeout:Math.min(timeoutMs,10000)}).catch(()=>{});
          }
        }
        await mobile.waitForTimeout(Math.min(1200,Math.max(200,delayMs)));
        const mobileData=await pageSnapshot(mobile,Math.min(timeoutMs,20000));
        const mobileName=`${pageId}-mobile.png`;
        let mobileScreenshot = false;
        try {
          await mobile.screenshot({path:path.join(screenshotDir,mobileName),fullPage:true,animations:'disabled',timeout:Math.min(timeoutMs,10000)});
          mobileScreenshot = true;
        } catch {}
        await boundedAction(() => mobile.close(), 5000, 'mobile-close-timeout').catch(() => {});
        await emitProgress('checking_links_and_conversion_paths');
        const brokenLinks=pages.length===0?await checkBrokenLinks(data.links,origin,12,allowLocal,robots):[];
        const record={url:finalUrl,requestedUrl:item.url,status,responseHeaders,depth:item.depth,redirected:finalUrl!==item.url,...data,mobile:mobileData,brokenLinks,screenshots:{desktop:desktopScreenshot?`/screenshots/${desktopName}`:'',mobile:mobileScreenshot?`/screenshots/${mobileName}`:''}};
        pages.push(record);
        for(const link of data.links){
          try{
            const u=new URL(link.url);u.hash='';
            if(u.origin!==origin||seen.has(u.href)||SKIP.test(u.pathname)||item.depth>=2) continue;
            queue.push({url:u.href,depth:item.depth+1,score:scoreLink(u.href,link.text)-item.depth});
          }catch{}
        }
      }catch(error){errors.push({url:item.url,error:error.message});}
      finally{await boundedAction(() => page.close(), 5000, 'page-close-timeout').catch(() => {});}
      await sleep(Math.max(delayMs,(robots.crawlDelay||0)*1000));
    }
  } finally { await boundedAction(() => runtimeLease.release(), 5000, 'browser-runtime-release-timeout').catch(() => {}); }
  return {startUrl:start,domain,robots,pages,errors,emails:uniq(pages.flatMap(p=>p.emails)),combinedText:pages.map(p=>`[${p.url}]\n${p.title}\n${(p.headings||[]).map(h=>h.text).join(' | ')}\n${p.bodyText||''}`).join('\n\n').slice(0,120000),completedAt:new Date().toISOString(),engine:'playwright',summary:{pagesVisited:pages.length,errors:errors.length,desktopScreenshots:pages.filter(p=>p.screenshots?.desktop).length,mobileScreenshots:pages.filter(p=>p.screenshots?.mobile).length}};
}
