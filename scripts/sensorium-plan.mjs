#!/usr/bin/env node
import {buildAlwaysOnSensoriumPlan,nextSourceAction} from '../src/adaptive-source-ceiling-governor.mjs';
const plan=buildAlwaysOnSensoriumPlan();
const now=Date.now();
const lanes=plan.lanes.map(policy=>({sourceId:policy.sourceId,mode:policy.mode,continuous:policy.continuous,maxConcurrency:policy.maxConcurrency,decision:nextSourceAction({policy,nowMs:now})}));
console.log(JSON.stringify({schemaVersion:'uberbond.sensorium-plan.v1',generatedAt:new Date(now).toISOString(),status:plan.status,schedulerLaw:plan.schedulerLaw,lanes},null,2));
