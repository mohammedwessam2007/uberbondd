import { measureReachability } from './system-readiness.mjs';

const measurement = measureReachability();
const receipt = {
  schema: 'uberbond.reachability-report.v2',
  measurementMode: measurement.measurementMode,
  srcModules: measurement.srcModules,
  reachableFromProduction: measurement.reachableFromProduction,
  reachableFromOperatorScriptsOnly: measurement.reachableFromOperatorScriptsOnly,
  noEntryPointAtAll: measurement.noEntryPointAtAll,
  partitionExact: measurement.partitionExact,
  allClassified: measurement.allClassified,
  unclassified: measurement.unclassified,
  staleClassifications: measurement.staleClassifications,
  externalEffectAuthority: 'NONE'
};

console.log(`UBERBOND_REACHABILITY ${JSON.stringify(receipt)}`);
