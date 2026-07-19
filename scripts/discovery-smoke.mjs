import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';

const appPort=8191;
const mockPort=8192;
const dataDir=await fs.mkdtemp(path.join(os.tmpdir(),'ub-discovery-smoke-'));
const mockPayload={elements:[
  {type:'node',id:101,lat:51.5,lon:-0.1,tags:{name:'Atlas Clinic',amenity:'clinic',website:'https://atlas.example.com'}},
  {type:'node',id:102,lat:51.51,lon:-0.11,tags:{name:'No Site Clinic',amenity:'clinic'}},
  {type:'way',id:103,center:{lat:51.52,lon:-0.12},tags:{name:'Nova Dental',amenity:'dentist','contact:website':'https://nova.example.com'}}
]};
const mock=http.createServer(async(req,res)=>{
  if(req.method!=='POST'){res.writeHead(405);return res.end();}
  let body='';for await(const chunk of req)body+=chunk;
  if(!body.startsWith('data=')){res.writeHead(400);return res.end('missing query');}
  res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(mockPayload));
});
await new Promise(resolve=>mock.listen(mockPort,'127.0.0.1',resolve));

const child=spawn(process.execPath,['server.mjs'],{
  cwd:path.resolve(new URL('..',import.meta.url).pathname),
  env:{...process.env,PORT:String(appPort),APP_BASE_URL:`http://127.0.0.1:${appPort}`,DATA_DIR:dataDir,SCREENSHOT_DIR:path.join(dataDir,'screenshots'),AUTOPILOT_ENABLED:'false',DISCOVERY_OVERPASS_ENDPOINT:`http://127.0.0.1:${mockPort}/api/interpreter`,DISCOVERY_DAILY_CAP:'10',DISCOVERY_MAX_BBOX_SPAN:'5'},
  stdio:['ignore','pipe','pipe']
});
let logs='';child.stdout.on('data',d=>logs+=d);child.stderr.on('data',d=>logs+=d);
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function api(pathname,options={}){
  const response=await fetch(`http://127.0.0.1:${appPort}${pathname}`,{...options,headers:{'content-type':'application/json',...(options.headers||{})}});
  const data=await response.json();if(!response.ok)throw new Error(`${response.status}: ${data.error||JSON.stringify(data)}`);return data;
}
async function waitForJob(jobId,{timeoutMs=15000}={}){
  const deadline=Date.now()+timeoutMs;
  while(Date.now()<deadline){
    const jobs=await api('/api/jobs');
    const job=jobs.find(item=>item.id===jobId);
    if(job?.status==='completed')return job.result||{};
    if(job?.status==='dead-letter')throw new Error(`Job ${jobId} dead-lettered: ${job.lastError||'unknown error'}`);
    await wait(100);
  }
  throw new Error(`Timed out waiting for job ${jobId}`);
}
try{
  for(let i=0;i<40;i++){try{await api('/api/health');break}catch{await wait(100)}}
  const campaign=await api('/api/campaigns',{method:'POST',body:JSON.stringify({
    campaignId:'discovery-smoke',name:'Discovery smoke',niche:'clinics',countries:['GB'],cities:['London'],
    boundingBoxes:[[51.4,-0.3,51.7,0.1]],discoveryCategories:['clinic','dentist'],minimumProspectScore:60,
    minimumEvidenceConfidence:0.8,dailyDiscoveryCap:10,dailyAuditCap:10,dailyDraftCap:10,dailySendCap:0,
    hourlySendCap:0,allowedInboxes:[],businessHourStart:9,businessHourEnd:17,maximumFollowups:0,
    followupDelayDays:5,offer:'Evidence-backed audit',callToAction:'Would an outline be useful?',
    subjectVariants:['A website issue'],messageVariants:['One evidence-backed issue and one CTA.'],
    suppressionKeywords:['unsubscribe'],prohibitedClaims:['guaranteed revenue'],dryRun:true,autoSend:false,enabled:true
  })});
  const previewQueued=await api('/api/discovery/run',{method:'POST',body:JSON.stringify({campaignId:campaign.id,limit:10,dryRun:true})});
  const preview=await waitForJob(previewQueued.jobId);
  if(preview.discoveredCount!==2||preview.importedCount!==0)throw new Error(`Unexpected preview: ${JSON.stringify(preview)}`);
  const importedQueued=await api('/api/discovery/run',{method:'POST',body:JSON.stringify({campaignId:campaign.id,limit:10,dryRun:false})});
  const imported=await waitForJob(importedQueued.jobId);
  if(imported.importedCount!==2)throw new Error(`Unexpected import: ${JSON.stringify(imported)}`);
  const prospects=await api('/api/prospects');
  if(prospects.length!==2||prospects.some(p=>p.source!=='openstreetmap'))throw new Error(`Unexpected prospects: ${JSON.stringify(prospects)}`);
  console.log(JSON.stringify({ok:true,preview:preview.discoveredCount,imported:imported.importedCount,companies:prospects.map(p=>p.company)},null,2));
}finally{
  child.kill('SIGTERM');mock.close();await fs.rm(dataDir,{recursive:true,force:true});
}
