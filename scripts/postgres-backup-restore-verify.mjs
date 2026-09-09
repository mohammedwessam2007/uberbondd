#!/usr/bin/env node
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {independentlyVerifyPostgresBackupRestoreReceipt} from '../src/postgres-backup-restore-verifier.mjs';

const [inputPath,verifierRef,verificationEvidenceRef,outputPath]=process.argv.slice(2);
if(!inputPath||!verifierRef||!verificationEvidenceRef){
  console.error('usage: postgres-backup-restore-verify <observed-receipt.json> <verifier-ref> <verification-evidence-ref> [verified-receipt.json]');
  process.exit(2);
}
let observedReceipt;
try{observedReceipt=JSON.parse(readFileSync(resolve(inputPath),'utf8'));}
catch(error){console.error(JSON.stringify({ok:false,status:'POSTGRES_BACKUP_RESTORE_VERIFICATION_INPUT_UNREADABLE',reason:String(error?.message||error),businessEffectAuthority:'NONE'}));process.exit(2);}
const request=JSON.stringify({observedReceipt,verifierRef,verificationEvidenceRef});
if(/(?:postgres(?:ql)?:\/\/[^\s"']+:[^\s"']+@|DATABASE_URL|ADMIN_TOKEN|BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY|sk-[A-Za-z0-9_-]{16,})/i.test(request)){
  console.error(JSON.stringify({ok:false,status:'POSTGRES_BACKUP_RESTORE_VERIFICATION_INPUT_REFUSED',reasonCodes:['secret-or-credential-shaped-input-prohibited'],businessEffectAuthority:'NONE'}));
  process.exit(2);
}
const verified=independentlyVerifyPostgresBackupRestoreReceipt({observedReceipt,verifierRef,verificationEvidenceRef});
const rendered=`${JSON.stringify(verified,null,2)}\n`;
if(outputPath){const out=resolve(outputPath);mkdirSync(dirname(out),{recursive:true});writeFileSync(out,rendered,'utf8');}
else process.stdout.write(rendered);
process.exitCode=verified.ok===false?2:0;
