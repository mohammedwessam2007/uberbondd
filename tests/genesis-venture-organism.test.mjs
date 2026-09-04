import test from 'node:test';
import assert from 'node:assert/strict';
import * as V from '../src/genesis-venture-organism.mjs';

const ZERO = result => {
  assert.equal(result.businessEffectAuthority,'NONE');
  assert.equal(result.externalEffectAuthority,'NONE');
};

test('venture organism exports the complete declared primitive surface',()=>{
  const required=['compileCompanyMorphogenesis','reproduceCompanyGenome','selectEconomicPopulation','compoundKnowledge','reconstructCounterfactualSelf','conveneAlienBoard','runDreamMode','buildCivilizationTrendGraph','formAutonomousField','worldDiscoveryCompanyPipeline','runScienceToMarketLab','detectProblemDarkMatter','inferLatentDemand','archaeologizeHumanLabor','buildEconomicPeriodicTable','proveEconomicChain','buildBusinessProofDag','compileCompany','spawnEphemeralCompany','scheduleSeasonalOrganism','mutateGeography','scoreTimeArbitrage','predictTechnologyHalfLife','forecastObsolescence','simulateCompetitorFuture','detectEvolutionaryNiches','runInventionMarket','runProofMarket','issueFailureBounties','issueFrontierBounties','allocateEconomicAttention','routeAdaptiveIntelligence','consolidateMachineSleep','evolveMemoryPolicy','buildEconomicMicroscopeTelescope','replayTemporalCausality','runHistoricalBlindSpotTournament','compileScientificCommercializationAgents','compilePhysicalWorldBridge','optimizeProcurement','reverseVendor','transmuteResourceWaste','compileOpportunitySymbiosis','scorePortfolioAutocatalysis','measureCompoundingLearningRate','detectFrontierOfFrontiers'];
  for(const name of required) assert.equal(typeof V[name],'function',name);
});

test('company compilation remains review-only when proof assumptions are unresolved',()=>{
  const dag=V.buildBusinessProofDag({claims:[{id:'buyer',claim:'buyer exists',evidenceRefs:[],dependsOn:[]}]}); ZERO(dag);
  const company=V.compileCompany({proofDag:dag,genome:{buyer:'agencies',mechanism:'detect revenue leakage'}}); ZERO(company);
  assert.equal(company.status,'COMPANY_COMPILED_REVIEW_ONLY');
  assert.equal(company.executionAuthority,'NONE');
});

test('science-to-market fails closed without independent replication',()=>{
  const result=V.runScienceToMarketLab({claim:{mechanism:'novel process'},replication:{independentReplications:0},markets:['x']}); ZERO(result);
  assert.equal(result.ok,false); assert.equal(result.status,'REPLICATION_REQUIRED'); assert.deepEqual(result.markets,[]);
});

test('latent demand never becomes willingness-to-pay proof',()=>{
  const result=V.inferLatentDemand({workarounds:8,outsourcingSpend:10000,manualHours:50,searchVolume:0}); ZERO(result);
  assert.ok(result.shadowDemandScore>0); assert.match(result.claimBoundary,/NOT_WILLINGNESS_TO_PAY/);
});

test('physical bridge has zero physical action authority',()=>{
  const result=V.compilePhysicalWorldBridge({deviceClass:'microscope',capabilities:['focus'],hazards:['collision']}); ZERO(result);
  assert.equal(result.physicalActionAuthority,'NONE');
});

test('procurement ranks but never purchases',()=>{
  const result=V.optimizeProcurement({offers:[{id:'a',price:10,switchingCost:2,riskCost:3},{id:'b',price:8,switchingCost:10,riskCost:1}]}); ZERO(result);
  assert.equal(result.ranked[0].id,'a'); assert.equal(result.purchaseAuthority,'NONE');
});

test('opportunity symbiosis requires an explicit output-input match',()=>{
  const result=V.compileOpportunitySymbiosis({businesses:[{id:'a',outputs:['qualified-lead'],inputs:[]},{id:'b',inputs:['qualified-lead'],outputs:['receipt']}]}); ZERO(result);
  assert.deepEqual(result.links,[{from:'a',to:'b',type:'OUTPUT_TO_INPUT'}]);
});

test('temporal replay explicitly forbids future leakage',()=>{
  const result=V.replayTemporalCausality({historicalState:{date:'2012'},decisionRule:'choose from contemporary evidence'}); ZERO(result);
  assert.equal(result.futureLeakageForbidden,true);
});

test('ephemeral and seasonal companies are specs, never activations',()=>{
  const e=V.spawnEphemeralCompany({genome:{buyer:'x'},expiresAt:'2026-10-01'}); ZERO(e); assert.equal(e.activationAuthority,'NONE');
  const s=V.scheduleSeasonalOrganism({genome:{buyer:'x'},windows:['tax-season']}); ZERO(s); assert.match(s.wakeRule,/AUTHORITY_REQUIRED/);
});
