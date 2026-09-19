#!/usr/bin/env node
import path from 'node:path';
import { summarizeSemanticCalibration } from '../src/semantic-shadow-ledger.mjs';

const arg=name=>{const i=process.argv.indexOf(`--${name}`);return i>=0?String(process.argv[i+1]||''):'';};
const runtimeRoot=path.resolve(arg('root')||process.env.UBERLIT_ROOT||'/var/lib/uberlit/uberbond');
const taskClass=arg('task-class')||null;
const result=summarizeSemanticCalibration({runtimeRoot,taskClass});
process.stdout.write(`${JSON.stringify({
  schema:'uberbond.jev-calibration-doctor.v1',
  runtimeRoot,
  result,
  promotionRule:{
    minimumOutcomes:100,
    minimumAccuracy:0.98,
    maximumCalibrationError:0.02,
    minimumStableWindows:3,
    automaticPromotion:false
  },
  truthBoundary:'SHADOW_OUTCOMES_ONLY__NO_AUTOMATIC_AUTHORITY_OR_PRODUCTION_PROMOTION'
},null,2)}\n`);
