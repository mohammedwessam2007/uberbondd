import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const UBERCLOUD_CONTABO_PREFLIGHT_VERSION='uberbond.ubercloud-contabo-preflight.v1';
const zero=()=>structuredClone(ZERO_EXTERNAL_EFFECTS);
const text=(v,m=1000)=>{const s=String(v??'').trim();return s&&s.length<=m?s:null;};
const integer=(v,min=1,max=Number.MAX_SAFE_INTEGER)=>{const n=Number(v);return Number.isSafeInteger(n)&&n>=min&&n<=max?n:null;};
const fail=(reasonCodes,extra={})=>({ok:false,status:'CONTABO_MAIL_CELL_PREFLIGHT_BLOCKED',reasonCodes:[...new Set(reasonCodes.filter(Boolean))],businessEffectAuthority:'NONE',spendAuthority:'NONE',deploymentAuthority:'NONE',externalEffectLedger:zero(),...extra});

function normalizeImage(raw={}){
  const imageId=text(raw.imageId??raw.id,200);
  const name=text(raw.name??raw.displayName,300);
  const version=text(raw.version,120);
  const osType=text(raw.osType??raw.type,80)?.toLowerCase();
  const standard=raw.standardImage===true||raw.standard===true||String(raw.imageType||'').toLowerCase()==='standard';
  return{imageId,name,version,osType,standard};
}
function normalizeSecret(raw={}){
  const secretId=integer(raw.secretId??raw.id);
  const name=text(raw.name,255);
  const type=text(raw.type,40)?.toLowerCase();
  return{secretId,name,type};
}
function ubuntuScore(image){
  if(!image.imageId||!image.name)return -1;
  const label=`${image.name} ${image.version||''}`.toLowerCase();
  if(!label.includes('ubuntu'))return -1;
  if(image.osType&&image.osType!=='linux')return -1;
  if(image.standard===false)return -1;
  if(label.includes('24.04'))return 300;
  if(label.includes('22.04'))return 250;
  if(label.includes('24'))return 220;
  if(label.includes('22'))return 200;
  return 100;
}
function sshScore(secret){
  if(secret.secretId==null||secret.type!=='ssh')return -1;
  const name=String(secret.name||'').toLowerCase();
  if(name.includes('uberbond'))return 300;
  if(name.includes('default'))return 200;
  return 100;
}

export function selectContaboMailCellInputs({images=[],secrets=[],preferredRegion='EU'}={}){
  const region=text(preferredRegion,40)||'EU';
  const imageRows=(Array.isArray(images)?images:[]).map(normalizeImage).map(row=>({...row,score:ubuntuScore(row)})).filter(row=>row.score>=0).sort((a,b)=>b.score-a.score||String(a.name).localeCompare(String(b.name))||String(a.imageId).localeCompare(String(b.imageId)));
  const secretRows=(Array.isArray(secrets)?secrets:[]).map(normalizeSecret).map(row=>({...row,score:sshScore(row)})).filter(row=>row.score>=0).sort((a,b)=>b.score-a.score||String(a.name).localeCompare(String(b.name))||a.secretId-b.secretId);
  const reasons=[];
  if(!imageRows.length)reasons.push('standard-ubuntu-image-required');
  if(!secretRows.length)reasons.push('existing-ssh-key-secret-required');
  if(reasons.length)return fail(reasons,{observed:{imageCandidates:imageRows.map(({score,...row})=>row),sshKeyCandidates:secretRows.map(({score,...row})=>row),preferredRegion:region}});
  const selectedImage=imageRows[0],selectedSecret=secretRows[0];
  const selection={regionId:region,imageId:selectedImage.imageId,imageName:selectedImage.name,imageVersion:selectedImage.version||null,sshKeySecretId:selectedSecret.secretId,sshKeyName:selectedSecret.name||null,productId:'V153',productName:'Cloud VPS 4'};
  return{ok:true,status:'CONTABO_MAIL_CELL_PREFLIGHT_READY',selection,candidates:{images:imageRows.map(({score,...row})=>row),sshKeys:secretRows.map(({score,...row})=>row)},businessEffectAuthority:'NONE',spendAuthority:'NONE',deploymentAuthority:'NONE',externalEffectLedger:zero(),truthBoundary:'This receipt is read-only account metadata selection. It does not expose secret values, quote a price, authorize spend, create an instance, alter PTR, or prove physical runtime readiness.'};
}

export async function discoverContaboMailCellInputs({client,preferredRegion='EU'}={}){
  if(!client||typeof client.listImages!=='function'||typeof client.listSecrets!=='function')return fail(['contabo-read-only-discovery-client-required']);
  let images,secrets;
  try{[images,secrets]=await Promise.all([client.listImages(),client.listSecrets({type:'ssh'})]);}
  catch(error){return fail(['contabo-account-metadata-read-failed'],{errorClass:error?.name||'Error'});}
  const selected=selectContaboMailCellInputs({images:images?.items??images?.data??images,secrets:secrets?.items??secrets?.data??secrets,preferredRegion});
  if(!selected.ok)return selected;
  return{...selected,externalEffectLedger:{...zero(),providerCalls:2},truthBoundary:'This receipt proves only two read-only Contabo account metadata calls and deterministic local selection. It does not expose secret values, authorize spend, or mutate provider state.'};
}

export function createContaboPreflightClient({clientId,clientSecret,apiUser,apiPassword,fetchFn=globalThis.fetch,requestId=()=>crypto.randomUUID()}={}){
  const cid=text(clientId,500),secret=text(clientSecret,1000),user=text(apiUser,500),password=text(apiPassword,1000);
  if(!cid||!secret||!user||!password||typeof fetchFn!=='function')throw new Error('contabo-runtime-credentials-and-fetch-required');
  let token=null;
  async function accessToken(){
    if(token)return token;
    const body=new URLSearchParams({client_id:cid,client_secret:secret,username:user,password,grant_type:'password'});
    const response=await fetchFn('https://auth.contabo.com/auth/realms/contabo/protocol/openid-connect/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body});
    if(!response?.ok)throw new Error(`contabo-auth-failed:${response?.status??'unknown'}`);
    const json=await response.json();token=text(json?.access_token,10_000);if(!token)throw new Error('contabo-access-token-required');return token;
  }
  const headers=async()=>({authorization:`Bearer ${await accessToken()}`,'content-type':'application/json','x-request-id':requestId()});
  async function read(url){const response=await fetchFn(url,{method:'GET',headers:await headers()});if(!response?.ok)throw new Error(`contabo-read-failed:${response?.status??'unknown'}`);const json=await response.json();return Array.isArray(json?.data)?json.data:[];}
  return{
    async listImages(){return read('https://api.contabo.com/v1/compute/images?standardImage=true&name=Ubuntu&size=100');},
    async listSecrets({type='ssh'}={}){return read(`https://api.contabo.com/v1/secrets?type=${encodeURIComponent(type)}&size=100`);}
  };
}
