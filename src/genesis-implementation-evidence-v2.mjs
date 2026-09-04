import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import { GENESIS_IMPLEMENTATION_EVIDENCE as FOUNDATION_EVIDENCE, parseGenesisRegistry } from './genesis-implementation-evidence.mjs';
import { GENESIS_ECONOMIC_PHYSICS_EVIDENCE, normalizeGenesisEvidencePack } from './genesis-economic-physics-evidence.mjs';
import { normalizeVentureEvidence } from './genesis-venture-organism-evidence.mjs';
import { normalizeSensingCognitionEvidence } from './genesis-sensing-cognition-evidence.mjs';
import { normalizeWorldResilienceEvidence } from './genesis-world-resilience-evidence.mjs';
import { normalizeFinalFrontierEvidence } from './genesis-final-frontier-evidence.mjs';
export const GENESIS_IMPLEMENTATION_EVIDENCE_V2_VERSION='uberbond.genesis-implementation-evidence-v2-2.0.0';
const economicPhysics=normalizeGenesisEvidencePack(GENESIS_ECONOMIC_PHYSICS_EVIDENCE,{sources:['src/genesis-economic-physics.mjs'],tests:['tests/genesis-economic-physics.test.mjs']});
const ventureOrganism=normalizeVentureEvidence(),sensingCognition=normalizeSensingCognitionEvidence(),worldAll=normalizeWorldResilienceEvidence(),finalFrontier=normalizeFinalFrontierEvidence();
const worldResilience=Object.fromEntries(Object.entries(worldAll).filter(([id])=>![126,127].includes(Number(id))));
function mergePacks(...packs){const merged={};for(const pack of packs)for(const [rawId,evidence] of Object.entries(pack)){const id=Number(rawId);if(merged[id])throw new Error(`duplicate-genesis-evidence-id:${id}`);merged[id]=evidence;}return Object.freeze(merged);}
export const GENESIS_IMPLEMENTATION_EVIDENCE=mergePacks(FOUNDATION_EVIDENCE,economicPhysics,ventureOrganism,sensingCognition,worldResilience,finalFrontier);
const envelope=extra=>({businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:structuredClone(ZERO_EXTERNAL_EFFECTS),...extra});
export function buildGenesisEvidenceLedger({canonicalMarkdown,availablePaths=[],observedRuntimeReceipts=[]}={}){
 const registry=parseGenesisRegistry(canonicalMarkdown);if(registry.length!==275)return envelope({ok:false,status:'GENESIS_EVIDENCE_LEDGER_INVALID',reasonCodes:['canonical-275-registry-required'],observedCount:registry.length});
 const paths=new Set(Array.isArray(availablePaths)?availablePaths:[]),runtime=new Set(Array.isArray(observedRuntimeReceipts)?observedRuntimeReceipts:[]),reasonCodes=[];
 for(const [rawId,evidence] of Object.entries(GENESIS_IMPLEMENTATION_EVIDENCE)){const id=Number(rawId),registryIdea=registry.find(item=>item.id===id);if(!registryIdea||registryIdea.name!==evidence.name)reasonCodes.push(`evidence-name-mismatch:${id}`);}
 if(reasonCodes.length)return envelope({ok:false,status:'GENESIS_EVIDENCE_LEDGER_INVALID',reasonCodes});
 const entries=registry.map(idea=>{const evidence=GENESIS_IMPLEMENTATION_EVIDENCE[idea.id];if(!evidence)return{id:idea.id,name:idea.name,maturity:'CANON_ONLY',status:'CANON_ONLY',sources:[],tests:[],runtimeReceipts:[],missingPaths:[]};const missingSources=evidence.sources.filter(x=>!paths.has(x)),missingTests=evidence.tests.filter(x=>!paths.has(x)),presentRuntime=evidence.runtimeReceipts.filter(x=>runtime.has(x));let status='DECLARED_EVIDENCE_MISSING';if(!missingSources.length&&!missingTests.length)status=presentRuntime.length?'OBSERVED_INTERNAL_RUNTIME_RECEIPT':'SOURCE_AND_TEST_PRESENT';return{id:idea.id,name:idea.name,maturity:evidence.maturity,status,sources:evidence.sources,tests:evidence.tests,runtimeReceipts:presentRuntime,missingPaths:[...missingSources,...missingTests],note:evidence.note};});
 const counts=entries.reduce((a,e)=>(a[e.status]=(a[e.status]||0)+1,a),{}),maturityCounts=entries.reduce((a,e)=>(a[e.maturity]=(a[e.maturity]||0)+1,a),{});
 return envelope({ok:true,status:'GENESIS_EVIDENCE_LEDGER_READY',evidenceVersion:GENESIS_IMPLEMENTATION_EVIDENCE_V2_VERSION,ideaCount:275,counts,maturityCounts,entries,implementedOrPartialCount:entries.filter(e=>e.maturity!=='CANON_ONLY').length,canonOnlyCount:entries.filter(e=>e.maturity==='CANON_ONLY').length,truthBoundary:'SOURCE_AND_TEST_PRESENT_DOES_NOT_MEAN_TESTS_PASSED; OBSERVED_INTERNAL_RUNTIME_RECEIPT_DOES_NOT_MEAN_EXTERNAL_VALUE_PROOF; CANON_ONLY_MUST_NOT_BE_CALLED_IMPLEMENTED'});
}
