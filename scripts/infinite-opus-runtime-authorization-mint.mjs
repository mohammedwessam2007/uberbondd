import fs from 'node:fs';
import path from 'node:path';

const arg=name=>{const i=process.argv.indexOf(name);return i>=0?process.argv[i+1]:null;};
const fail=(reason)=>{console.error(JSON.stringify({ok:false,status:'RUNTIME_AUTHORIZATION_REFUSED',reason,spendPerformed:false},null,2));process.exit(2);};
const inputPath=arg('--input'),outputPath=arg('--output');
if(!inputPath)fail('private-input-required');
let input;try{input=JSON.parse(fs.readFileSync(path.resolve(inputPath),'utf8'));}catch(e){fail('input-read-failed:'+e.message);}
const now=Date.now(),month=new Date(now).toISOString().slice(0,7);
if(input?.schemaVersion!=='uberbond.infinite-opus.runtime-authorization-request.v1'||input.ownerApproved!==true)fail('explicit-owner-approval-required');
if(typeof input.authorizationId!=='string'||input.authorizationId.length<8||input.authorizationId.length>256)fail('bounded-authorization-id-required');
if(input.month!==month)fail('current-month-required');
if(Number(input.maximumMonthlySpendUsd)!==20)fail('canonical-runtime-cap-must-be-exactly-20-usd');
if(!Number.isFinite(Date.parse(input.expiresAt))||Date.parse(input.expiresAt)<=now)fail('future-expiry-required');
if(!Array.isArray(input.crownRoutes)||input.crownRoutes.length!==1||input.crownRoutes[0]!=='openrouter:anthropic/claude-opus-5.5')fail('exact-general-crown-route-required');
if(!Array.isArray(input.externalEffects)||input.externalEffects.length)fail('zero-external-effect-authority-required');
const receipt={
 evidenceRef:input.authorizationId,month,maxMonthlyMicrousd:20_000_000,
 expiresAt:input.expiresAt,crownRoutes:['openrouter:anthropic/claude-opus-5.5']
};
if(outputPath)fs.writeFileSync(path.resolve(outputPath),JSON.stringify(receipt,null,2)+'\n',{mode:0o600});
console.log(JSON.stringify({ok:true,status:'RUNTIME_PAID_AUTHORIZATION_MINTED',receipt,spendPerformed:false,externalEffectAuthority:'NONE',
 truthBoundary:'This receipt authorizes only the bounded cognition budget and admitted Crown route. It performs no provider call and grants no Crown semantic authority.'},null,2));
