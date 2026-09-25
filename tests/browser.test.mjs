import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {crawlSiteBrowser} from '../src/browser-crawler.mjs';
import {deterministicAudit} from '../src/audit-rules.mjs';

const html=`<!doctype html><html lang="en"><head><title>Example Premium Hotel</title><meta name="robots" content="noindex, nofollow"></head><body style="margin:0"><main style="width:480px"><h1>Welcome</h1><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" alt=""><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" alt=""><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" alt=""><p>Where excellence meets innovative solutions.</p><a href="/about">About</a><a href="/support">Support center</a><a href="/missing">Broken</a></main></body></html>`;
let server,base;
test.before(async()=>{server=http.createServer((req,res)=>{if(req.url==='/robots.txt'){res.writeHead(200,{'content-type':'text/plain'});return res.end('User-agent: *\nAllow: /');}if(req.url==='/missing'){res.writeHead(404,{'content-type':'text/html'});return res.end('missing');}res.writeHead(200,{'content-type':'text/html','x-robots-tag':'noindex'});res.end(html);});await new Promise(r=>server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${server.address().port}/`;});
test.after(async()=>new Promise(r=>server.close(r)));

test('crawler refuses to collect public-site data when robots access is unavailable',async()=>{
  const crawl=await crawlSiteBrowser(base,{allowLocal:true,robotsFetcher:async()=>({status:503,ok:false,text:async()=>''})});
  assert.equal(crawl.pages.length,0);
  assert.equal(crawl.errors[0].error,'robots-unavailable');
  assert.equal(crawl.summary.pagesVisited,0);
});

test('Playwright crawler captures typed page evidence, truthful stages, and temporary screenshots',async()=>{const dir=await fs.mkdtemp(path.join(os.tmpdir(),'nightshift-'));const stages=[];const crawl=await crawlSiteBrowser(base,{allowLocal:true,maxPages:1,delayMs:0,timeoutMs:10000,screenshotDir:dir,onProgress:async stage=>stages.push(stage),htmlFetcher:async url=>{const r=await fetch(url);return{status:r.status,finalUrl:r.url,headers:Object.fromEntries(r.headers.entries()),html:await r.text()}}});assert.equal(crawl.pages.length,1);assert.equal(crawl.pages[0].mobile.horizontalOverflow,true);assert(crawl.pages[0].contactSignals>0);assert(crawl.pages[0].robotsMeta.some(item=>/noindex/.test(item.content)));assert.match(crawl.pages[0].responseHeaders['x-robots-tag'],/noindex/);assert.deepEqual(stages,['loading_website','testing_desktop_experience','testing_mobile_experience','checking_links_and_conversion_paths']);assert(crawl.pages[0].screenshots.desktop.endsWith('.png'));const files=await fs.readdir(dir);assert(files.some(x=>x.includes('desktop')));assert(files.some(x=>x.includes('mobile')));const audit=deterministicAudit(crawl,{niche:'hotel'});assert(audit.some(x=>x.code==='no-cta'));assert(audit.some(x=>x.code==='mobile-overflow'));assert(audit.some(x=>x.code==='broken-links'));assert(audit.some(x=>x.code==='noindex'));assert(audit.some(x=>x.code==='https-not-enforced'));assert.equal(audit.some(x=>x.code==='weak-contact-path'),false);});

test('the public form sends a linked or typed invitation code as attribution and follow-up consent only when ticked', async () => {
  const { chromium } = await import('playwright');
  const { resolveChromium } = await import('../src/resolve-chromium.mjs');
  const publicDir = new URL('../public/', import.meta.url);
  const bodies = [];
  const site = http.createServer(async (req, res) => {
    if (req.url === '/api/public/config') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ prices: { full: 450, strategy: 900, monitoring: 99, implementationFrom: 1000 } })); }
    if (req.url === '/api/public/audit') {
      let raw = ''; for await (const chunk of req) raw += chunk;
      bodies.push(JSON.parse(raw));
      res.writeHead(202, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ statusUrl: '/done' }));
    }
    const file = req.url.split('?')[0] === '/' ? 'index.html' : req.url.split('?')[0].slice(1);
    try {
      const content = await fs.readFile(new URL(file, publicDir));
      res.writeHead(200, { 'content-type': file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html' });
      res.end(content);
    } catch { res.writeHead(404); res.end(''); }
  });
  await new Promise(resolve => site.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ executablePath: resolveChromium() || undefined });
  try {
    const origin = `http://127.0.0.1:${site.address().port}`;
    const submit = async (url, fill) => {
      const page = await browser.newPage();
      await page.goto(url);
      await page.fill('input[name="company"]', 'Harbor Dental');
      await page.fill('input[name="website"]', 'https://harbordental.example');
      await page.fill('input[name="email"]', 'office@harbordental.example');
      await page.check('input[name="consent"]');
      await fill(page);
      const before = bodies.length;
      await page.click('button.submit-audit');
      for (let i = 0; i < 50 && bodies.length === before; i++) await new Promise(r => setTimeout(r, 50));
      await page.close();
      return bodies.at(-1);
    };
    const linked = await submit(`${origin}/?code=ABCD-EFGH-JKMN`, async page => {
      assert.equal(await page.inputValue('input[name="code"]'), 'ABCD-EFGH-JKMN', 'a linked code pre-fills the field');
    });
    assert.equal(linked.source, 'bridge:ABCDEFGHJKMN');
    assert.equal(linked.consent, true);
    assert.equal(linked.followUp, false, 'the follow-up box starts unticked');
    assert.equal('code' in linked, false);

    const typed = await submit(`${origin}/`, async page => {
      await page.fill('input[name="code"]', 'abcd efgh jkmn');
      await page.check('input[name="followUp"]');
    });
    assert.equal(typed.source, 'bridge:ABCDEFGHJKMN');
    assert.equal(typed.followUp, true);

    const none = await submit(`${origin}/`, async () => {});
    assert.equal(none.source, undefined, 'no code, no attribution');
  } finally {
    await browser.close();
    await new Promise(resolve => site.close(resolve));
  }
});
