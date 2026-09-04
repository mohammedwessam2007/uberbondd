import test from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../src/genesis-sensing-cognition.mjs';
const zero=r=>{assert.equal(r.businessEffectAuthority,'NONE');assert.equal(r.externalEffectAuthority,'NONE');};

test('sensing/cognition surface is complete',()=>{for(const name of ['designSensorGenesis','buildPrecursorGraph','fuseWeakSignals','huntMissingVariables','buildEpistemicTopography','estimateInformationHalfLife','triangulateTruth','autopsySurprise','detectCausalAnomaly','compileSignalProvenance','compileMetacognition','gardenReasoningSpecies','mergeCognition','searchConceptualWormholes','routeCognitiveOpportunityCost','generateSelfCurriculum','spawnArchitectureEmbryos','foundAlgorithm','generateTool','evolveMemoryGenotype','mutateOntologyGenetically','compileProofCarryingSelfModification'])assert.equal(typeof S[name],'function',name);});

test('weak-signal fusion remains non-factual',()=>{const r=S.fuseWeakSignals({signals:[{origin:'a',weight:50,confidence:50},{origin:'b',weight:30,confidence:70}]});zero(r);assert.equal(r.independentOrigins,2);assert.match(r.claimBoundary,/NOT_FACT/);});

test('truth triangulation never self-verifies',()=>{const r=S.triangulateTruth({claims:[{claim:'x',origin:'a',support:true},{claim:'x',origin:'b',support:true}]});zero(r);assert.equal(r.claims[0].independentOrigins,2);assert.equal(r.claims[0].verified,false);});

test('architecture embryos are sandbox-only',()=>{const r=S.spawnArchitectureEmbryos({assumptions:['A','B'],primitives:['x','y'],count:3});zero(r);assert.equal(r.embryos.length,3);for(const e of r.embryos)assert.equal(e.stage,'SANDBOX_ONLY');});

test('proof-carrying self modification fails closed without all proof classes',()=>{const r=S.compileProofCarryingSelfModification({change:{id:'x'},proofs:[{kind:'baseline'}]});zero(r);assert.equal(r.ok,false);assert.ok(r.missing.includes('hostile'));assert.equal(r.promotionAuthority,'NONE');});

test('ontology mutation never gets canonical mutation authority',()=>{const r=S.mutateOntologyGenetically({ontology:{a:1},mutations:[{rename:'a'}]});zero(r);assert.equal(r.canonicalMutationAuthority,'NONE');});

test('sensor genesis never deploys sensors by itself',()=>{const r=S.designSensorGenesis({blindSpot:'buyer budget formation',candidateSignals:['public procurement']});zero(r);assert.equal(r.deploymentAuthority,'NONE');});
