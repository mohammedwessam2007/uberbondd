export const BILLION_CAPABILITY_UNIVERSE_VERSION='uberbond.billion-capability-universe.v1';
export const BILLION_CAPABILITY_OBJECT_TARGET=1_000_000_000;
export const GITHUB_REPOSITORY_DISCOVERY_HORIZON=1_000_000;

export const CAPABILITY_OBJECT_CLASSES=Object.freeze([
 'repository','module','package','skill','mcp-server','agent-protocol','model','dataset','paper','benchmark','prompt-program','tool','api','workflow','algorithm','training-recipe','evaluation','memory-mechanism','retrieval-mechanism','reasoning-mechanism','security-control','commercial-mechanism','capability-atom'
]);

export function buildBillionCapabilityUniversePlan({
 objectTarget=BILLION_CAPABILITY_OBJECT_TARGET,
 repositoryHorizon=GITHUB_REPOSITORY_DISCOVERY_HORIZON,
 seriousSupplierTarget=50_000,
 eliteCapabilityTarget=5_000,
 benchmarkTarget=500
}={}){
 const classes=[...CAPABILITY_OBJECT_CLASSES];
 return {
  ok:true,
  status:'BILLION_CAPABILITY_UNIVERSE_PLAN_COMPILED',
  objectTarget,
  repositoryHorizon,
  seriousSupplierTarget,
  eliteCapabilityTarget,
  benchmarkTarget,
  objectClasses:classes,
  objectClassCount:classes.length,
  compressionLaw:'1B_CAPABILITY_OBJECTS_TO_1M_REPOSITORY_HORIZON_TO_50K_SERIOUS_SUPPLIERS_TO_5K_ELITE_TO_HUNDREDS_BENCHMARKED_TO_MINIMUM_SUFFICIENT_ACTIVE_BUNDLE',
  truthBoundary:'A_LOGICAL_DISCOVERY_TARGET_IS_NOT_A_MEASURED_COUNT__NO_OBJECT_IS_TRUSTED_IMPORTED_APPROVED_OR_ACTIVE_WITHOUT_EVIDENCE',
  northStar:'MAXIMIZE_LONG_HORIZON_PERSONAL_CIVILIZATION_CAPABILITY_AND_RISK_ADJUSTED_CLEARED_CONTRIBUTION_PER_FOUNDER_MINUTE'
 };
}

export function summarizeHarvestProgress({measuredObjects=0,measuredRepositories=0,seriousSuppliers=0,eliteCapabilities=0,benchmarked=0}={}){
 const clean=n=>Math.max(0,Math.floor(Number(n)||0));
 const state={measuredObjects:clean(measuredObjects),measuredRepositories:clean(measuredRepositories),seriousSuppliers:clean(seriousSuppliers),eliteCapabilities:clean(eliteCapabilities),benchmarked:clean(benchmarked)};
 return {
  ...state,
  objectTargetSatisfied:state.measuredObjects>=BILLION_CAPABILITY_OBJECT_TARGET,
  repositoryHorizonSatisfied:state.measuredRepositories>=GITHUB_REPOSITORY_DISCOVERY_HORIZON,
  status:state.measuredObjects>=BILLION_CAPABILITY_OBJECT_TARGET?'BILLION_CAPABILITY_UNIVERSE_MEASURED':'BILLION_CAPABILITY_UNIVERSE_HARVESTING',
  truthBoundary:'MEASURED_RECEIPTS_ONLY'
 };
}
