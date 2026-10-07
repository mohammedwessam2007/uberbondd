import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const defaultRoot=path.resolve(here,'..');
const read=(root,p)=>fs.readFileSync(path.join(root,p),'utf8');
const json=(root,p)=>JSON.parse(read(root,p));
const blobSha=buf=>crypto.createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${buf.length}\0`),buf])).digest('hex');

export function auditOpenRouterCanon({root=defaultRoot}={}){
  const failures=[],warnings=[];
  const folder=path.join(root,'open router');
  const names=fs.readdirSync(folder).filter(name=>fs.statSync(path.join(folder,name)).isFile()).sort();
  const overlay=json(root,'open router/79_CURRENT_RUNTIME_FRONTIER_2026-10-07.json');
  const manifest=json(root,'open router/MANIFEST.json');
  const reachability=json(root,'config/reachability-classification.json');
  const server=read(root,'server.mjs');
  const runtime=read(root,'src/infinite-opus-native-runtime.mjs');
  const ownerResume=read(root,'src/crown-owner-resume-authority.mjs');

  if(overlay.schemaVersion!=='uberbond.open-router.current-runtime.v1')failures.push('current-overlay-schema-mismatch');
  if(overlay.status!=='INTERNAL_OPEN_ROUTER_STACK_LIVE__CROWN_OWNER_SPEND_GATE_REMAINS')failures.push('current-overlay-status-mismatch');
  if(overlay.openRouter?.currentGeneralCrownAdmission!==false||overlay.openRouter?.blocker!=='crown-admission-absent')failures.push('current-crown-blocker-truth-drift');
  if(overlay.crownRecovery?.exactRemainingPaidCalls!==2||overlay.crownRecovery?.maximumIncrementalMicrousd!==300000)failures.push('bounded-crown-resume-overlay-drift');
  if(overlay.crownRecovery?.automaticRetry!==false)failures.push('automatic-crown-retry-must-remain-forbidden');
  if(overlay.cockpit?.directOpenRouterKeyRequiredInTypingMind!==false)failures.push('typingmind-direct-openrouter-key-drift');
  if(overlay.cockpit?.savedState!=='NOT_VERIFIED_SAVED')warnings.push('typingmind-saved-state-changed__refresh-current-overlay');

  if(manifest.expectedFinalFolderFileCount!==names.length)failures.push(`manifest-folder-count-mismatch:${manifest.expectedFinalFolderFileCount}!=${names.length}`);
  const listed=Array.isArray(manifest.files)?manifest.files:[];
  if(listed.length!==names.length-1)failures.push(`manifest-inventory-count-mismatch:${listed.length}!=${names.length-1}`);
  const byPath=new Map();
  for(const row of listed){
    if(!row?.path||byPath.has(row.path)){failures.push('manifest-duplicate-or-missing-path');continue;}
    byPath.set(row.path,row);
  }
  for(const name of names){
    if(name==='MANIFEST.json')continue;
    const rel=`open router/${name}`,row=byPath.get(rel);
    if(!row){failures.push('manifest-missing:'+rel);continue;}
    const buf=fs.readFileSync(path.join(folder,name));
    if(row.size!==buf.length)failures.push('manifest-size-drift:'+rel);
    if(row.blobSha!==blobSha(buf))failures.push('manifest-blob-drift:'+rel);
  }
  for(const rel of byPath.keys()){
    if(!names.includes(rel.slice('open router/'.length)))failures.push('manifest-stale-entry:'+rel);
  }

  const marker='CURRENT RUNTIME SUPERSESSION — 2026-10-07';
  for(const p of ['open router/README.md','open router/ACTIVATION_CHECKLIST.md','open router/04_TYPINGMIND_IPAD_SETUP.md','open router/75_RECOVERY_POINTER_2026-09-30.md']){
    if(!read(root,p).includes(marker))failures.push('current-supersession-marker-missing:'+p);
  }

  for(const token of [
    "/api/admin/infinite-opus/crown-recovery",
    "/api/admin/infinite-opus/crown-resume",
    "/api/admin/infinite-opus/semantic-closure",
    "/api/typingmind/infinite-opus/v1/chat/completions",
    "resolveCurrentCrownAdmission"
  ])if(!server.includes(token))failures.push('live-server-contract-missing:'+token);

  for(const token of ['deriveUnifiedCognitionHistory','compileGhostAgentFromFranchise','executeGhostAgent','async unifiedCognition()'])
    if(!runtime.includes(token))failures.push('native-runtime-closure-missing:'+token);

  if(!ownerResume.includes("CROWN_OWNER_RESUME_MAX_INCREMENTAL_MICROUSD=300000"))failures.push('owner-resume-30-cent-cap-missing');
  if(!ownerResume.includes("CROWN_OWNER_RESUME_MAX_REMAINING_PAID_CALLS=2"))failures.push('owner-resume-two-call-cap-missing');
  if(!ownerResume.includes("RESUME_EXACT_TWO_MISSING_EDGES_MAX_0_30_USD"))failures.push('owner-resume-exact-confirmation-missing');

  for(const gate of ['NO_UNIFIED_COGNITION_LEDGER_BRIDGE','NO_INFINITE_OPUS_SEMANTIC_CLOSURE_HOST','NO_GHOST_AGENT_EVENT_HOST']){
    if(reachability.gates?.[gate])failures.push('released-gate-resurrected:'+gate);
  }
  for(const module of overlay.researchOnlyNotActivationBlockers??[]){
    if(reachability.modules?.[module]?.category!=='RESEARCH_ONLY')failures.push('research-lineage-classification-drift:'+module);
  }

  const currentBoundaries=overlay.remainingOwnerOrExternalBoundaries??[];
  if(currentBoundaries.length!==2)failures.push('current-owner-boundary-count-drift');
  if(!currentBoundaries.some(x=>x.id==='GENERAL_CROWN_EXACT_TWO_EDGE_SPEND'&&x.satisfied===false))failures.push('crown-owner-boundary-missing');
  if(!currentBoundaries.some(x=>x.id==='TYPINGMIND_PRIVATE_TEST_AND_SAVE'&&x.satisfied===false))failures.push('typingmind-owner-boundary-missing');

  return {
    ok:failures.length===0,
    status:failures.length?'OPEN_ROUTER_CANON_DRIFT':'OPEN_ROUTER_CANON_CURRENT',
    schemaVersion:'uberbond.open-router.canon-doctor.v1',
    folderFileCount:names.length,
    manifestInventoryCount:listed.length,
    executableLiveSha:overlay.repository?.exactExecutableLiveSha??null,
    crownBlocker:overlay.openRouter?.blocker??null,
    exactRemainingPaidCalls:overlay.crownRecovery?.exactRemainingPaidCalls??null,
    maximumIncrementalUsd:overlay.crownRecovery?.maximumIncrementalUsd??null,
    typingMindSavedState:overlay.cockpit?.savedState??null,
    failures,
    warnings,
    providerCallsPerformed:0,
    spendAuthorized:false,
    businessEffectAuthority:'NONE',
    externalEffectAuthority:'NONE',
    truthBoundary:'This doctor validates repository canon/inventory/source wiring only. It does not test provider callability, spend money, mint Crown authority, or verify the private TypingMind saved state.'
  };
}

if(process.argv[1]===fileURLToPath(import.meta.url)){
  const report=auditOpenRouterCanon();
  console.log(JSON.stringify(report,null,2));
  if(!report.ok)process.exitCode=1;
}
