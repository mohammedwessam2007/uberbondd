const {test}=require('node:test');const assert=require('node:assert/strict');
const {createHmac}=require('node:crypto');
const {fetch,__testing}=require('../services/uberwarm-canonical-neon-function/index.cjs');
const secret='whsec_fixture_not_real_a_very_long_secret';
const req=(body,stamp=String(Math.floor(Date.now()/1000)),sig=null)=>new Request('https://fixture.example/neon',{method:'POST',headers:{'content-type':'application/json','x-winnr-timestamp':stamp,'x-winnr-signature':sig??'v1='+createHmac('sha256',secret).update(stamp+'.').update(body).digest('hex')},body});
test('raw HMAC accepts exact message, refuses edited bytes, expired timestamps and forged signatures',()=>{
 const body=JSON.stringify({object:'event',id:'evt_abc',type:'email.bounced',data:{recipient:'fixture@agency.example'}});
 const actual=req(body);
 assert.equal(__testing.signed(Buffer.from(body),actual,secret),true);
 assert.equal(__testing.signed(Buffer.from(body+' '),actual,secret),false);
 assert.equal(__testing.signed(Buffer.from(body),req(body,String(Math.floor(Date.now()/1000)-400)),secret),false);
 assert.equal(__testing.signed(Buffer.from(body),req(body,undefined,'v1='+'f'.repeat(64)),secret),false);
});
test('guards valid recipient, IDs and normalizes lowercase requirement',()=>{
 assert.equal(__testing.validEmail('fixture@agency.example'),true);
 for(const x of ['Admin@agency.example','nonmail','x@localhost','x@.invalid','x@y.z\r\n'])assert.equal(__testing.validEmail(x),false);
 assert.equal(__testing.validId('evt_abc.012-rr'),true);assert.equal(__testing.validId('\nzzz'),false);
});
test('no usable production secret means hard fail; no mail can be sent',async()=>{
 const oldKey=process.env.WINNR_WEBHOOK_SECRET,oldDb=process.env.DATABASE_URL;
 delete process.env.WINNR_WEBHOOK_SECRET;delete process.env.DATABASE_URL;
 try{
  let r=await fetch(req('{}'));assert.equal(r.status,503);assert.equal((await r.json()).status,'UNCONFIGURED');
  r=await fetch(new Request('https://fixture.example',{method:'PUT'}));assert.equal(r.status,405);
  r=await fetch(new Request('https://fixture.example'));assert.equal(r.status,200);const j=await r.json();
  assert.equal(j.outboundAuthority,'NONE');assert.equal(j.databaseReadback,false);assert.equal(j.canonicalSuppressionReconciled,false);
 }finally{if(oldKey!==undefined)process.env.WINNR_WEBHOOK_SECRET=oldKey;if(oldDb!==undefined)process.env.DATABASE_URL=oldDb;}
});
