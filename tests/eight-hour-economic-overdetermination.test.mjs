import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMoneyRoute, compileEightHourOverdetermination } from '../src/eight-hour-economic-overdetermination.mjs';

const route=(id,p=.3,e=.8,d={})=>({id,executable:true,successProbability:p,evidenceQuality:e,expectedNetContribution:100,dimensions:{buyerPool:`b${id}`,acquisitionChannel:`c${id}`,offerType:`o${id}`,paymentRail:`p${id}`,fulfillmentMode:`f${id}`,geography:`g${id}`,monetization:`m${id}`,independenceClass:`i${id}`,...d}});

test('model only routes are heavily capped',()=>{const x=normalizeMoneyRoute(route('x',.9,.1));assert.ok(x.effectiveSuccessProbability<=.00201);});
test('non executable routes contribute zero',()=>{const x=normalizeMoneyRoute({...route('x'),executable:false});assert.equal(x.effectiveSuccessProbability,0);});
test('independent routes increase bounded clearance probability',()=>{const x=compileEightHourOverdetermination({routes:[route('1'),route('2'),route('3')],targetClearanceProbability:.2,minimumDiversity:3});assert.ok(x.boundedClearanceProbability>.3);});
test('correlated routes trigger diversification',()=>{const same={buyerPool:'x',acquisitionChannel:'x',offerType:'x',paymentRail:'x',fulfillmentMode:'x',geography:'x',monetization:'x',independenceClass:'x'};const x=compileEightHourOverdetermination({routes:[route('1',.3,.8,same),route('2',.3,.8,same),route('3',.3,.8,same)],targetClearanceProbability:.2,minimumDiversity:3});assert.equal(x.saturationTargetMet,false);assert.ok(x.replacementIntents.some(item=>item.type==='DIVERSIFY_DIMENSION'));});
test('authority blocked routes are excluded',()=>{const x=compileEightHourOverdetermination({routes:[{...route('1'),authorityBlocked:true},route('2')],targetClearanceProbability:.01,minimumDiversity:1});assert.equal(x.candidateRouteCount,1);});
test('prohibited routes are excluded',()=>{const x=compileEightHourOverdetermination({routes:[{...route('1'),prohibited:true},route('2')],targetClearanceProbability:.01,minimumDiversity:1});assert.equal(x.candidateRouteCount,1);});
test('diverse evidence backed mesh can hit target',()=>{const routes=Array.from({length:16},(_,i)=>route(String(i),.6,.95));const x=compileEightHourOverdetermination({routes,targetClearanceProbability:.85,minimumDiversity:4});assert.equal(x.saturationTargetMet,true);});
test('receipt exposes no raw route ids',()=>{const x=compileEightHourOverdetermination({routes:[route('secret-route-name')],targetClearanceProbability:.01,minimumDiversity:1});assert.equal(JSON.stringify(x).includes('secret-route-name'),false);});
