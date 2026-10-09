import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {parseDirectClaudeImports,auditDirectClaudeImports} from '../scripts/ubermind-startup-context-audit.mjs';

test('W28 parses unique direct import paths without claiming recursively loaded context',()=>{
 assert.deepEqual(parseDirectClaudeImports('# root\n@AGENTS.md\n@docs/canon.md\n@AGENTS.md\nplain mention @notes.md'),[
  'AGENTS.md','docs/canon.md']);
});
test('W28 measures exact byte footprint and hashes without exposing document bodies',async()=>{
 const root=await mkdtemp(join(tmpdir(),'ubermind-context-'));
 try{
  await mkdir(join(root,'docs'));
  await writeFile(join(root,'CLAUDE.md'),'# Root\n@AGENTS.md\n@docs/canon.md\n');
  await writeFile(join(root,'AGENTS.md'),'Law: keep all original sources');
  await writeFile(join(root,'docs/canon.md'),'890 sources still intact');
  const r=await auditDirectClaudeImports({repoRoot:root});
  assert.equal(r.directImportCount,2);
  assert.equal(r.rootPlusDirectImportBytes,r.rootBytes+r.directImportBytes);
  assert.ok(r.paths.every(x=>x.sha256.length===64));
  assert.equal(r.liveClaudeContextTokens,null);
  assert.equal(r.expandedRecursiveImportsMeasured,false);
  assert.equal(r.externalEffectAuthority,'NONE');
  assert.equal(JSON.stringify(r).includes('keep all original sources'),false);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('W28 refuses path escaping root and external import paths',async()=>{
 const root=await mkdtemp(join(tmpdir(),'ubermind-escape-'));
 try{
  await writeFile(join(root,'CLAUDE.md'),'@../outside.md\n');
  await assert.rejects(()=>auditDirectClaudeImports({repoRoot:root}),/import-path-escape/);
  await writeFile(join(root,'CLAUDE.md'),'@~/private.md\n');
  await assert.rejects(()=>auditDirectClaudeImports({repoRoot:root}),/external-or-ambiguous/);
 }finally{await rm(root,{recursive:true,force:true});}
});
