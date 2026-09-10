#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { applyAgentCodeChangeSet } from '../src/agent-code-change-applier.mjs';
import { compileSovereignLocalPromotionAdmission, compileSovereignLocalPromotionReceipt } from '../src/sovereign-local-promotion.mjs';
import { compileSovereignReleaseRequest } from '../src/sovereign-release-handoff.mjs';
import { ZERO_EXTERNAL_EFFECTS } from '../src/effect-ledgers.mjs';

const MAX_BYTES = 8_000_000;
const SHA40 = /^[a-f0-9]{40}$/i;
const zeroEffects = () => structuredClone(ZERO_EXTERNAL_EFFECTS);
const text = (value, max = 1000) => String(value ?? '').trim().slice(0, max);
function fail(reasonCodes, status = 'SOVEREIGN_LOCAL_PROMOTION_REFUSED', extra = {}) {
  return { ok:false, status, reasonCodes:[...new Set((reasonCodes || []).filter(Boolean))], signingAuthority:'NONE', deploymentAuthority:'NONE', businessEffectAuthority:'NONE', externalEffectAuthority:'NONE', externalEffectLedger:zeroEffects(), ...extra };
}
function run(executable, args, { cwd, env = process.env, timeoutMs = 30_000 } = {}) {
  return new Promise(resolve => execFile(executable, args, { cwd, env, timeout:timeoutMs, maxBuffer:MAX_BYTES, windowsHide:true }, (error, stdout, stderr) => resolve({ exitCode:typeof error?.code === 'number' ? error.code : (error ? 1 : 0), stdout:String(stdout || ''), stderr:String(stderr || ''), timedOut:Boolean(error?.killed) })));
}
async function readJson(file) {
  try { const stat = await fs.lstat(file); if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_BYTES) return null; const value = JSON.parse(await fs.readFile(file,'utf8')); return value && typeof value === 'object' && !Array.isArray(value) ? value : null; } catch { return null; }
}
async function atomicJson(file, value, mode = 0o640) {
  await fs.mkdir(path.dirname(file), { recursive:true }); const tmp = `${file}.tmp.${process.pid}`;
  await fs.writeFile(tmp, `${JSON.stringify(value,null,2)}\n`, { mode }); await fs.chmod(tmp, mode); await fs.rename(tmp,file);
}
async function realExecutable(value) {
  const configured = text(value, 2000); if (!configured) return null;
  try { const resolved = await fs.realpath(configured); await fs.access(resolved, fs.constants.X_OK); const stat = await fs.lstat(resolved); return stat.isFile() && !stat.isSymbolicLink() ? resolved : null; } catch { return null; }
}
function lines(raw) { return String(raw || '').split(/\r?\n/).map(v => v.trim()).filter(Boolean); }
function sameSet(a,b) { const x=[...new Set(a)].sort(), y=[...new Set(b)].sort(); return x.length===y.length && x.every((v,i)=>v===y[i]); }
async function acquireLock(file) { await fs.mkdir(path.dirname(file), { recursive:true }); const handle = await fs.open(file,'wx',0o600); await handle.writeFile(`${process.pid}\n`); await handle.close(); }

export async function runSovereignLocalPromotion({ env = process.env, runProcess = run } = {}) {
  if (process.platform !== 'linux') return fail(['linux-local-promotion-host-required']);
  const sourceRoot = await fs.realpath(env.UBERBOND_SOURCE_ROOT || process.cwd()).catch(()=>null);
  const promotionRoot = path.resolve(env.UBERBOND_PROMOTION_DIR || '/var/lib/uberbond-promotion');
  const verifiedPath = path.resolve(env.UBERBOND_GOVERNANCE_VERIFIED_PATH || '/var/lib/uberbond-governance/inbox/verified.json');
  const receiptPath = path.join(promotionRoot,'promotion-receipt.json');
  const requestPath = path.join(promotionRoot,'sovereign-release-request.json');
  const lockPath = path.join(promotionRoot,'PROMOTION.lock');
  if (!sourceRoot) return fail(['real-source-repository-required']);
  const git = await realExecutable(env.UBERBOND_GIT_EXECUTABLE || '/usr/bin/git');
  const npm = await realExecutable(env.UBERBOND_NPM_EXECUTABLE || '/usr/bin/npm');
  if (!git) return fail(['trusted-real-git-executable-required']);
  if (!npm) return fail(['trusted-real-npm-executable-required']);
  const deps = await fs.realpath(path.join(sourceRoot,'node_modules')).catch(()=>null);
  if (!deps) return fail(['prepared-node-modules-required']);
  try { await acquireLock(lockPath); } catch (error) { return fail([error?.code==='EEXIST'?'local-promotion-already-running':'local-promotion-lock-failed']); }
  let workspace = null;
  try {
    const headRead = await runProcess(git,['rev-parse','HEAD'],{cwd:sourceRoot,env,timeoutMs:30_000});
    const branchRead = await runProcess(git,['branch','--show-current'],{cwd:sourceRoot,env,timeoutMs:30_000});
    const dirtyRead = await runProcess(git,['status','--porcelain'],{cwd:sourceRoot,env,timeoutMs:30_000});
    const head=text(headRead.stdout,80).toLowerCase(), branch=text(branchRead.stdout,160), clean=dirtyRead.exitCode===0 && lines(dirtyRead.stdout).length===0;
    if (headRead.exitCode!==0 || !SHA40.test(head)) return fail(['exact-current-head-required']);
    if (branchRead.exitCode!==0) return fail(['current-branch-read-failed']);
    const verified = await readJson(verifiedPath); if (!verified) return fail(['regular-independent-verifier-receipt-required']);
    const admission = compileSovereignLocalPromotionAdmission({ verifiedChange:verified, currentHead:head, branchName:branch, worktreeClean:clean });
    if (!admission.ok) return admission;

    workspace = await fs.mkdtemp(path.join(promotionRoot,'stage-'));
    const stage = path.join(workspace,'repo');
    const cloned = await runProcess(git,['clone','--no-hardlinks','--quiet',sourceRoot,stage],{env,timeoutMs:120_000});
    if (cloned.exitCode!==0) return fail(['local-promotion-stage-clone-failed'],'LOCAL_PROMOTION_STAGE_REFUSED',{detail:text(cloned.stderr,500)});
    const checkout = await runProcess(git,['checkout','--quiet','-b','uberbond-local-candidate',head],{cwd:stage,env,timeoutMs:30_000});
    if (checkout.exitCode!==0) return fail(['local-promotion-stage-checkout-failed']);
    await fs.symlink(deps,path.join(stage,'node_modules'),'dir').catch(error=>{ if(error?.code!=='EEXIST') throw error; });
    const applied = await applyAgentCodeChangeSet({ sandboxRoot:stage, changeSet:admission.observedChangeSet, date:new Date() });
    if (!applied?.ok) return fail(applied?.reasonCodes || ['local-promotion-stage-apply-failed'],'LOCAL_PROMOTION_STAGE_REFUSED',{applyStatus:applied?.status || null});

    const verification=[];
    for (const [command,args] of [['npm run check:syntax',['run','check:syntax']],['npm run test:deterministic',['run','test:deterministic']]]) {
      const out=await runProcess(npm,args,{cwd:stage,env,timeoutMs:45*60_000});
      verification.push({command,status:out.exitCode===0?'PASS':'FAIL',exitCode:out.exitCode});
      if(out.exitCode!==0) return fail([`fixed-post-apply-check-failed:${command}`],'LOCAL_PROMOTION_FIXED_GATE_REFUSED',{verification,detail:text(out.stderr || out.stdout,1000)});
    }
    const tracked=await runProcess(git,['diff','--name-only'],{cwd:stage,env,timeoutMs:30_000});
    const untracked=await runProcess(git,['ls-files','--others','--exclude-standard'],{cwd:stage,env,timeoutMs:30_000});
    const observedPaths=[...lines(tracked.stdout),...lines(untracked.stdout)];
    if (tracked.exitCode!==0 || untracked.exitCode!==0 || !sameSet(observedPaths,admission.changedPaths)) return fail(['post-verification-working-tree-must-equal-admitted-change-set'],'LOCAL_PROMOTION_FIXED_GATE_REFUSED',{expectedPaths:admission.changedPaths,observedPaths:[...new Set(observedPaths)].sort()});
    const added=await runProcess(git,['add','--',...admission.changedPaths],{cwd:stage,env,timeoutMs:30_000}); if(added.exitCode!==0) return fail(['local-promotion-stage-add-failed']);
    const cached=await runProcess(git,['diff','--cached','--name-only'],{cwd:stage,env,timeoutMs:30_000}); if(cached.exitCode!==0 || !sameSet(lines(cached.stdout),admission.changedPaths)) return fail(['staged-path-set-mismatch']);
    const diffCheck=await runProcess(git,['diff','--cached','--check'],{cwd:stage,env,timeoutMs:30_000}); if(diffCheck.exitCode!==0) return fail(['staged-diff-check-failed']);
    const committed=await runProcess(git,['-c','user.name=UberBond Sovereign Promoter','-c','user.email=sovereign-promoter@localhost','-c','core.hooksPath=/dev/null','commit','--no-gpg-sign','-m',`UberBond local self-maintenance: ${admission.changeSetId}`],{cwd:stage,env,timeoutMs:120_000});
    if(committed.exitCode!==0) return fail(['local-promotion-candidate-commit-failed'],'LOCAL_PROMOTION_COMMIT_REFUSED',{detail:text(committed.stderr,500)});
    const candidateRead=await runProcess(git,['rev-parse','HEAD'],{cwd:stage,env,timeoutMs:30_000});
    const parentRead=await runProcess(git,['rev-parse','HEAD^'],{cwd:stage,env,timeoutMs:30_000});
    const candidate=text(candidateRead.stdout,80).toLowerCase(), parent=text(parentRead.stdout,80).toLowerCase();
    if(!SHA40.test(candidate)||parent!==head) return fail(['single-parent-candidate-bound-to-admitted-base-required']);
    const stageClean=await runProcess(git,['status','--porcelain'],{cwd:stage,env,timeoutMs:30_000}); if(stageClean.exitCode!==0 || lines(stageClean.stdout).length) return fail(['clean-candidate-stage-required']);

    const liveHead=await runProcess(git,['rev-parse','HEAD'],{cwd:sourceRoot,env,timeoutMs:30_000});
    const liveBranch=await runProcess(git,['branch','--show-current'],{cwd:sourceRoot,env,timeoutMs:30_000});
    const liveDirty=await runProcess(git,['status','--porcelain'],{cwd:sourceRoot,env,timeoutMs:30_000});
    if(text(liveHead.stdout,80).toLowerCase()!==head || text(liveBranch.stdout,160)!=='main' || lines(liveDirty.stdout).length) return fail(['local-main-changed-during-promotion'],'LOCAL_PROMOTION_RACE_REFUSED');
    const fetched=await runProcess(git,['-c','core.hooksPath=/dev/null','fetch','--quiet','--no-tags',stage,'refs/heads/uberbond-local-candidate'],{cwd:sourceRoot,env,timeoutMs:120_000});
    if(fetched.exitCode!==0) return fail(['local-candidate-fetch-failed']);
    const fetchedHead=await runProcess(git,['rev-parse','FETCH_HEAD'],{cwd:sourceRoot,env,timeoutMs:30_000}); if(text(fetchedHead.stdout,80).toLowerCase()!==candidate) return fail(['fetched-candidate-identity-mismatch']);
    const promoted=await runProcess(git,['-c','core.hooksPath=/dev/null','merge','--ff-only','FETCH_HEAD'],{cwd:sourceRoot,env,timeoutMs:120_000});
    if(promoted.exitCode!==0) return fail(['local-main-fast-forward-failed'],'LOCAL_PROMOTION_RACE_REFUSED',{detail:text(promoted.stderr,500)});
    const finalHead=await runProcess(git,['rev-parse','HEAD'],{cwd:sourceRoot,env,timeoutMs:30_000});
    const finalDirty=await runProcess(git,['status','--porcelain'],{cwd:sourceRoot,env,timeoutMs:30_000});
    if(text(finalHead.stdout,80).toLowerCase()!==candidate || lines(finalDirty.stdout).length) return fail(['post-promotion-local-main-verification-failed'],'LOCAL_PROMOTION_POSTCHECK_REFUSED');

    const receipt=compileSovereignLocalPromotionReceipt({ admission, promotionCommitSha:candidate, parentSha:head, verification });
    if(!receipt.ok) return receipt;
    const request=compileSovereignReleaseRequest({ promotionReceipt:receipt });
    if(!request.ok) return fail(request.reasonCodes || ['sovereign-release-request-compilation-failed'],'LOCAL_PROMOTION_RELEASE_HANDOFF_REFUSED',{promotionReceipt:receipt});
    await atomicJson(receiptPath,receipt,0o640); await atomicJson(requestPath,request,0o640);
    const archive=path.join(promotionRoot,'consumed'); await fs.mkdir(archive,{recursive:true});
    const archivedVerified=path.join(archive,`verified-${candidate}.json`); await fs.rename(verifiedPath,archivedVerified).catch(()=>{});
    return { ...receipt, releaseRequestPath:requestPath, releaseRequestDigest:request.requestDigest, releaseRequestStatus:request.status, verifiedReceiptArchive:archivedVerified };
  } catch (error) {
    return fail([`unexpected:${text(error?.message || error,300)}`]);
  } finally {
    if(workspace) await fs.rm(workspace,{recursive:true,force:true}).catch(()=>{});
    await fs.rm(lockPath,{force:true}).catch(()=>{});
  }
}

const direct=Boolean(process.argv[1]) && path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(direct) runSovereignLocalPromotion().then(result=>{process.stdout.write(`${JSON.stringify(result,null,2)}\n`);if(!result?.ok)process.exitCode=2;}).catch(error=>{process.stdout.write(`${JSON.stringify(fail([`unexpected:${text(error?.message,300)}`]),null,2)}\n`);process.exitCode=2;});
