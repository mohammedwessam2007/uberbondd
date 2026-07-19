import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';

const listen=server=>new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',()=>resolve(server.address().port));});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const assert=(value,message)=>{if(!value)throw new Error(message)};

const fixture=http.createServer((req,res)=>{
  if(req.url==='/robots.txt'){res.writeHead(200,{'content-type':'text/plain'});return res.end('User-agent: *\nAllow: /');}
  if(req.url==='/broken'){res.writeHead(404,{'content-type':'text/html'});return res.end('missing');}
  res.writeHead(200,{'content-type':'text/html'});
  res.end(`<!doctype html><html lang="en"><head><title>Northstar Boutique Hotel</title></head><body style="margin:0"><main style="width:520px"><h1>Welcome</h1><p>Where excellence meets unforgettable experiences.</p><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" alt=""><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" alt=""><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" alt=""><a href="/about">About</a><a href="/broken">Explore</a><p>Email hello@northstar.test</p></main></body></html>`);
});
const fixturePort=await listen(fixture);
const appPort=19000+Math.floor(Math.random()*1000);
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'uberbond-revenue-smoke-'));
const app=spawn(process.execPath,['server.mjs'],{cwd:path.resolve(new URL('..',import.meta.url).pathname),env:{...process.env,PORT:String(appPort),APP_BASE_URL:`http://127.0.0.1:${appPort}`,DATA_DIR:path.join(temp,'data'),SCREENSHOT_DIR:path.join(temp,'data','screenshots'),ADMIN_TOKEN:'test-token',TOKEN_ENCRYPTION_KEY:'a'.repeat(64),ALLOW_LOCAL_FIXTURES:'true',CHROMIUM_PATH:'/usr/bin/chromium',AI_PROVIDER:'rules',AUTOPILOT_ENABLED:'false',PUBLIC_AUDIT_ENABLED:'true',ALLOW_TEST_PAYMENT_UNLOCK:'true'},stdio:['ignore','pipe','pipe']});
let logs='';app.stdout.on('data',d=>logs+=d);app.stderr.on('data',d=>logs+=d);
try{
  let healthy=false;for(let i=0;i<40;i++){try{const r=await fetch(`http://127.0.0.1:${appPort}/api/health`);if(r.ok){healthy=true;break}}catch{}await wait(250)}
  assert(healthy,`app did not start: ${logs}`);
  const home=await fetch(`http://127.0.0.1:${appPort}/`);assert(home.ok,'storefront did not load');assert((await home.text()).includes('Find what your website'),'storefront content missing');
  const intake=await fetch(`http://127.0.0.1:${appPort}/api/public/audit`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({company:'Northstar Boutique Hotel',website:`http://127.0.0.1:${fixturePort}/`,email:'owner@example.com',industry:'Hospitality / Travel',country:'United Arab Emirates',language:'English',consent:true})});
  const created=await intake.json();assert(intake.ok,`intake failed: ${JSON.stringify(created)}`);assert(created.accessToken,'missing access token');
  const fetchReport=()=>fetch(`http://127.0.0.1:${appPort}/api/public/report`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token:created.accessToken})});
  let report;for(let i=0;i<60;i++){const r=await fetchReport();report=await r.json();if(report.report?.ready)break;await wait(500)}
  assert(report?.report?.ready,`report never became ready: ${JSON.stringify(report)} logs=${logs}`);
  assert(report.report.observations.length===1,'free report should expose exactly one finding');
  assert(report.report.hiddenFindings>=1,'free report should lock additional findings');
  const unlock=await fetch(`http://127.0.0.1:${appPort}/api/test/unlock`,{method:'POST',headers:{authorization:'Bearer test-token','content-type':'application/json'},body:JSON.stringify({leadId:created.leadId,product:'full',amountCents:4900})});assert(unlock.ok,`unlock failed: ${await unlock.text()}`);
  const paid=await fetchReport().then(r=>r.json());
  assert(paid.report.fullAccess,'paid report did not unlock');assert(paid.report.observations.length>1,'paid report did not expose all findings');
  const summary=await fetch(`http://127.0.0.1:${appPort}/api/summary`,{headers:{authorization:'Bearer test-token'}}).then(r=>r.json());assert(summary.revenue.grossRevenue===49,'revenue dashboard did not record payment');
  console.log(JSON.stringify({ok:true,leadId:created.leadId,score:paid.report.score?.total,findings:paid.report.observations.length,revenue:summary.revenue.grossRevenue,screenshotCount:paid.report.screenshots.length},null,2));
}finally{app.kill('SIGTERM');fixture.close();}
