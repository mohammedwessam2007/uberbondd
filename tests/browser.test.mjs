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

test('Playwright crawler captures typed page evidence, truthful stages, and temporary screenshots',async()=>{const dir=await fs.mkdtemp(path.join(os.tmpdir(),'nightshift-'));const stages=[];const crawl=await crawlSiteBrowser(base,{allowLocal:true,maxPages:1,delayMs:0,timeoutMs:10000,screenshotDir:dir,onProgress:async stage=>stages.push(stage),htmlFetcher:async url=>{const r=await fetch(url);return{status:r.status,finalUrl:r.url,headers:Object.fromEntries(r.headers.entries()),html:await r.text()}}});assert.equal(crawl.pages.length,1);assert.equal(crawl.pages[0].mobile.horizontalOverflow,true);assert(crawl.pages[0].contactSignals>0);assert(crawl.pages[0].robotsMeta.some(item=>/noindex/.test(item.content)));assert.match(crawl.pages[0].responseHeaders['x-robots-tag'],/noindex/);assert.deepEqual(stages,['loading_website','testing_desktop_experience','testing_mobile_experience','checking_links_and_conversion_paths']);assert(crawl.pages[0].screenshots.desktop.endsWith('.png'));const files=await fs.readdir(dir);assert(files.some(x=>x.includes('desktop')));assert(files.some(x=>x.includes('mobile')));const audit=deterministicAudit(crawl,{niche:'hotel'});assert(audit.some(x=>x.code==='no-cta'));assert(audit.some(x=>x.code==='mobile-overflow'));assert(audit.some(x=>x.code==='broken-links'));assert(audit.some(x=>x.code==='noindex'));assert(audit.some(x=>x.code==='https-not-enforced'));assert.equal(audit.some(x=>x.code==='weak-contact-path'),false);});
