// Local acceptance test, never a production pairing or economic receipt.
import {webkit,devices} from 'playwright';
import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {Store} from '../src/store.mjs';
const root=await fs.mkdtemp(path.join(os.tmpdir(),'revenue-webkit-'));
const token='local-test-owner-session-only-00000001';
const base='http://127.0.0.1:39461';
const store=new Store(root);await store.init();
await store.add('prospects',{id:'webkit-xss-fixture',company:'<img src=x onerror="window.prospectXss=true">',website:'https://fixture.example',domain:'fixture.example',source:'public_website',createdAt:new Date().toISOString()});
let server,browser;let logs='';
async function start(){server=spawn(process.execPath,['server-core.mjs'],{env:{...process.env,NODE_ENV:'test',STORE_BACKEND:'json',DATA_DIR:root,PORT:'39461',PROCESS_ROLE:'web',ADMIN_TOKEN:token,AUTOPILOT_ENABLED:'false',REVENUE_REAL_CANARY:'0'},stdio:['ignore','pipe','pipe']});server.stdout.on('data',d=>logs+=d);server.stderr.on('data',d=>logs+=d);for(let i=0;i<100;i++){try{if((await fetch(base+'/api/health')).ok)return;}catch{}await new Promise(r=>setTimeout(r,100));}throw new Error('LOCAL_SERVER_NOT_READY:'+logs.slice(-1500));}
async function stop(){if(!server)return;server.kill('SIGTERM');await new Promise(r=>server.once('exit',r));server=null;}
try{
 await start();browser=await webkit.launch();const ctx=await browser.newContext({...devices['iPad Pro 11'],viewport:{width:1194,height:834}});const p=await ctx.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto(base+'/constellation.html');await p.locator('#owner-token').fill(token);await p.locator('#auth-form button').click();await p.locator('#owner-session-badge').waitFor();assert.equal(await p.locator('#auth').isHidden(),true);
 const cookie=(await ctx.cookies()).find(c=>c.name==='ub_owner');assert.ok(cookie.httpOnly);assert.equal(cookie.sameSite,'Strict');
 const second=await ctx.newPage();await second.goto(base+'/constellation.html');await second.locator('#owner-session-badge').waitFor();await second.locator('#auth').waitFor({state:'hidden'});assert.equal(await second.locator('#owner-token').inputValue(),'');assert.equal(await second.evaluate(()=>Object.keys(localStorage).some(k=>/token|session/i.test(k))),false);
 for(const name of ['Money','Demand','Proof','Outreach','Reliability','Infrastructure']){await second.getByRole('button',{name,exact:true}).click();}
 await second.locator('#gs-plan').click();await second.waitForFunction(()=>document.querySelector('#gs-state').textContent==='NOTHING_TO_AUTHORIZE');assert.equal(await second.locator('#gs-authorize').isDisabled(),true);
 // Touch PointerEvents exercise the actual app handlers and pinch threshold.
 await second.locator('#cv').evaluate(cv=>{const fire=(type,id,x,y)=>cv.dispatchEvent(new PointerEvent(type,{pointerId:id,pointerType:'touch',clientX:x,clientY:y,bubbles:true}));fire('pointerdown',1,300,200);fire('pointerdown',2,500,200);fire('pointermove',2,650,200);fire('pointerup',2,650,200);fire('pointerup',1,300,200);});
 assert.equal(await second.evaluate(()=>window.prospectXss===true),false);assert.equal(await second.locator('img[src="x"]').count(),0);assert.deepEqual(errors,[]);
 await second.screenshot({path:path.join(root,'webkit-ipad-local-acceptance.png')});
 await second.locator('#owner-session-badge').click();await second.locator('#auth').waitFor({state:'visible'});await stop();await start();await ctx.addCookies([cookie]);const revived=await ctx.request.get(base+'/api/owner-session/status');const state=await revived.json();assert.equal(state.active,false);assert.equal(state.reason,'REVOKED');
 console.log(JSON.stringify({state:'WEBKIT_IPAD_LOCAL_ACCEPTANCE_PASSED',engine:'WebKit',physicalSafari:false,ownerPairingAndReload:true,logoutSurvivesRestart:true,semanticLensControls:true,touchPinchHandlers:true,noXss:true,oneButtonStopsBeforeAuthority:true,noExternalEffects:true,screenshot:path.join(root,'webkit-ipad-local-acceptance.png')}));
}finally{if(browser)await browser.close();await stop();}
