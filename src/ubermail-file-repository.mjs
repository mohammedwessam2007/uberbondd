import fs from 'node:fs/promises';
import path from 'node:path';

export const UBERMAIL_FILE_REPOSITORY_VERSION='uberbond.ubermail-file-repository.v1';

function clone(value){return value==null?value:structuredClone(value);}
async function readJson(file){try{return JSON.parse(await fs.readFile(file,'utf8'));}catch(error){if(error?.code==='ENOENT')return null;throw error;}}

export function createFileUberMailRepository({filePath}={}){
  const target=path.resolve(String(filePath||'').trim());
  if(!filePath||target===path.parse(target).root)throw new TypeError('safe UberMail state file path required');
  let tail=Promise.resolve();
  async function load(){return clone(await readJson(target));}
  async function save(value){
    const run=tail.then(async()=>{
      await fs.mkdir(path.dirname(target),{recursive:true,mode:0o700});
      const temp=`${target}.${process.pid}.${Date.now()}.tmp`;
      const bytes=JSON.stringify(value,null,2)+'\n';
      await fs.writeFile(temp,bytes,{encoding:'utf8',mode:0o600,flag:'wx'});
      await fs.rename(temp,target);
      await fs.chmod(target,0o600).catch(()=>{});
      return clone(value);
    });
    tail=run.catch(()=>undefined);
    return run;
  }
  return {load,save,async snapshot(){return load();},filePath:target,version:UBERMAIL_FILE_REPOSITORY_VERSION};
}
