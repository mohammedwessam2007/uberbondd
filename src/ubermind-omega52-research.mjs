// Ω52: local, pure, offline research primitives. No order placement, live feeds, or legal verdicts.
const norm=s=>s.toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]+/g,' ').trim();
export function selectOmega52(mission,index,{maxChars=620}={}) {
  if(typeof mission!=='string'||!mission.trim()||mission.length>3200)throw new TypeError('BOUNDED_MISSION_REQUIRED');
  if(index?.schema!=='ubermind.omega52.frontier-atoms.v1'||!Array.isArray(index.atoms)||index.atoms.length!==12)throw new TypeError('INDEX_REQUIRED');
  const hay=` ${norm(mission)} `;
  const hits=index.atoms.map(a=>({id:a.id,n:a.terms.filter(t=>hay.includes(` ${norm(t)} `)).length})).filter(a=>a.n>0)
    .sort((a,b)=>b.n-a.n||a.id.localeCompare(b.id));
  if(!hits.length)return null;
  const packet={schema:'ubermind.omega52.pointer.v1',atoms:hits.slice(0,3).map(x=>x.id),
    source:index.sourcebook,category:'CREATIVE_OR_RESEARCH_ONLY',
    tests:'define assumptions; seek counterexample; compare held-out evidence',authority:'NO_ORDERS_NO_EXTERNAL_EFFECTS'};
  if(JSON.stringify(packet).length>maxChars)throw new RangeError('BRIEF_TOO_LARGE');
  return packet;
}

/** H0/Vietoris-Rips connectivity at selected scales; NOT H1/H2 persistence or forecasting. */
export function sweepConnectedComponents(distances,thresholds) {
  if(!Array.isArray(distances)||distances.length<2||distances.length>40)throw new TypeError('DISTANCE_MATRIX_BOUNDS');
  const n=distances.length;
  if(!Array.isArray(thresholds)||thresholds.length<1||thresholds.length>30)throw new TypeError('THRESHOLDS_BOUNDS');
  for(let i=0;i<n;i++){
    if(!Array.isArray(distances[i])||distances[i].length!==n)throw new TypeError('NOT_SQUARE');
    for(let j=0;j<n;j++){
      const d=distances[i][j];
      if(typeof d!=='number'||!Number.isFinite(d)||d<0||
        (i===j&&d!==0)||(i!==j&&Math.abs(d-distances[j]?.[i])>1e-9))throw new TypeError('INVALID_SYMMETRIC_DISTANCE');
    }
  }
  for(let i=0;i<thresholds.length;i++)if(typeof thresholds[i]!=='number'||!Number.isFinite(thresholds[i])||thresholds[i]<0||
    (i>0&&thresholds[i]<=thresholds[i-1]))throw new TypeError('THRESHOLDS_MUST_INCREASE');
  const results=[];
  for(const threshold of thresholds){
    const parent=Array.from({length:n},(_,i)=>i);let comps=n;
    const root=x=>{while(parent[x]!==x){parent[x]=parent[parent[x]];x=parent[x]}return x;};
    for(let i=0;i<n;i++)for(let j=i+1;j<n;j++)if(distances[i][j]<=threshold){
      const a=root(i),b=root(j);if(a!==b){parent[b]=a;comps--;}
    }
    results.push({threshold,components:comps});
  }
  return {schema:'ubermind.omega52.h0-sweep.v1',dimension:'H0_ONLY',points:n,
    observations:results,interpretation:'COMPONENTS_NOT_FORECASTS',authority:'NO_EXTERNAL_EFFECTS'};
}

/** Conceptual independent multiplicative scenario model; NOT investment sizing or advice. */
export function compareEnsembleAndTimeGrowth(outcomes) {
  if(!Array.isArray(outcomes)||outcomes.length<1||outcomes.length>40)throw new TypeError('OUTCOMES_BOUNDS');
  let total=0,expectedMultiplier=0,expectedLogGrowth=0,absorbingRuin=false;
  for(const o of outcomes){
    if(!o||typeof o.probability!=='number'||!Number.isFinite(o.probability)||o.probability<=0||o.probability>1||
      typeof o.multiplier!=='number'||!Number.isFinite(o.multiplier)||o.multiplier<0||o.multiplier>100)throw new TypeError('INVALID_SCENARIO');
    total+=o.probability;
    expectedMultiplier+=o.probability*o.multiplier;
    if(o.multiplier===0)absorbingRuin=true;
    else expectedLogGrowth+=o.probability*Math.log(o.multiplier);
  }
  if(Math.abs(total-1)>1e-9)throw new TypeError('PROBABILITIES_MUST_SUM_TO_ONE');
  if(absorbingRuin)expectedLogGrowth=-Infinity;
  return {schema:'ubermind.omega52.time-vs-ensemble.v1',ensembleExpectedMultiplier:expectedMultiplier,
    timeAverageLogGrowth:expectedLogGrowth,timeAverageGeometricMultiplier:absorbingRuin?0:Math.exp(expectedLogGrowth),
    hasAbsorbingRuin:absorbingRuin,assumptions:'INDEPENDENT_IDENTICALLY_DISTRIBUTED_MULTIPLIERS;IDEALIZED;NO_FEES_OR_MODEL_ERROR',
    status:'SCENARIO_ANALYSIS_ONLY',authority:'NO_TRADING'};
}
