import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {createHmac} from 'node:crypto';
import nodeWinnr,{createFetchHandler} from '../api/webhooks/winnr.mjs';
import nodeUnsubscribe,{createHandlers} from '../api/unsubscribe.mjs';
import {createUberWarmNodeBridge} from '../src/uberwarm-vercel-node-bridge.mjs';
function makeReq({method='GET',url='/',headers={},body=null}={}){
 const stream=Readable.from(body===null?[]:[Buffer.from(body)]);
 stream.method=method;stream.url=url;stream.headers=headers;return stream;
}
async function execute(handler,request){let value=null;const headers={};const response={statusCode:200,
 setHeader(k,v){headers[k.toLowerCase()]=v;},end(bytes){value=Buffer.from(bytes||'').toString('utf8');}};
 await handler(request,response);return {status:response.statusCode,body:value,headers};}

test('Vercel default handlers are functions, explicit raw-body bypass configured',async()=>{
 assert.equal(typeof nodeWinnr,'function');assert.equal(typeof nodeUnsubscribe,'function');
 const {config}=await import('../api/webhooks/winnr.mjs');
 assert.equal(config.api.bodyParser,false);
});

test('Vercel bridge preserves raw signed bytes, signature and rejects changed payload',async()=>{
 const secret='whsec_delegated_test_123',stamp='1792432800';let called=0;
 const handler=createUberWarmNodeBridge(createFetchHandler({
 env:{WINNR_WEBHOOK_SECRET:secret,DATABASE_URL:'fixture'},clock:()=>1792432800000,
 poolFactory:()=>({}),persist:async()=>{called++;return {status:'RECORDED_NO_SUPPRESSION',duplicate:false,suppressionHeld:false};}
 }));
 const raw=' { "object":"event", "id":"evt_1", "type":"domain.ready", "data":{} } ';
 const sign=x=>'v1='+createHmac('sha256',secret).update(stamp+'.'+x).digest('hex');
 const headers={'x-winnr-timestamp':stamp,'x-winnr-signature':sign(raw)};
 const accepted=await execute(handler,makeReq({method:'POST',url:'/api/webhooks/winnr',headers,body:raw}));
 assert.equal(accepted.status,200);assert.equal(called,1);
 const rejected=await execute(handler,makeReq({method:'POST',url:'/api/webhooks/winnr',headers,body:raw+' '}));
 assert.equal(rejected.status,401);assert.equal(called,1);
});

test('malformed HTTP methods and oversized raw bodies fail before any provider or DB effect',async()=>{
 let effects=0;
 const bridge=createUberWarmNodeBridge(async()=>{effects++;return Response.json({ok:true});},{maxBodyBytes:10});
 const big=await execute(bridge,makeReq({method:'POST',body:'x'.repeat(11)}));
 const invalid=await execute(bridge,makeReq({method:'PUT'}));
 assert.equal(big.status,413);assert.equal(invalid.status,405);assert.equal(effects,0);
});

test('default Node unsubscribe endpoint renders a GET without altering suppression',async()=>{
 const env={UBERWARM_UNSUBSCRIBE_SECRET:'secret_1234567890123456789012345678901234567890',DATABASE_URL:'fixture'};
 const {createUberWarmUnsubscribeToken}=await import('../src/uberwarm-unsubscribe.mjs');
 const token=createUberWarmUnsubscribeToken({recipientEmail:'hello@agency.example',secret:env.UBERWARM_UNSUBSCRIBE_SECRET});
 let effects=0;
 const handlers=createHandlers({env,poolFactory:()=>({}),persist:async()=>{effects++;return {ok:true};}});
 const app=createUberWarmNodeBridge(req=>req.method==='POST'?handlers.POST(req):handlers.GET(req));
 const uri='/api/unsubscribe?token='+encodeURIComponent(token);
 const get=await execute(app,makeReq({method:'GET',url:uri}));
 assert.equal(get.status,200);assert.equal(effects,0);assert.doesNotMatch(get.body,/hello@agency/);
 const post=await execute(app,makeReq({method:'POST',url:uri,body:'List-Unsubscribe=One-Click'}));
 assert.equal(post.status,200);assert.equal(effects,1);
});
