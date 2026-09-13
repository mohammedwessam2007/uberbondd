import { compileBusinessGenome } from './opportunity-registry.mjs';
import { extractMechanismAtoms, recombineMechanismAtoms } from './mechanism-lab.mjs';
import { compileEconomicSearchLattice, compileUniversalWealthPortfolio } from './universal-wealth-engine.mjs';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const TOTAL_COMMERCIAL_GENOME_OFFER_UNIVERSE_WEALTH_VERSION='uberbond.total-commercial-genome-offer-universe-wealth.v1';
const zero=()=>structuredClone(ZERO_EXTERNAL_EFFECTS);
const text=(v,m=600)=>String(v??'').trim().slice(0,m);

function mechanismGenome(compiled){
  if(!compiled?.ok||!compiled.fields)return{};
  const out={};
  for(const [field,record] of Object.entries(compiled.fields)){
    if(!record?.present)continue;
    out[field]={
      value:record.value,
      evidenceClass:record.claimType||'UNRESOLVED'
    };
  }
  return out;
}

export function compileTotalCommercialGenomeOfferUniverseWealth({
  candidate=null,
  evidenceRefs=[],
  buyer='',
  objective='discover and validate economically useful offers',
  signals=[],
  wealthCandidates=[],
  constraints={},
  maxOfferHypotheses=25,
  maxSearchCells=256,
  maxCanaries=5,
  maxCapitalAtRisk=0,
  date=new Date()
}={}){
  const externalEffectLedger=zero();
  if(!candidate||typeof candidate!=='object'||!candidate.id){
    return{
      ok:true,
      version:TOTAL_COMMERCIAL_GENOME_OFFER_UNIVERSE_WEALTH_VERSION,
      status:'NO_COMMERCIAL_GENOME_INPUT',
      commercialGenome:null,
      offerUniverse:{status:'NO_INPUT',candidateCount:0,candidates:[]},
      wealth:{searchLattice:compileEconomicSearchLattice({signals,constraints,maxCells:maxSearchCells}),portfolio:compileUniversalWealthPortfolio({candidates:wealthCandidates,maxCanaries,maxCapitalAtRisk})},
      externalEffectAuthority:'NONE',capitalDeploymentAuthority:'NONE',moneyClaimAuthority:'NONE',externalEffectLedger,
      truthBoundary:'ABSENT COMMERCIAL INPUT STAYS ABSENT; THE AGGREGATE NEVER INVENTS A BUYER, OFFER, DEMAND, PAYMENT OR REVENUE.'
    };
  }

  const commercialGenome=compileBusinessGenome(candidate);
  if(!commercialGenome.ok){
    return{ok:false,version:TOTAL_COMMERCIAL_GENOME_OFFER_UNIVERSE_WEALTH_VERSION,status:'COMMERCIAL_GENOME_REFUSED',reasonCodes:[commercialGenome.reason||'commercial-genome-refused'],externalEffectAuthority:'NONE',externalEffectLedger};
  }

  const atoms=extractMechanismAtoms({
    modelId:candidate.id,
    genome:mechanismGenome(commercialGenome),
    evidenceRefs,
    maxAtoms:100,
    date
  });
  const offers=recombineMechanismAtoms({
    atoms:atoms?.atoms||[],
    buyer:text(buyer)||text(candidate.buyer?.value??candidate.buyer)||'UNKNOWN',
    objective:text(objective)||'UNKNOWN',
    maxCandidates:maxOfferHypotheses,
    date
  });
  const searchLattice=compileEconomicSearchLattice({signals,constraints,maxCells:maxSearchCells});
  const portfolio=compileUniversalWealthPortfolio({candidates:wealthCandidates,maxCanaries,maxCapitalAtRisk});

  return{
    ok:true,
    version:TOTAL_COMMERCIAL_GENOME_OFFER_UNIVERSE_WEALTH_VERSION,
    status:'TOTAL_COMMERCIAL_GENOME_OFFER_UNIVERSE_WEALTH_COMPILED',
    commercialGenome:{id:commercialGenome.id,name:commercialGenome.name,category:commercialGenome.category,completeness:commercialGenome.completeness,promotionStage:commercialGenome.promotionStage},
    offerUniverse:{status:offers.status,atomCount:atoms?.atoms?.length||0,candidateCount:offers?.candidates?.length||0,candidates:(offers?.candidates||[]).map(row=>({candidateId:row.candidateId,status:row.status,evidenceStatus:row.evidenceStatus,mechanismAtomIds:row.mechanismAtomIds,pricingHypothesis:row.pricingHypothesis,paymentProof:row.paymentProof}))},
    wealth:{searchLattice:{status:searchLattice.status,cellCount:searchLattice.cellCount,truthBoundary:searchLattice.truthBoundary},portfolio:{status:portfolio.status,canaries:portfolio.canaries,capitalDeploymentAuthority:portfolio.capitalDeploymentAuthority,tradingAuthority:portfolio.tradingAuthority,truthBoundary:portfolio.truthBoundary}},
    externalEffectAuthority:'NONE',capitalDeploymentAuthority:'NONE',moneyClaimAuthority:'NONE',externalEffectLedger,
    truthBoundary:'COMMERCIAL GENOME IS STRUCTURED INPUT; OFFER-UNIVERSE RECOMBINATIONS ARE UNPROVEN HYPOTHESES; WEALTH SEARCH CELLS ARE NOT INCOME; NO MONEY COUNTS WITHOUT CLEARED AND RECONCILED OUTCOME EVIDENCE.'
  };
}
