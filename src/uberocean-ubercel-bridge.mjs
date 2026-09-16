import { compileUberOceanSubstrate } from './uberocean-compute-fabric.mjs';
import { compileUbercelDeployment } from './ubercel-deployment-control-plane.mjs';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const UBEROCEAN_UBERCEL_BRIDGE_VERSION='uberbond.uberocean-ubercel-bridge.v1';
const zero=()=>structuredClone(ZERO_EXTERNAL_EFFECTS);
const fail=(reasonCodes,extra={})=>({ok:false,status:'UBEROCEAN_UBERCEL_BRIDGE_BLOCKED',reasonCodes:[...new Set(reasonCodes.filter(Boolean))],deploymentAuthority:'NONE',spendAuthority:'NONE',businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zero(),...extra});

export function compileUberOceanUbercelDeployment({
  serviceId='uberbond-uberlit-runtime',target='SOVEREIGN',hosts=[],requirement={},meshReceipt={},maxMonthlyCostCents=0,requireZeroNewSpend=true,requireIndependentFallback=false,
  release={},healthContract={},rollbackContract={},now=new Date()
}={}){
  const ocean=compileUberOceanSubstrate({serviceId,hosts,requirement,meshReceipt,maxMonthlyCostCents,requireZeroNewSpend,requireIndependentFallback,now});
  if(!ocean.ok)return fail(['uberocean-substrate-required',...(ocean.reasonCodes||[])],{uberOcean:ocean});
  const cel=compileUbercelDeployment({
    serviceId,target,release,
    adapters:ocean.plan.adapters,
    cloudRequirements:ocean.plan.cloudRequirements,
    resourceCells:ocean.plan.resourceCells,
    meshReceipt:ocean.plan.meshReceipt,
    maxTotalCostCents:ocean.plan.maxTotalCostCents,
    healthContract,rollbackContract
  });
  if(!cel.ok)return fail(['ubercel-plan-required',...(cel.reasonCodes||[])],{uberOcean:ocean,ubercel:cel});
  return {
    ok:true,status:'UBEROCEAN_UBERCEL_DEPLOYMENT_PLAN_READY',uberOcean:ocean,ubercel:cel,
    executionContract:{
      entrypoint:'scripts/ubercel-deploy.mjs',
      requiredAdapterType:'OWNED_LINUX',
      runtimeTarget:'UBERLIT',
      physicalHostRequired:true,
      authority:'EXPLICIT_FOUNDER_OR_AUTHORIZED_PROMOTER_ONLY'
    },
    truthBoundary:'THIS PLAN CAN RUN UBERCEL ON AN OBSERVED LINUX HOST. IT DOES NOT CREATE A HOST, SPEND MONEY, OR EXECUTE THE DEPLOYMENT BY ITSELF.',
    deploymentAuthority:'NONE',spendAuthority:'NONE',businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zero()
  };
}
