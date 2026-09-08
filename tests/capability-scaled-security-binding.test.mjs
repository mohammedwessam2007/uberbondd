import test from 'node:test';
import assert from 'node:assert/strict';
import { compileCapabilityScaledSecurityAdmission, evaluateCompositionAuthorityBoundary } from '../src/capability-scaled-security.mjs';

const HASH='a'.repeat(64);
const NOW='2026-09-09T00:00:00.000Z';
const capability={
  id:'supplier.security-critical',canonicalIdentity:'cap:skill:supplier-security-critical',aliases:[],
  source:{url:'https://example.test/supplier.security-critical',packageIdentity:null,lineageRoot:null},sourceType:'SKILL',
  sourceRevision:'0123456789abcdef0123456789abcdef01234567',sourceHash:HASH,maintainer:{name:'Example'},license:'MIT',licenseConfidence:1,
  capabilityAtoms:[{id:'production.deploy',verb:'deploy',noun:'release',description:'Deploy bounded release.',inputs:['release'],outputs:['receipt'],sideEffectClass:'PRODUCTION_MUTATION'}],
  taskClasses:['deployment'],inputs:['release'],outputs:['receipt'],sideEffects:['PRODUCTION_MUTATION'],dataClasses:['SOURCE_CODE'],permissions:['production.deploy'],
  credentialRequirements:[],networkRequirements:[],dependencies:[],executionEnvironment:{runtime:'node',isolation:'project-local'},supportedAgents:['sol'],supportedModels:['model-a'],supportedProviders:['provider-a'],
  contextCost:{tokens:1},monetaryCost:{cents:0},reliability:{observedRate:0.9},economicPrior:{confidence:0.5},securityEvidence:[],knownVulnerabilities:[],knownConflicts:[],compatibilityEdges:[],substitutes:[],benchmarks:[],realUsageEvidence:[],founderMinutesSaved:{status:'UNKNOWN'},observedOutcomes:[],versionHistory:[],promotionState:'ACTIVE',revocationState:{revoked:false,reasonCodes:[]},lastEvaluatedAt:'2026-09-08T12:00:00.000Z',evidencePointers:[{type:'SOURCE',ref:'https://example.test/source',observedAt:'2026-09-08T12:00:00.000Z',claimClass:'SOURCE_CODE_EVIDENCE'}]
};
const baseSecurity=['STATIC','SEMANTIC','SANDBOX'].map(layer=>({layer,passed:true,artifactRef:`evidence://${layer}`,subjectHash:HASH,observedAt:'2026-09-08T12:00:00.000Z'}));
const actors={proposerId:'p',approverId:'a',deployerId:'d',verifierId:'v',monitorId:'m',rollbackControllerId:'r',emergencyStopControllerId:'s',recoveryControllerId:'rc',auditRetentionOwnerId:'audit'};
const composition={id:'composition:x',components:[{id:'deployer',authorities:['production.deploy']}],requestedPermissions:['production.deploy'],explicitCompositionAuthority:['production.deploy'],authorityRef:'authority://founder/1',declaredEffects:['PRODUCTION_MUTATION'],networked:true};
const audit={appendOnly:true,independentStoreRef:'audit://independent',retentionOwnerId:'audit'};
const emergency={rollbackRef:'rollback://1',revocationRef:'revocation://1',stopControllerId:'s',recoveryControllerId:'rc',stopAllowsIndependentRecovery:true};
const limits={maxSpendCents:0,maxProviderCalls:4,maxDeployments:1,maxProductionMutations:1,maxCredentialChanges:0,maxPrivateReads:0,maxReplicas:0,maxComputeUnits:100};
const compile=resourceLimits=>compileCapabilityScaledSecurityAdmission({capability,capabilityAdmissionOptions:{securityEvidence:baseSecurity,requestedPermissions:['production.deploy'],authorizedPermissions:['production.deploy']},composition,actors,resourceLimits,audit,emergency,now:NOW});

test('changing any quota changes the attested C26 subject digest',()=>{
  const a=compile(limits);
  const b=compile({...limits,maxDeployments:2});
  assert.match(a.subjectDigest,/^sha256:[0-9a-f]{64}$/);
  assert.match(b.subjectDigest,/^sha256:[0-9a-f]{64}$/);
  assert.notEqual(a.subjectDigest,b.subjectDigest);
});

test('explicit authority cannot conjure a permission no component can perform',()=>{
  const out=evaluateCompositionAuthorityBoundary({components:[{id:'reader',authorities:['data.read']}],requestedPermissions:['payment.capture'],explicitCompositionAuthority:['payment.capture'],authorityRef:'authority://founder/payment'});
  assert.equal(out.ok,false);
  assert.deepEqual(out.unbackedPermissions,['payment.capture']);
  assert.ok(out.reasonCodes.includes('composition-permission-not-backed-by-component:payment.capture'));
});
