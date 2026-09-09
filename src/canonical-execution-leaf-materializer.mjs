import crypto from 'node:crypto';
import { compileCoverageBoundExecutionLeafGraph } from './canonical-execution-leaf-graph.mjs';

export const CANONICAL_EXECUTION_LEAF_MATERIALIZER_VERSION='uberbond.canonical-execution-leaf-materializer.v1.1';
const ZERO=Object.freeze({customerMessages:0,providerCalls:0,spendCents:0,deployments:0,dnsChanges:0,credentialChanges:0,paymentMutations:0,productionMutations:0});
const digest=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const slug=v=>String(v??'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,96);
const terminalStates=new Set(['STRUCTURAL_NOT_A_BUILD_TARGET','COVERED_BY_PARENT_ORGAN','REFERENCE_ONLY_BY_CANON','HISTORICAL_DONOR_PRESERVED','ALIAS_OF_CANONICAL_CONCEPT','ENFORCED_BY_CODE','SUPERSEDED_WITH_PRESERVED_DONATION']);
const boundaryStates=new Set(['EXTERNAL_BLOCKED','OWNER_BOUNDARY','ELAPSED_TIME_REQUIRED']);
const potentiallyMutatingKinds=new Set(['IMPLEMENTATION','INTEGRATION','RUNTIME','RECOVERY']);

function disposition(state){
  if(state==='ELAPSED_TIME_REQUIRED')return'OWNED_ELAPSED';
  if(state==='EXTERNAL_BLOCKED'||state==='OWNER_BOUNDARY')return'OWNED_EXTERNAL';
  return'OWNED_INTERNAL';
}
function evidenceClass(state){
  if(state==='EXTERNAL_BLOCKED')return'EXTERNAL_EVIDENCE';
  if(state==='OWNER_BOUNDARY')return'OWNER_AUTHORITY_OR_ATTESTATION';
  if(state==='ELAPSED_TIME_REQUIRED')return'ELAPSED_OBSERVATION';
  if(state==='SPEC_ONLY')return'IMPLEMENTATION_PLUS_INDEPENDENT_VERIFICATION';
  if(state==='PARTIAL_CURRENT'||state==='UNKNOWN')return'INDEPENDENT_VERIFICATION_OR_CLASSIFICATION';
  return'CANONICAL_SOURCE_CLASSIFICATION_EVIDENCE';
}
function exactScope(row){
  return [...new Set([...(row.currentEvidence?.sourceModules||[]),...(row.currentEvidence?.testModules||[]),...(row.sourceArtifacts||[])].filter(Boolean).map(String))].sort();
}
function baseLeaf(row,kind,id){return{
  leafId:id,kind,requirementIds:[row.canonicalId],exactScope:exactScope(row),
  predecessors:[],verifierLeafIds:[],parallelConflictSet:[],inputEvidence:[`coverage:${row.canonicalId}:${row.currentState}`],
  implementationAcceptance:`Resolve canonical requirement ${row.canonicalId} without changing its evidence class or authority boundary; terminal proof must match ${evidenceClass(row.currentState)}.`,
  hostileFalsifiers:['wrong-canonical-id','stale-source-commit','authority-inflation','evidence-class-laundering','undeclared-shared-write-scope'],
  mutationRequirement:'Any changed executable behavior requires focused hostile or mutation evidence appropriate to its effect class.',
  persistenceRequirement:'Required only when the owned behavior persists state; otherwise NOT_APPLICABLE.',
  restartRecoveryRequirement:'Required only when the owned behavior is stateful or long-running; otherwise NOT_APPLICABLE.',
  runtimeRequirement:boundaryStates.has(row.currentState)?'Repository work cannot satisfy this terminal boundary.':'Repository execution may prove only the declared internal evidence class.',
  externalEvidenceRequirement:boundaryStates.has(row.currentState)?evidenceClass(row.currentState):'NONE_FOR_SOURCE_CLASSIFICATION',
  authorityRequired:[],authorityExplicitlyNotGranted:['CUSTOMER_CONTACT','SPEND','DEPLOYMENT','PROVIDER_MUTATION','PAYMENT_TRUTH','LIFE_OUTCOME','ASI_CLAIM'],
  verifierIndependence:'Verification evidence must be produced by a leaf/evaluator that does not self-certify the implementation action it judges.',
  rollback:'Source changes must remain revertible by exact commit unless the canonical row is an external/elapsed boundary with no repository mutation.',
  claimExpiry:'ON_SOURCE_OR_EVIDENCE_CHANGE',alternateRoutes:['reuse-existing-owner','repair-existing-owner','new-minimum-sufficient-owner'],
  blockerFingerprint:`${row.canonicalId}|${row.currentState}|${row.owningLane||'UNKNOWN'}`,terminalEvidenceClass:evidenceClass(row.currentState),executorClass:boundaryStates.has(row.currentState)?'BOUNDARY_OBSERVER':'TRUTH_VERIFICATION_WORKER'
};}

export function deriveConservativeParallelConflicts(leaves=[]){
  const paths=new Map();
  for(const leaf of leaves){
    for(const scope of leaf.exactScope||[]){
      if(!paths.has(scope))paths.set(scope,[]);
      paths.get(scope).push(leaf);
    }
  }
  const conflicts=new Map(leaves.map(leaf=>[leaf.leafId,new Set(leaf.parallelConflictSet||[])]));
  for(const members of paths.values()){
    for(let i=0;i<members.length;i++){
      for(let j=i+1;j<members.length;j++){
        const a=members[i],b=members[j];
        // Two verification/boundary readers may share a path. If either side
        // can mutate implementation/runtime/recovery state, serialize the
        // shared exact scope unless stronger future resource evidence exists.
        if(!potentiallyMutatingKinds.has(a.kind)&&!potentiallyMutatingKinds.has(b.kind))continue;
        conflicts.get(a.leafId).add(b.leafId);
        conflicts.get(b.leafId).add(a.leafId);
      }
    }
  }
  for(const leaf of leaves)leaf.parallelConflictSet=[...conflicts.get(leaf.leafId)].sort();
  return leaves;
}

export function materializeCanonicalExecutionLeaves({coverage={}}={}){
  if(coverage?.ok!==true||coverage?.status!=='COVERAGE_MATRIX_COMPILED'||!Array.isArray(coverage?.rows)||coverage.rows.length===0){
    return{ok:false,status:'CANONICAL_EXECUTION_LEAF_MATERIALIZATION_REFUSED',reasonCodes:['materialized-canonical-coverage-required'],businessEffectAuthority:'NONE',externalEffectLedger:{...ZERO}};
  }
  const requirements=[];const leaves=[];
  for(const row of coverage.rows){
    const rid=row?.canonicalId; const state=row?.currentState;
    if(!rid||!state) return{ok:false,status:'CANONICAL_EXECUTION_LEAF_MATERIALIZATION_REFUSED',reasonCodes:['coverage-row-id-and-state-required'],businessEffectAuthority:'NONE',externalEffectLedger:{...ZERO}};
    const stem=`leaf:${slug(rid)}:${digest(rid).slice(0,10)}`;
    const ids=[];
    if(state==='SPEC_ONLY'){
      const impl=baseLeaf(row,'IMPLEMENTATION',`${stem}:implement`);const verify=baseLeaf(row,'VERIFICATION',`${stem}:verify`);
      verify.predecessors=[impl.leafId];impl.verifierLeafIds=[verify.leafId];ids.push(impl.leafId,verify.leafId);leaves.push(impl,verify);
    }else if(boundaryStates.has(state)){
      const leaf=baseLeaf(row,'BOUNDARY',`${stem}:boundary`);ids.push(leaf.leafId);leaves.push(leaf);
    }else{
      const leaf=baseLeaf(row,'VERIFICATION',`${stem}:verify`);
      if(terminalStates.has(state))leaf.implementationAcceptance=`Verify that ${rid} remains correctly terminal as ${state}; do not create duplicate implementation work.`;
      ids.push(leaf.leafId);leaves.push(leaf);
    }
    requirements.push({id:rid,canonicalSource:(row.sourceArtifacts||[])[0]||'artifacts/sovereign/implementation-coverage-matrix.json',disposition:disposition(state),executionLeafIds:ids,terminalEvidenceClass:evidenceClass(state),statusEvidenceRef:`coverage:${rid}:${state}`,note:`Generated from exact canonical coverage state ${state}; generation creates ownership/work accounting, not evidence that the work is complete.`});
  }
  deriveConservativeParallelConflicts(leaves);
  const graph=compileCoverageBoundExecutionLeafGraph({coverage,requirements,leaves});
  if(!graph.ok)return graph;
  return{...graph,materializerVersion:CANONICAL_EXECUTION_LEAF_MATERIALIZER_VERSION,materializationDigest:digest({sourceCommit:coverage.sourceCommit,requirements:requirements.map(r=>r.id),leaves:leaves.map(l=>({leafId:l.leafId,exactScope:l.exactScope,parallelConflictSet:l.parallelConflictSet}))}),truthBoundary:'MATERIALIZATION_PROVES_ZERO_ORPHAN_ACCOUNTING_AGAINST_THE_EXACT_COVERAGE_DENOMINATOR_AND_CONSERVATIVELY_SERIALIZES_SHARED_EXACT_SCOPE_WHEN_EITHER_LEAF_CAN_MUTATE_IT. IT_DOES_NOT_PROVE_ANY_IMPLEMENTATION_VERIFICATION_RUNTIME_EXTERNAL_OUTCOME_OR_ASI_CLAIM.',businessEffectAuthority:'NONE',externalEffectLedger:{...ZERO}};
}
