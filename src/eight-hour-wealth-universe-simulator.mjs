import crypto from 'node:crypto';

export const EIGHT_HOUR_WEALTH_SIM_VERSION='uberbond.eight-hour-wealth-universe-simulator.v1';

export const OPEN_WORLD_ECONOMIC_AXES=Object.freeze({
  valueSources:['REVENUE_GAIN','COST_REDUCTION','TIME_SAVED','RISK_REDUCTION','INFORMATION_ADVANTAGE','CONVENIENCE','ACCESS','COORDINATION','ENTERTAINMENT','STATUS','TRANSFORMATION','COMPLIANCE','LIQUIDITY','SCARCITY','DISCOVERY','CERTIFICATION','MATCHING','FINANCING'],
  assetForms:['LABOR','SERVICE','SOFTWARE','DATA','MEDIA','KNOWLEDGE','IP','NETWORK','AUDIENCE','PHYSICAL_GOOD','COMPUTE','CAPITAL','REAL_ASSET','REAL_ESTATE','WORKFLOW','BRAND','LICENSE_RIGHT','INVENTORY','ENERGY','EVENT','COMMUNITY_ACCESS','FINANCIAL_CLAIM'],
  captureModels:['WAGE','SALARY','TIP','ONE_TIME_SALE','SUBSCRIPTION','USAGE','LICENSE','ROYALTY','COMMISSION','MARKETPLACE_TAKE_RATE','REFERRAL','SPONSORSHIP','ADVERTISING','RENTAL','LEASE','RETAINER','PROJECT_FEE','MAINTENANCE','SUCCESS_FEE','BOUNTY','PRIZE','GRANT','REBATE','DONATION','CROWDFUND','PREORDER','PROFIT_SHARE','EQUITY','DIVIDEND','INTEREST','CAPITAL_GAIN','ARBITRAGE_SPREAD','WHOLESALE_MARGIN','MANUFACTURING_MARGIN','RESALE','YIELD','INSURANCE_PAYOUT','FRANCHISE_FEE'],
  distribution:['EMPLOYER','DIRECT_SALES','INBOUND','MARKETPLACE','PARTNERSHIP','RESELLER','AFFILIATE','SEO','SOCIAL','COMMUNITY','APP_STORE','API','PROCUREMENT','LOCAL_OFFLINE','EMBEDDED_DISTRIBUTION','AUCTION','EXCHANGE','BROKER','FRANCHISE','WHOLESALE','RETAIL','PLATFORM','LICENSING_AGENT'],
  buyerClasses:['EMPLOYER','CONSUMER','CREATOR','SMB','ENTERPRISE','GOVERNMENT','NONPROFIT','DEVELOPER','OPERATOR','INVESTOR','MARKETPLACE_PARTICIPANT','INSTITUTION','PUBLISHER','ADVERTISER','LANDLORD','TENANT','LICENSEE','DISTRIBUTOR'],
  horizons:['MINUTES','HOURS','DAYS','WEEKS','MONTHS','YEARS','DECADES'],
  productionModes:['HUMAN_LABOR','AUTOMATED_SOFTWARE','CAPITAL','PHYSICAL_ASSET','NETWORK','IP','DATA','BROKERAGE','MANUFACTURING','RENTAL','LICENSING','RESELLING','CREATION','RESEARCH','COORDINATION'],
});

const n=(v,f=0)=>Number.isFinite(Number(v))?Number(v):f;
const c=v=>Math.max(0,Math.min(1,n(v)));
const arr=v=>Array.isArray(v)?v:[];
const round=(v,d=2)=>Number(n(v).toFixed(d));
const hash=value=>crypto.createHash('sha256').update(String(value??'')).digest('hex');
const safeId=value=>String(value??'').trim().slice(0,180)||null;

function productBigInt(values){
  return values.reduce((acc,v)=>acc*BigInt(Math.max(1,Number(v))),1n);
}

function deterministicUnit(seed){
  const hex=hash(seed).slice(0,13);
  return Number.parseInt(hex,16)/0x1fffffffffffff;
}

function mulberry32(seed){
  let a=seed>>>0;
  return function(){
    a|=0; a=a+0x6D2B79F5|0;
    let t=Math.imul(a^a>>>15,1|a);
    t=t+Math.imul(t^t>>>7,61|t)^t;
    return ((t^t>>>14)>>>0)/4294967296;
  };
}

function seedInt(seed){
  return Number.parseInt(hash(seed).slice(0,8),16)>>>0;
}

function quantile(sorted,q){
  if(!sorted.length) return null;
  const pos=(sorted.length-1)*c(q);
  const lo=Math.floor(pos), hi=Math.ceil(pos);
  if(lo===hi) return sorted[lo];
  return sorted[lo]+(sorted[hi]-sorted[lo])*(pos-lo);
}

function sampleBinomial(trials,p,rng){
  const N=Math.max(0,Math.floor(n(trials)));
  const prob=c(p);
  if(!N||!prob) return 0;
  if(prob===1) return N;
  if(N<=128){
    let successes=0;
    for(let i=0;i<N;i++) if(rng()<prob) successes++;
    return successes;
  }
  const mean=N*prob;
  const variance=N*prob*(1-prob);
  const u1=Math.max(Number.EPSILON,rng());
  const u2=rng();
  const z=Math.sqrt(-2*Math.log(u1))*Math.cos(2*Math.PI*u2);
  return Math.max(0,Math.min(N,Math.round(mean+z*Math.sqrt(variance))));
}

export function compileOpenWorldMoneyUniverse({domains=['general'],materializedSamples=2048,seed='uberbond-open-world'}={}){
  const domainList=arr(domains).length?arr(domains).map(String):['general'];
  const axes=Object.entries(OPEN_WORLD_ECONOMIC_AXES);
  const total=productBigInt([domainList.length,...axes.map(([,values])=>values.length)]);
  const sampleCount=Math.max(1,Math.min(Math.floor(n(materializedSamples,2048)),100000));
  const totalNumber=total<=BigInt(Number.MAX_SAFE_INTEGER)?Number(total):Number.MAX_SAFE_INTEGER;
  const samples=[];
  for(let i=0;i<sampleCount;i++){
    const frac=(i+deterministicUnit(`${seed}:${i}`))/sampleCount;
    let index=Math.floor(frac*totalNumber);
    const cell={};
    for(let axisIndex=axes.length-1;axisIndex>=0;axisIndex--){
      const [name,values]=axes[axisIndex];
      const choice=index%values.length;
      index=Math.floor(index/values.length);
      cell[name]=values[choice];
    }
    cell.domain=domainList[index%domainList.length];
    const fingerprint=JSON.stringify(cell);
    samples.push({id:`money-universe:${hash(fingerprint).slice(0,20)}`,...cell,status:'HYPOTHESIS_SPACE_CELL'});
  }
  return {
    version:EIGHT_HOUR_WEALTH_SIM_VERSION,
    status:'OPEN_WORLD_MONEY_UNIVERSE_COMPILED',
    addressableCombinationCount:total.toString(),
    materializedSampleCount:samples.length,
    samples,
    openWorld:true,
    unknownMechanismFrontier:true,
    truthBoundary:'FINITE_GRAMMAR_CANNOT_PROVE_ALL_POSSIBLE_WAYS_TO_MAKE_MONEY; THIS_INDEX_COVERS_CURRENT_ADDRESSABLE_COMBINATIONS_AND_PRESERVES_AN_OPEN_UNKNOWN_FRONTIER'
  };
}

export function normalizeEightHourMechanism(candidate={},sleepHours=8){
  const id=safeId(candidate.id);
  const reasons=[];
  if(!id) reasons.push('id-required');
  if(candidate.policyCleared!==true) reasons.push('policy-clearance-required');
  if(candidate.authorityAvailable!==true) reasons.push('authority-required-for-executable-simulation');
  const required=['grossIfSuccess','successProbabilityPerAttempt','attemptsPerHour','settlementProbabilityWithinWindow','netMargin'];
  for(const key of required) if(!Number.isFinite(Number(candidate[key]))) reasons.push(`${key}-required`);
  const grossIfSuccess=Math.max(0,n(candidate.grossIfSuccess));
  const successProbabilityPerAttempt=c(candidate.successProbabilityPerAttempt);
  const settlementProbabilityWithinWindow=c(candidate.settlementProbabilityWithinWindow);
  const deliveryAcceptanceProbability=c(candidate.deliveryAcceptanceProbability??1);
  const attemptsPerHour=Math.max(0,n(candidate.attemptsPerHour));
  const setupHours=Math.max(0,n(candidate.setupHours));
  const activeHours=Math.max(0,n(sleepHours,8)-setupHours);
  const attempts=Math.floor(activeHours*attemptsPerHour);
  const netMargin=c(candidate.netMargin);
  const fixedCost=Math.max(0,n(candidate.fixedCost));
  const cashAtRisk=Math.max(0,n(candidate.cashAtRisk));
  const capitalLossProbability=c(candidate.capitalLossProbability);
  const evidenceQuality=c(candidate.evidenceQuality);
  const combinedSuccessProbability=successProbabilityPerAttempt*settlementProbabilityWithinWindow*deliveryAcceptanceProbability;
  const expectedClearedGross=attempts*grossIfSuccess*combinedSuccessProbability;
  const expectedCapitalLoss=cashAtRisk*capitalLossProbability;
  const expectedNetContribution=(expectedClearedGross*netMargin)-fixedCost-expectedCapitalLoss;
  const fantasyGrossCeiling=attempts*grossIfSuccess;
  const executableGrossCeiling=reasons.length?0:fantasyGrossCeiling;
  return {
    id,
    valid:reasons.length===0,
    reasons,
    attempts,
    activeHours:round(activeHours,4),
    grossIfSuccess,
    combinedSuccessProbability:round(combinedSuccessProbability,9),
    netMargin,
    fixedCost,
    cashAtRisk,
    capitalLossProbability,
    evidenceQuality,
    fantasyGrossCeiling:round(fantasyGrossCeiling),
    executableGrossCeiling:round(executableGrossCeiling),
    expectedClearedGross:round(expectedClearedGross),
    expectedNetContribution:round(expectedNetContribution),
    expectedNetPerActiveHour:activeHours?round(expectedNetContribution/activeHours,4):0,
    raw:candidate
  };
}

export function simulateEightHourWealthUniverse({mechanisms=[],sleepHours=8,iterations=5000,seed='uberbond-8h',maxConcurrentMechanisms=64,maxCapitalAtRisk=0}={}){
  const hours=Math.max(0.25,Math.min(24,n(sleepHours,8)));
  const normalized=arr(mechanisms).map(x=>normalizeEightHourMechanism(x,hours));
  const exclusionReasons={};
  for(const item of normalized){
    if(item.cashAtRisk>Math.max(0,n(maxCapitalAtRisk))) item.reasons.push('capital-at-risk-limit');
    item.valid=item.reasons.length===0;
    for(const reason of item.reasons) exclusionReasons[reason]=(exclusionReasons[reason]||0)+1;
  }
  const eligible=normalized.filter(x=>x.valid&&x.expectedNetContribution>0)
    .sort((a,b)=>b.expectedNetPerActiveHour-a.expectedNetPerActiveHour||String(a.id).localeCompare(String(b.id)));
  const selected=eligible.slice(0,Math.max(0,Math.floor(n(maxConcurrentMechanisms,64))));
  const fantasyGrossCeiling=round(normalized.reduce((sum,x)=>sum+x.fantasyGrossCeiling,0));
  const executableGrossCeiling=round(selected.reduce((sum,x)=>sum+x.executableGrossCeiling,0));
  const expectedClearedGross=round(selected.reduce((sum,x)=>sum+x.expectedClearedGross,0));
  const analyticExpectedNetContribution=round(selected.reduce((sum,x)=>sum+x.expectedNetContribution,0));
  const trials=Math.max(100,Math.min(50000,Math.floor(n(iterations,5000))));
  const rng=mulberry32(seedInt(`${seed}:${hours}:${selected.map(x=>x.id).join('|')}`));
  const outcomes=[];
  let positive=0;
  for(let i=0;i<trials;i++){
    let net=0;
    for(const item of selected){
      const wins=sampleBinomial(item.attempts,item.combinedSuccessProbability,rng);
      const gross=wins*item.grossIfSuccess;
      const realizedCapitalLoss=rng()<item.capitalLossProbability?item.cashAtRisk:0;
      net+=(gross*item.netMargin)-item.fixedCost-realizedCapitalLoss;
    }
    net=round(net);
    if(net>0) positive++;
    outcomes.push(net);
  }
  outcomes.sort((a,b)=>a-b);
  const simulatedMean=outcomes.length?round(outcomes.reduce((a,b)=>a+b,0)/outcomes.length):0;
  const evidenceWeightedExpectedNet=round(selected.reduce((sum,x)=>sum+x.expectedNetContribution*(0.25+0.75*x.evidenceQuality),0));
  return {
    version:EIGHT_HOUR_WEALTH_SIM_VERSION,
    status:selected.length?'EIGHT_HOUR_WEALTH_SIMULATED':'NO_EXECUTABLE_MECHANISMS_TO_SIMULATE',
    sleepHours:hours,
    mechanismCount:normalized.length,
    eligibleMechanismCount:eligible.length,
    selectedMechanismCount:selected.length,
    selectedMechanismIds:selected.map(x=>x.id),
    fantasyGrossCeiling,
    executableGrossCeiling,
    expectedClearedGross,
    analyticExpectedNetContribution,
    evidenceWeightedExpectedNetContribution:evidenceWeightedExpectedNet,
    simulation:{
      iterations:trials,
      meanNetContribution:simulatedMean,
      p10:round(quantile(outcomes,.10)??0),
      p50:round(quantile(outcomes,.50)??0),
      p90:round(quantile(outcomes,.90)??0),
      p99:round(quantile(outcomes,.99)??0),
      probabilityPositive:round(positive/trials,6)
    },
    exclusionReasons,
    assumptionsAreHypotheses:true,
    moneyClaimAuthority:'NONE',
    truthBoundary:'THIS_IS_A_COUNTERFACTUAL_MONTE_CARLO_OVER_EXPLICIT_ASSUMPTIONS; IT_IS_NOT_REVENUE, A FORECAST, OR EVIDENCE_OF_CLEARED_PAYMENT'
  };
}
