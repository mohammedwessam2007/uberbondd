import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { JsonStore } from '../src/store.mjs';
import { createInfiniteOpusRuntime } from '../src/infinite-opus-native-runtime.mjs';
import { selectCurrentPrice } from '../src/infinite-opus-market.mjs';
import { factorFrontierResidualCut } from '../src/frontier-residual-cut.mjs';
import { semanticHash } from '../src/semantic-closure-kernel.mjs';

const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'infinite-opus-doctor-'));
try {
  const store = new JsonStore(dir); await store.init();
  const runtime = createInfiniteOpusRuntime({ store });
  const idle = await runtime.snapshot();
  const registry = JSON.parse(await fs.readFile('open router/INFINITE_OPUS_PRICE_REGISTRY_2026-09-29.json','utf8'));
  const freshPrices = registry.records.filter(r => { try { selectCurrentPrice(registry,r.model); return true; } catch { return false; } });
  const obligation = { taskClass:'SYNTHETIC_SHARED_LEAF',crownRevision:'fixture-only',inputHash:semanticHash('same'),
    dependencies:{s:semanticHash('synthetic-source')},qualityContract:{exact:true},contractHash:semanticHash('contract'),
    applicability:{finite:true},invalidators:{drift:false},freshnessClass:'BOUNDED' };
  const programs = Array.from({length:4096},(_,i)=>({id:'consumer-'+i,roots:['result'],nodes:[
    {id:'leaf',resolved:false,obligation},{id:'result',resolved:false,dependencies:['leaf']}]}));
  const start=performance.now(); const cut=factorFrontierResidualCut(programs);
  const changed=programs.slice(0,2).map(p=>structuredClone(p)); changed[1].nodes[0].obligation.dependencies.s=semanticHash('drift');
  const falsifier=factorFrontierResidualCut(changed);
  const result = { schemaVersion:'uberbond.infinite-opus.doctor.v1',observedAt:new Date().toISOString(),
    status:'BOUNDED_SOURCE_EXERCISED_LIVE_ACTIVATION_BLOCKED',idle,
    market:{recordCount:registry.recordCount,freshFixedPriceRecords:freshPrices.length,expiresAt:registry.expiresAt,ownerAccountCallability:'UNKNOWN'},
    syntheticResidualCut:{rootConsumerCount:cut.totalRootObligations,uniqueMissingLeaves:cut.uniqueResidualObligations,
      elapsedMs:performance.now()-start,planHash:cut.planHash,changedDependencyUniqueLeaves:falsifier.uniqueResidualObligations,
      adjudicationsPerformed:0,realizedSavings:null,matchedQualityResult:null},
    blockers:['OWNER_ACCOUNT_CONNECTION_NOT_OBSERVED','EXPLICIT_PAID_AUTHORIZATION_ABSENT',
      'CURRENT_CROWN_AND_FRESH_HIDDEN_TASK_EVIDENCE_ABSENT','24_7_HOST_DEPLOYMENT_NOT_OBSERVED'],
    inferenceCallsPerformed:0,externalEffectsPerformed:0 };
  if (cut.uniqueResidualObligations!==1 || falsifier.uniqueResidualObligations!==2 || idle.paidConnected) throw new Error('doctor-falsifier-failed');
  console.log(JSON.stringify(result,null,2));
} finally { await fs.rm(dir,{recursive:true,force:true}); }
