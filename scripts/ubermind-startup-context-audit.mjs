import {readFile} from 'node:fs/promises';
import {resolve,relative,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

export const UBERMIND_CONTEXT_AUDIT_SCHEMA='ubermind.context-direct-import-audit.v1';
export function parseDirectClaudeImports(source){
  if(typeof source!=='string')throw new TypeError('source string required');
  // Report only top-level @path directives; nested imports require a separate
  // traversal. Never pretend this is the exact Claude tokenizer bill.
  return [...new Set(source.split(/\r?\n/)
    .filter(line=>/^@[A-Za-z0-9._/~+-]/.test(line))
    .map(line=>line.slice(1).trim().split(/\s/)[0])
    .filter(Boolean))];
}
const hash=b=>createHash('sha256').update(b).digest('hex');
export async function auditDirectClaudeImports({repoRoot,read=readFile}={}){
 if(typeof repoRoot!=='string'||!repoRoot.trim())throw new TypeError('repoRoot required');
 const root=resolve(repoRoot);
 const rootBuffer=await read(resolve(root,'CLAUDE.md'));
 const rootSource=rootBuffer.toString('utf8');
 const imports=parseDirectClaudeImports(rootSource);
 if(imports.length>64)throw new Error('max-direct-import-count-exceeded');
 const paths=[];
 for(const raw of imports){
   if(raw.startsWith('~')||isAbsolute(raw)||raw.includes('\\'))
     throw new Error('external-or-ambiguous-import-not-audited');
   const target=resolve(root,raw);
   const rel=relative(root,target);
   if(rel==='..'||rel.startsWith('../')||isAbsolute(rel))
     throw new Error('import-path-escape-refused');
   const bytes=await read(target);
   paths.push({path:raw,bytes:bytes.byteLength,sha256:hash(bytes)});
 }
 const directImportBytes=paths.reduce((sum,x)=>sum+x.bytes,0);
 return {
  schema:UBERMIND_CONTEXT_AUDIT_SCHEMA,
  status:'DIRECT_CLAUDE_IMPORT_BYTES_OBSERVED_NOT_PROVIDER_TOKENS',
  rootBytes:rootBuffer.byteLength,
  directImportCount:paths.length,
  directImportBytes,
  rootPlusDirectImportBytes:rootBuffer.byteLength+directImportBytes,
  paths,
  expandedRecursiveImportsMeasured:false,
  liveClaudeContextTokens:null,
  acceptedWorkQualityImpactMeasured:false,
  paidModelInferenceCallsPerformed:0,
  externalEffectAuthority:'NONE'
 };
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
 auditDirectClaudeImports({repoRoot:process.cwd()})
  .then(value=>process.stdout.write(JSON.stringify(value)+'\n'))
  .catch(error=>{process.stderr.write('context-audit-refused: '+error.message+'\n');process.exitCode=1;});
}
