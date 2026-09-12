import crypto from 'node:crypto';

export const UNIVERSAL_WEALTH_ENGINE_VERSION='uberbond.universal-wealth-engine.v1';

export const WEALTH_GRAMMAR=Object.freeze({
  valueSources:['REVENUE_GAIN','COST_REDUCTION','TIME_SAVED','RISK_REDUCTION','INFORMATION_ADVANTAGE','CONVENIENCE','ACCESS','COORDINATION','ENTERTAINMENT','STATUS','TRANSFORMATION','COMPLIANCE','LIQUIDITY'],
  assetForms:['SERVICE','SOFTWARE','DATA','MEDIA','KNOWLEDGE','IP','NETWORK','AUDIENCE','PHYSICAL_GOOD','COMPUTE','CAPITAL','REAL_ASSET','WORKFLOW','BRAND'],
  captureModels:['ONE_TIME_SALE','SUBSCRIPTION','USAGE','LICENSE','ROYALTY','COMMISSION','MARKETPLACE_TAKE_RATE','REFERRAL','SPONSORSHIP','ADVERTISING','RENTAL','RETAINER','PROJECT_FEE','MAINTENANCE','SUCCESS_FEE','BOUNTY','PRIZE','PROFIT_SHARE','EQUITY','RESALE','YIELD'],
  distribution:['DIRECT_SALES','INBOUND','MARKETPLACE','PARTNERSHIP','RESELLER','AFFILIATE','SEO','SOCIAL','COMMUNITY','APP_STORE','API','PROCUREMENT','LOCAL_OFFLINE','EMBEDDED_DISTRIBUTION'],
  buyerClasses:['CONSUMER','CREATOR','SMB','ENTERPRISE','GOVERNMENT','NONPROFIT','DEVELOPER','OPERATOR','INVESTOR','MARKETPLACE_PARTICIPANT','INSTITUTION'],
  horizons:['INSTANT','DAYS','WEEKS','MONTHS','YEARS'],
});

export const PROHIBITED_WEALTH_PATTERNS=Object.freeze([
  'FRAUD','DECEPTION','THEFT','UNAUTHORIZED_ACCESS','MARKET_MANIPULATION','TAX_EVASION','COUNTERFEIT','IP_INFRINGEMENT','GAMBLING','COERCION','SPAM_ABUSE'
]);

const n=(v,f=0)=>Number.isFinite(Number(v))?Number(v):f;
const c=v=>Math.max(0,Math.min(1,n(v)));
const t=(v,max=220)=>{v=String(v??'').trim();return v&&v.length<=max?v:null;};
const a=v=>Array.isArray(v)?v:[];
const u=v=>[...new Set(a(v).map(String).filter(Boolean))];
const h=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');

function explicitRiskClass(candidate={}){
  const model=String(candidate.captureModel||'').toUpperCase();
  const asset=String(candidate.assetForm||'').toUpperCase();
  if(['YIELD','EQUITY'].includes(model)||asset==='CAPITAL') return 'REGULATED_OR_CAPITAL_RISK';
  if(['REAL_ASSET','PHYSICAL_GOOD'].includes(asset)) return 'OPERATIONAL_OR_ASSET_RISK';
  return 'ORDINARY_COMMERCIAL';
}

export function validateWealthMechanism(candidate={}){
  const reasons=[];
  if(!t(candidate.id,180)) reasons.push('id-required');
  if(!t(candidate.valueSource,80)) reasons.push('value-source-required');
  if(!t(candidate.assetForm,80)) reasons.push('asset-form-required');
  if(!t(candidate.captureModel,80)) reasons.push('capture-model-required');
  if(!t(candidate.distribution,80)) reasons.push('distribution-required');
  if(!t(candidate.buyerClass,80)) reasons.push('buyer-class-required');
  if(!a(candidate.evidenceRefs).length) reasons.push('evidence-required');
  if(!a(candidate.stopConditions).length) reasons.push('stop-conditions-required');
  if(candidate.policyCleared!==true) reasons.push('policy-clearance-required');
  const forbidden=u(candidate.patternFlags).filter(x=>PROHIBITED_WEALTH_PATTERNS.includes(x));
  if(forbidden.length) reasons.push(`prohibited-pattern:${forbidden.join(',')}`);
  const riskClass=explicitRiskClass(candidate);
  if(riskClass==='REGULATED_OR_CAPITAL_RISK'&&candidate.regulatoryClearance!==true) reasons.push('regulatory-clearance-required');
  if(n(candidate.cashAtRisk)<0||n(candidate.founderMinutes)<0) reasons.push('nonnegative-resource-bounds-required');
  return {ok:reasons.length===0,status:reasons.length?'WEALTH_MECHANISM_REJECTED':'WEALTH_MECHANISM_ELIGIBLE',reasons,riskClass};
}

export function scoreWealthMechanism(candidate={}){
  const expectedClearedContribution=n(candidate.expectedClearedContribution);
  const probability=c(candidate.probability);
  const downside=Math.max(0,n(candidate.downside));
  const founderMinutes=Math.max(1,n(candidate.founderMinutes,1));
  const cashAtRisk=Math.max(0,n(candidate.cashAtRisk));
  const timeToCashDays=Math.max(0,n(candidate.timeToCashDays));
  const repeatability=c(candidate.repeatability);
  const defensibility=c(candidate.defensibility);
  const reversibility=c(candidate.reversibility??1);
  const evidenceQuality=c(candidate.evidenceQuality);
  const optionValue=c(candidate.optionValue);
  const riskAdjusted=(expectedClearedContribution*probability)-downside-(cashAtRisk*0.1);
  const burden=founderMinutes*(1+timeToCashDays/30);
  const quality=(0.35+0.65*evidenceQuality)*(0.5+0.5*repeatability)*(0.5+0.5*defensibility)*(0.5+0.5*reversibility)*(0.75+0.25*optionValue);
  const score=(riskAdjusted/burden)*quality;
  return {score:+score.toFixed(9),riskAdjustedClearedContribution:+riskAdjusted.toFixed(2),founderMinutes,cashAtRisk,timeToCashDays,repeatability,defensibility,reversibility,evidenceQuality,optionValue};
}

export function compileEconomicSearchLattice({signals=[],constraints={},maxCells=256}={}){
  const cells=[];
  const signalPool=a(signals).length?a(signals):[{id:'unconditioned-search',domains:['general'],buyerClasses:WEALTH_GRAMMAR.buyerClasses}];
  outer: for(const signal of signalPool){
    const buyers=a(signal.buyerClasses).length?a(signal.buyerClasses):WEALTH_GRAMMAR.buyerClasses;
    const assets=a(signal.assetForms).length?a(signal.assetForms):WEALTH_GRAMMAR.assetForms;
    const captures=a(signal.captureModels).length?a(signal.captureModels):WEALTH_GRAMMAR.captureModels;
    const values=a(signal.valueSources).length?a(signal.valueSources):WEALTH_GRAMMAR.valueSources;
    const distributions=a(signal.distribution).length?a(signal.distribution):WEALTH_GRAMMAR.distribution;
    for(const buyerClass of buyers) for(const assetForm of assets) for(const captureModel of captures) for(const valueSource of values) for(const distribution of distributions){
      const riskClass=explicitRiskClass({assetForm,captureModel});
      if(constraints.excludeRegulated===true&&riskClass==='REGULATED_OR_CAPITAL_RISK') continue;
      const fingerprint={signalId:signal.id||null,buyerClass,assetForm,captureModel,valueSource,distribution};
      cells.push({id:`wealth-cell:${h(fingerprint).slice(0,20)}`,...fingerprint,riskClass,status:'SEARCH_CELL_NOT_BUSINESS'});
      if(cells.length>=Math.max(1,Math.floor(n(maxCells,256)))) break outer;
    }
  }
  return {version:UNIVERSAL_WEALTH_ENGINE_VERSION,status:'ECONOMIC_SEARCH_LATTICE_COMPILED',cells,cellCount:cells.length,truthBoundary:'SEARCH_CELLS_ARE_HYPOTHESES_NOT_INCOME'};
}

export function compileUniversalWealthPortfolio({candidates=[],maxCanaries=5,maxCapitalAtRisk=0}={}){
  const evaluated=a(candidates).map(candidate=>{
    const validation=validateWealthMechanism(candidate);
    const economics=scoreWealthMechanism(candidate);
    const allowedCapital=n(candidate.cashAtRisk)<=Math.max(0,n(maxCapitalAtRisk));
    const eligible=validation.ok&&allowedCapital&&economics.riskAdjustedClearedContribution>0;
    return {candidateId:candidate.id,eligible,validation,economics,candidate};
  }).sort((x,y)=>y.economics.score-x.economics.score||String(x.candidateId).localeCompare(String(y.candidateId)));
  const canaries=evaluated.filter(x=>x.eligible).slice(0,Math.max(0,Math.floor(n(maxCanaries,5)))).map(x=>x.candidateId);
  return {version:UNIVERSAL_WEALTH_ENGINE_VERSION,status:canaries.length?'WEALTH_CANARIES_SELECTED':'NO_WEALTH_CANARY_SELECTED',canaries,evaluated,externalEffectAuthority:'NONE',capitalDeploymentAuthority:'NONE',tradingAuthority:'NONE',truthBoundary:'FORECASTS_ONLY_SELECT_CANARIES; NO MONEY IS COUNTED UNTIL CLEARED_AND_RECONCILED'};
}

export function recordWealthOutcome({mechanismId,clearedCash=0,cashCost=0,refunds=0,disputes=0,acceptedDeliveries=0,realizedAssetSale=0,founderMinutes=0,capitalLoss=0}={}){
  const cash=Math.max(0,n(clearedCash))+Math.max(0,n(realizedAssetSale));
  const costs=Math.max(0,n(cashCost))+Math.max(0,n(refunds))+Math.max(0,n(disputes))+Math.max(0,n(capitalLoss));
  const contribution=cash-costs;
  const mins=Math.max(0,n(founderMinutes));
  return {schema:'uberbond.wealth-outcome.v1',mechanismId:t(mechanismId,180),clearedCash:cash,costs,acceptedDeliveries:Math.max(0,Math.floor(n(acceptedDeliveries))),contribution:+contribution.toFixed(2),founderMinutes:mins,contributionPerFounderMinute:mins?+(contribution/mins).toFixed(6):0,wealthEvidence:cash>0&&contribution>0,servicePromotionEligible:cash>0&&contribution>0&&Math.floor(n(acceptedDeliveries))>0,truthBoundary:'ONLY_CLEARED_CASH_OR_REALIZED_ASSET_SALE_COUNTS_AS_MONEY; UNREALIZED_VALUATIONS_DO_NOT'};
}

export function reallocateWealthCapital({candidates=[],outcomes=[],maxActive=5,maxCapitalAtRisk=0}={}){
  const byId=new Map(a(outcomes).map(x=>[x.mechanismId,x]));
  const ranked=a(candidates).map(candidate=>{
    const observed=byId.get(candidate.id)||recordWealthOutcome({mechanismId:candidate.id});
    const capRisk=Math.max(0,n(candidate.cashAtRisk));
    const allowed=capRisk<=Math.max(0,n(maxCapitalAtRisk));
    const score=observed.wealthEvidence&&allowed?observed.contributionPerFounderMinute:Number.NEGATIVE_INFINITY;
    return {mechanismId:candidate.id,score,observed,allowed};
  }).sort((x,y)=>y.score-x.score||String(x.mechanismId).localeCompare(String(y.mechanismId)));
  return {status:'WEALTH_PORTFOLIO_REALLOCATED',active:ranked.filter(x=>Number.isFinite(x.score)).slice(0,Math.max(0,Math.floor(n(maxActive,5)))).map(x=>x.mechanismId),ranking:ranked,capitalDeploymentAuthority:'NONE',truthBoundary:'OBSERVED_REALIZED_CONTRIBUTION_DRIVES_REALLOCATION'};
}

export function compileSleepWealthCycle({signals=[],candidates=[],constraints={},maxSearchCells=256,maxCanaries=5,maxCapitalAtRisk=0}={}){
  const lattice=compileEconomicSearchLattice({signals,constraints,maxCells:maxSearchCells});
  const portfolio=compileUniversalWealthPortfolio({candidates,maxCanaries,maxCapitalAtRisk});
  return {
    version:UNIVERSAL_WEALTH_ENGINE_VERSION,
    status:'SLEEP_WEALTH_CYCLE_COMPILED',
    searchLattice:lattice,
    portfolio,
    unattendedTasks:[
      'DISCOVER_POLICY_CLEARED_ECONOMIC_SIGNALS',
      'GENERATE_MECHANISM_HYPOTHESES',
      'RESEARCH_BUYER_AND_VALUE_EVIDENCE',
      'BUILD_REVERSIBLE_LOCAL_ASSETS',
      'BENCHMARK_DELIVERY_COST_AND_QUALITY',
      'PREPARE_CANARY_RECEIPTS',
      'RECONCILE_OBSERVED_CLEARED_OUTCOMES',
      'REALLOCATE_TOWARD_OBSERVED_WINNERS'
    ],
    prohibitedAutonomy:['UNAUTHORIZED_SPEND','UNAUTHORIZED_TRADING','UNAUTHORIZED_BORROWING','UNAUTHORIZED_CUSTOMER_CONTACT','UNAUTHORIZED_PUBLISHING','UNAUTHORIZED_CONTRACTING','UNAUTHORIZED_ACCOUNT_OPENING'],
    externalEffectAuthority:'NONE',
    law:'WHILE_FOUNDER_SLEEPS_UBERBOND_MAY_SEARCH_RESEARCH_BUILD_TEST_AND_PREPARE; EXTERNAL_OR_CAPITAL_EFFECTS_REQUIRE_EXISTING_GOVERNED_AUTHORITY'
  };
}
