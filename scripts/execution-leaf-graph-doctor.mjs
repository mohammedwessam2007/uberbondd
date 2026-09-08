#!/usr/bin/env node
import { compileCoverageBoundExecutionLeafGraph } from '../src/canonical-execution-leaf-graph.mjs';

const sourceCommit='a'.repeat(40);
const coverage={
  ok:true,
  status:'COVERAGE_MATRIX_COMPILED',
  sourceCommit,
  counts:{rows:2,byState:{VERIFIED_CURRENT:1,EXTERNAL_BLOCKED:1}},
  rows:[{canonicalId:'doctor-internal'},{canonicalId:'doctor-external'}]
};
const common={
  exactScope:['doctor://synthetic'],parallelConflictSet:[],inputEvidence:['doctor://synthetic'],hostileFalsifiers:['synthetic-counterexample'],
  mutationRequirement:'NONE__SYNTHETIC_DOCTOR',persistenceRequirement:'NONE__STATELESS',restartRecoveryRequirement:'NONE__STATELESS',
  runtimeRequirement:'NO_RUNTIME_CREDIT',externalEvidenceRequirement:'NO_EXTERNAL_EVIDENCE_CREATED',authorityRequired:[],
  authorityExplicitlyNotGranted:['BUSINESS_EFFECT_AUTHORITY'],verifierIndependence:'synthetic independent verifier leaf',
  rollback:'discard synthetic doctor input',alternateRoutes:['verified-reuse'],blockerFingerprint:'doctor:synthetic',executorClass:'DETERMINISTIC_SCRIPT'
};
const requirements=[
  {id:'doctor-internal',canonicalSource:'doctor://canon/internal',disposition:'OWNED_INTERNAL',executionLeafIds:['doctor-build','doctor-verify'],terminalEvidenceClass:'SYNTHETIC_SOURCE_RECEIPT'},
  {id:'doctor-external',canonicalSource:'doctor://canon/external',disposition:'OWNED_EXTERNAL',executionLeafIds:['doctor-boundary'],terminalEvidenceClass:'EXTERNAL_EVIDENCE_REQUIRED'}
];
const leaves=[
  {...common,leafId:'doctor-build',kind:'IMPLEMENTATION',requirementIds:['doctor-internal'],predecessors:[],verifierLeafIds:['doctor-verify'],implementationAcceptance:'synthetic build compiles'},
  {...common,leafId:'doctor-verify',kind:'VERIFICATION',requirementIds:['doctor-internal'],predecessors:['doctor-build'],verifierLeafIds:[],implementationAcceptance:'synthetic verifier observes build',terminalEvidenceClass:'INDEPENDENT_SYNTHETIC_RECEIPT'},
  {...common,leafId:'doctor-boundary',kind:'BOUNDARY',requirementIds:['doctor-external'],predecessors:[],verifierLeafIds:[],implementationAcceptance:'external boundary remains explicit',terminalEvidenceClass:'EXTERNAL_EVIDENCE_REQUIRED'}
];
const report=compileCoverageBoundExecutionLeafGraph({coverage,requirements,leaves});
process.stdout.write(`${JSON.stringify(report,null,2)}\n`);
if(!report.ok)process.exitCode=1;
