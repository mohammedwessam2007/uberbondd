// Independent review probes — NOT part of the product. Attacks the 10 mission claims.
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {buildOverpassQuery, parseBbox, normalizeCategories, parseOverpassElements} from '../src/discovery.mjs';

const root=path.resolve(new URL('..',import.meta.url).pathname);
const wait=ms=>new Promise(r=>setTimeout(r,ms));
let pass=0,fail=0;
const ok=(cond,label,extra='')=>{if(cond){pass++;console.log(`PASS  ${label}`);}else{fail++;console.log(`FAIL  ${label} ${extra}`);}};

// ---------- shared mock Overpass ----------
const received=[]; let concCounter=0;
const el=(id,name,site,extra={})=>({type:'node',id,lat:51.5,lon:-0.1,tags:{name,amenity:'clinic',...(site?{website:site}:{}),...extra}});
const mock=http.createServer(async(req,res)=>{
  let body='';for await(const c of req)body+=c;
  received.push({url:req.url,body:decodeURIComponent(body.replace(/^data=/,''))});
  let elements=[];
  if(req.url.startsWith('/gate')) elements=[
    el(1,'Good Clinic','https://good.example'),
    el(2,'No Site Clinic',''),
    el(3,'JS Clinic','javascript:alert(1)'),
    el(4,'FTP Clinic','ftp://files.example'),
    el(5,'Tel Clinic','tel:+201000000000'),
    {type:'node',id:6,tags:{amenity:'clinic',website:'https://nameless.example'}},
    el(7,'Dup Clinic','http://www.good.example/other'),
    el(8,'Second Clinic','https://second.example')
  ];
  else if(req.url.startsWith('/cap')) elements=[1,2,3,4,5].map(i=>el(i,`Cap Clinic ${i}`,`https://cap${i}.example`));
  else if(req.url.startsWith('/conc')){const c=++concCounter;await wait(400);elements=[1,2,3,4,5].map(i=>el(c*10+i,`Conc ${c}-${i}`,`https://conc${c}-${i}.example`));}
  else if(req.url.startsWith('/fixture')){const p=req.url.split('?')[1];elements=[el(1,'Local A',`http://127.0.0.1:${p}/a`),el(2,'Local B',`http://127.0.0.2:${p}/b`)];}
  else elements=[el(1,'Atlas Clinic','https://atlas.example'),el(2,'Nova Dental','https://nova.example',{amenity:'dentist'})];
  res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({elements}));
});
await new Promise(r=>mock.listen(0,'127.0.0.1',r));
const mockPort=mock.address().port;

// ---------- local fixture website ----------
const fixture=http.createServer((req,res)=>{
  if(req.url==='/robots.txt'){res.writeHead(200,{'content-type':'text/plain'});return res.end('User-agent: *\nAllow: /');}
  res.writeHead(200,{'content-type':'text/html'});
  res.end('<!doctype html><html lang="en"><head><title>Local Clinic</title></head><body><main style="width:400px"><h1>Local Clinic</h1><p>Serving patients since 1990 with measurable outcomes.</p><a href="/contact">Contact</a><p>Email hello@local.test</p></main></body></html>');
});
await new Promise(r=>fixture.listen(0,'127.0.0.1',r));
const fixturePort=fixture.address().port;

// ---------- app runner ----------
async function withApp(env,fn,preSeed=null){
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'ub-probe-'));
  if(preSeed)await fs.writeFile(path.join(dir,'db.json'),JSON.stringify(preSeed,null,2));
  const port=20000+Math.floor(Math.random()*20000);
  const child=spawn(process.execPath,['server.mjs'],{cwd:root,env:{
    ...process.env,PORT:String(port),APP_BASE_URL:`http://127.0.0.1:${port}`,DATA_DIR:dir,
    SCREENSHOT_DIR:path.join(dir,'screenshots'),ADMIN_TOKEN:'probe-token',TOKEN_ENCRYPTION_KEY:'a'.repeat(64),
    AI_PROVIDER:'rules',AUTOPILOT_ENABLED:'false',...env
  },stdio:['ignore','pipe','pipe']});
  let logs='';child.stdout.on('data',d=>logs+=d);child.stderr.on('data',d=>logs+=d);
  const api=async(p,o={})=>{
    const res=await fetch(`http://127.0.0.1:${port}${p}`,{...o,headers:{authorization:'Bearer probe-token','content-type':'application/json',...(o.headers||{})}});
    const data=await res.json().catch(()=>({}));return {status:res.status,data};
  };
  try{
    let up=false;for(let i=0;i<60;i++){try{const r=await fetch(`http://127.0.0.1:${port}/api/health`);if(r.ok){up=true;break;}}catch{}await wait(150);}
    if(!up)throw new Error(`app did not start: ${logs}`);
    await fn(api,()=>logs,port);
  }finally{child.kill('SIGTERM');await wait(150);await fs.rm(dir,{recursive:true,force:true});}
}
const mkCampaign=async(api,extra={})=>(await api('/api/campaigns',{method:'POST',body:JSON.stringify({name:'Probe',niche:'clinics',offer:'audit',minScore:50,maxFollowups:0,approved:true,autoSend:false,...extra})})).data;

async function awaitQueued(api,response,{timeoutMs=20000}={}){
  if(response.status!==202||!response.data?.jobId)return response;
  const deadline=Date.now()+timeoutMs;
  while(Date.now()<deadline){
    const listing=await api('/api/jobs');
    const job=(listing.data||[]).find(item=>item.id===response.data.jobId);
    if(job?.status==='completed')return {status:200,data:job.result||{},job};
    if(job?.status==='dead-letter')return {status:422,data:{error:job.lastError||'Job dead-lettered'},job};
    await wait(100);
  }
  return {status:504,data:{error:`Timed out waiting for ${response.data.jobId}`}};
}
async function submitAndWait(api,pathname,options,waitOptions){
  return awaitQueued(api,await api(pathname,options),waitOptions);
}

// ================= P1: Overpass QL injection (unit-level grammar fuzz) =================
{
  const hostile=[
    ['bbox','1,1,2,2);out body;//'],['bbox','1,1,2,2");nwr[amenity];'],['bbox','1;1;2;2'],['bbox','a,b,c,d'],
    ['bbox','1,1,2'],['bbox','-91,0,1,1'],['bbox','0,0,80,80'],['bbox','2,2,1,1'],
    ['cat','clinic"];out;'],['cat','clinic;out body'],['cat','clinic,__proto__'],['cat',''],['cat','constructor']
  ];
  let rejected=0;
  for(const [kind,val] of hostile){
    try{ kind==='bbox'?buildOverpassQuery({bbox:val,categories:['clinic']}):buildOverpassQuery({bbox:'1,1,2,2',categories:val}); }
    catch{rejected++;}
  }
  ok(rejected===hostile.length,`P1 unit: ${hostile.length}/${hostile.length} hostile bbox/category inputs rejected before query build`,`(rejected ${rejected})`);
  const num='-?\\d+(?:\\.\\d+)?';
  const selector=`  nwr\\["[a-z_:]+"~"\\^\\((?:[a-z_]+\\|?)+\\)\\$"\\]\\(${num},${num},${num},${num}\\);`;
  const grammar=new RegExp(`^\\[out:json\\]\\[timeout:\\d+\\];\\n\\(\\n(?:${selector}\\n?)+\\);\\nout center tags;$`);
  const q=buildOverpassQuery({bbox:' 51.28 , -0.51 , 51.69 , 0.33 ',categories:'clinic, dentist ,medical',timeoutSeconds:'999'});
  ok(grammar.test(q),'P1 unit: generated query matches strict Overpass QL grammar (no free-form text can appear)');
  ok(/\[timeout:60\]/.test(q),'P1 unit: timeout clamped to 60s ceiling');
}

// ================= P2/P3/P4/P6/P8/P9 on one instance =================
await withApp({DISCOVERY_OVERPASS_ENDPOINT:`http://127.0.0.1:${mockPort}/gate/api/interpreter`,DISCOVERY_DAILY_CAP:'10'},async api=>{
  const camp=await mkCampaign(api);
  const bbox='51.4,-0.3,51.7,0.1';

  // P6 campaign gating
  let r=await api('/api/discovery/run',{method:'POST',body:JSON.stringify({bbox,categories:['clinic'],dryRun:false})});
  ok(r.status>=400&&/campaign/i.test(r.data.error||''),'P6 live run without campaign rejected with clear message',JSON.stringify(r.data));
  r=await api('/api/discovery/run',{method:'POST',body:JSON.stringify({campaignId:'camp_nope',bbox,categories:['clinic'],dryRun:false})});
  ok(r.status>=400&&/campaign/i.test(r.data.error||''),'P6 unknown campaign rejected');
  const unapproved=await mkCampaign(api,{approved:false});
  r=await api('/api/discovery/run',{method:'POST',body:JSON.stringify({campaignId:unapproved.id,bbox,categories:['clinic'],dryRun:false})});
  ok(r.status>=400&&/approved/i.test(r.data.error||''),'P6 unapproved campaign rejected',JSON.stringify(r.data));
  ok((await api('/api/discovery-runs')).data.length===0,'P6 invalid attempts are rejected before queueing or contacting the provider');

  // P1 API surface: hostile inputs rejected server-side, nothing reaches Overpass
  const before=received.length;
  r=await api('/api/discovery/run',{method:'POST',body:JSON.stringify({campaignId:camp.id,bbox:'1,1,2,2);out body;//',categories:['clinic'],dryRun:true})});
  ok(r.status>=400&&/number/i.test(r.data.error||''),'P1 API: injected bbox rejected with human-readable error',JSON.stringify(r.data));
  r=await api('/api/discovery/run',{method:'POST',body:JSON.stringify({campaignId:camp.id,bbox,categories:'clinic"];out;',dryRun:true})});
  ok(r.status>=400&&/unsupported/i.test(r.data.error||''),'P1 API: injected category rejected with human-readable error',JSON.stringify(r.data));
  ok(received.length===before,'P1 API: rejected inputs never produced an Overpass request');

  // P4 dry run imports nothing
  r=await submitAndWait(api,'/api/discovery/run',{method:'POST',body:JSON.stringify({campaignId:camp.id,bbox,categories:['clinic'],dryRun:true})});
  ok(r.status===200&&r.data.importedCount===0&&r.data.discoveredCount===2,'P4 dry run: 0 imported from 2 discoverable',JSON.stringify({imp:r.data.importedCount,disc:r.data.discoveredCount}));
  ok((await api('/api/prospects')).data.length===0,'P4 dry run: prospect vault untouched');
  r=await submitAndWait(api,'/api/discovery/run',{method:'POST',body:JSON.stringify({campaignId:camp.id,bbox,categories:['clinic'],dryRun:'false'})});
  ok(r.data.dryRun===true&&r.data.importedCount===0,'P4 string "false" for dryRun stays in preview mode (fails safe)');

  // P2 website gate + P3 in-run dedup — live import
  r=await submitAndWait(api,'/api/discovery/run',{method:'POST',body:JSON.stringify({campaignId:camp.id,bbox,categories:['clinic'],dryRun:false})});
  const pros=(await api('/api/prospects')).data;
  const domains=pros.map(p=>p.domain).sort();
  ok(r.data.importedCount===2&&domains.join(',')==='good.example,second.example',
    'P2 gate: javascript:/ftp:/tel:/no-site/no-name records excluded; only 2 http(s) records imported',JSON.stringify(domains));
  ok(!pros.some(p=>!/^https?:\/\//.test(p.website)),'P2 gate: every imported website is http(s)');

  // P3 global dedup across a second run and across www/path variants
  r=await submitAndWait(api,'/api/discovery/run',{method:'POST',body:JSON.stringify({campaignId:camp.id,bbox,categories:['clinic'],dryRun:false,requestId:'dedup-rerun'})});
  ok(r.data.importedCount===0&&r.data.skippedCount===2&&(await api('/api/prospects')).data.length===2,
    'P3 rerun: all rediscovered domains skipped as global duplicates',JSON.stringify({imp:r.data.importedCount,skip:r.data.skippedCount}));
  r=await api('/api/prospects/import',{method:'POST',body:JSON.stringify({campaignId:camp.id,prospects:[{company:'Manual Dup',website:'http://WWW.Good.example/landing?x=1'}]})});
  ok(r.data.added===0&&r.data.skipped===1,'P3 manual import of www/path/case variant of a discovered domain is deduplicated');

  // P8 attribution
  const p=pros.find(x=>x.domain==='good.example');
  ok(p.source==='openstreetmap'&&p.sourceRecordId==='node/1'&&p.sourceUrl==='https://www.openstreetmap.org/node/1'&&p.sourceLicense.includes('OpenStreetMap')&&p.sourceMetadata?.osmId===1&&p.sourceMetadata?.websiteTag==='website',
    'P8 attribution: source, sourceUrl, sourceRecordId, license, OSM id and website tag retained on the record');
  const exp=await api('/api/export.json');
  const ep=(exp.data.prospects||[]).find(x=>x.domain==='good.example');
  ok(ep&&ep.sourceRecordId==='node/1'&&ep.sourceLicense.includes('OpenStreetMap'),'P8 attribution survives JSON export');

  // P9 error quality + auth
  r=await api('/api/discovery/run',{method:'POST',body:JSON.stringify({campaignId:camp.id,bbox:'0,0,80,80',categories:['clinic'],dryRun:true})});
  ok(/too large.*5 degrees/i.test(r.data.error||''),'P9 oversized bbox error explains the 5-degree limit',JSON.stringify(r.data));
  const noAuth=await fetch(`http://127.0.0.1:${(await api('/api/health')).data?0:0}`).catch(()=>null); // placeholder no-op
  const unauth=await api('/api/discovery/run',{method:'POST',headers:{authorization:'Bearer wrong'},body:JSON.stringify({})});
  ok(unauth.status===401,'P9 discovery endpoints require the admin token');
  // NaN limit on a fresh cap — expect an understandable outcome, not a false "cap reached"
  r=await submitAndWait(api,'/api/discovery/run',{method:'POST',body:JSON.stringify({campaignId:camp.id,bbox,categories:['clinic'],dryRun:false,limit:'abc'})});
  const misleading=/cap reached/i.test(r.data.error||'');
  ok(!misleading,'P9 non-numeric limit does not produce a false "daily cap reached" error',JSON.stringify(r.data));
});

// ================= P5: sequential daily cap =================
await withApp({DISCOVERY_OVERPASS_ENDPOINT:`http://127.0.0.1:${mockPort}/cap/api/interpreter`,DISCOVERY_DAILY_CAP:'3'},async api=>{
  const camp=await mkCampaign(api);
  const body={campaignId:camp.id,bbox:'51.4,-0.3,51.7,0.1',categories:['clinic'],dryRun:false,limit:50};
  let r=await submitAndWait(api,'/api/discovery/run',{method:'POST',body:JSON.stringify(body)});
  ok(r.data.importedCount===3,'P5 first live run imports exactly the daily cap (3)',JSON.stringify(r.data.importedCount));
  r=await submitAndWait(api,'/api/discovery/run',{method:'POST',body:JSON.stringify({...body,requestId:'second-cap-attempt'})});
  ok(r.status>=400&&/cap/i.test(r.data.error||''),'P5 second run same day is refused: cap cannot be bypassed by repeated runs');
  ok((await api('/api/prospects')).data.length===3,'P5 vault holds exactly cap-many prospects');
  const dry=await submitAndWait(api,'/api/discovery/run',{method:'POST',body:JSON.stringify({...body,dryRun:true})});
  ok(dry.status===200&&dry.data.importedCount===0,'P5 dry runs still allowed after cap is exhausted and import nothing');
});

// ================= P5b: concurrent runs racing the cap =================
await withApp({DISCOVERY_OVERPASS_ENDPOINT:`http://127.0.0.1:${mockPort}/conc/api/interpreter`,DISCOVERY_DAILY_CAP:'3'},async api=>{
  const camp=await mkCampaign(api);
  const body={campaignId:camp.id,bbox:'51.4,-0.3,51.7,0.1',categories:['clinic'],dryRun:false,limit:50};
  const [a,b]=await Promise.all([
    submitAndWait(api,'/api/discovery/run',{method:'POST',body:JSON.stringify({...body,requestId:'race-a'})}),
    submitAndWait(api,'/api/discovery/run',{method:'POST',body:JSON.stringify({...body,requestId:'race-b'})})
  ]);
  const total=(await api('/api/prospects')).data.length;
  ok(total<=3,`P5b two overlapping live runs cannot exceed the daily cap (imported ${total}/3)`,JSON.stringify({a:a.data.importedCount??a.data.error,b:b.data.importedCount??b.data.error}));
});

// ================= P7: discovery never enables sending =================
await withApp({
  DISCOVERY_OVERPASS_ENDPOINT:`http://127.0.0.1:${mockPort}/fixture/api/interpreter?${fixturePort}`,
  DISCOVERY_DAILY_CAP:'10',ALLOW_LOCAL_FIXTURES:'true',CHROMIUM_PATH:'/usr/bin/chromium'
},async api=>{
  const camp=await mkCampaign(api,{autoSend:false});
  const r=await submitAndWait(api,'/api/discovery/run',{method:'POST',body:JSON.stringify({campaignId:camp.id,bbox:'51.4,-0.3,51.7,0.1',categories:['clinic'],dryRun:false})});
  ok(r.data.importedCount===2,'P7 setup: 2 local prospects imported for research');
  await api('/api/run',{method:'POST',body:JSON.stringify({limit:5})});
  let sum;for(let i=0;i<80;i++){sum=(await api('/api/summary')).data;if(sum.queued===0&&!sum.running)break;await wait(500);}
  const pros=(await api('/api/prospects')).data;
  ok(pros.every(x=>['ready','research-complete','rejected','error'].includes(x.status))&&sum.sent===0,
    'P7 researched discovery prospects never reach "sent" while autoSend is false and no inbox is connected',JSON.stringify(pros.map(x=>x.status)));
  const camps=(await api('/api/campaigns')).data;
  ok(camps.every(c=>c.systemKey||c.autoSend===false),'P7 discovery run did not flip any campaign autoSend flag');
});

// ================= P7b/P5c: scheduled autopilot path =================
{
  const preSeed={version:4,prospects:[],campaigns:[{id:'camp_sched',name:'Scheduled',niche:'clinics',offer:'audit',allowedCountries:[],minScore:50,dailyCaps:{A:0,B:0},maxFollowups:0,autoSend:false,approved:true,createdAt:new Date().toISOString()}],jobs:[],messages:[],replies:[],suppressions:[],socialTasks:[],accounts:[],auditLog:[],settings:{},leads:[],orders:[],subscriptions:[],monitoringRuns:[],notifications:[],revenueEvents:[],discoveryRuns:[]};
  await withApp({
    AUTOPILOT_ENABLED:'true',DISCOVERY_ENABLED:'true',DISCOVERY_DRY_RUN:'false',
    DISCOVERY_CAMPAIGN_ID:'camp_sched',DISCOVERY_BBOX:'51.4,-0.3,51.7,0.1',DISCOVERY_CATEGORIES:'clinic,dentist',
    DISCOVERY_OVERPASS_ENDPOINT:`http://127.0.0.1:${mockPort}/default/api/interpreter`,DISCOVERY_DAILY_CAP:'3',
    ALLOW_LOCAL_FIXTURES:'true',CHROMIUM_PATH:'/usr/bin/chromium'
  },async(api,getLogs)=>{
    let run=null;for(let i=0;i<40;i++){const runs=(await api('/api/discovery-runs')).data;run=runs.find(x=>x.scheduled&&x.status==='completed');if(run)break;await wait(300);}
    ok(!!run&&run.importedCount===2&&run.campaignId==='camp_sched','P7b scheduled discovery runs under the approved campaign and respects the cap',JSON.stringify(run&&{imp:run.importedCount,sched:run.scheduled}));
    const sum=(await api('/api/summary')).data;
    ok(sum.sent===0&&(await api('/api/campaigns')).data.every(c=>c.autoSend===false),'P7b scheduled discovery did not send email or enable sending');
    ok(sum.discovery&&sum.discovery.importedToday===2,'P10 summary discovery counters reflect the scheduled import');
  },preSeed);
}

mock.close();fixture.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
