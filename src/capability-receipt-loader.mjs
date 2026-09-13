import fs from 'node:fs';
import path from 'node:path';

export function loadCapabilityReceipts({rootDir='.',relativePath='artifacts/capability-reality/observed.json'}={}){
  const root=path.resolve(rootDir);
  const target=path.resolve(root,relativePath);
  if(!target.startsWith(`${root}${path.sep}`))return {ok:false,status:'CAPABILITY_RECEIPTS_REFUSED',reasonCodes:['path-outside-root'],receipts:[]};
  if(!fs.existsSync(target))return {ok:true,status:'CAPABILITY_RECEIPTS_ABSENT',receipts:[]};
  const stat=fs.lstatSync(target);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size>262144)return {ok:false,status:'CAPABILITY_RECEIPTS_REFUSED',reasonCodes:['bounded-regular-file-required'],receipts:[]};
  let value;try{value=JSON.parse(fs.readFileSync(target,'utf8'));}catch{return {ok:false,status:'CAPABILITY_RECEIPTS_REFUSED',reasonCodes:['valid-json-required'],receipts:[]};}
  if(value?.schemaVersion!=='uberbond.capability-reality.receipts.v1'||!Array.isArray(value.receipts)||value.receipts.length>64)return {ok:false,status:'CAPABILITY_RECEIPTS_REFUSED',reasonCodes:['recognized-schema-required'],receipts:[]};
  return {ok:true,status:'CAPABILITY_RECEIPTS_LOADED',receipts:value.receipts};
}
