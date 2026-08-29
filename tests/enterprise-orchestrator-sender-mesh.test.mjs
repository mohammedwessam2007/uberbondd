import test from 'node:test';
import assert from 'node:assert/strict';
import {compileEnterpriseJourney} from '../src/enterprise-journey-orchestrator.mjs';
import {allocateSenderInfrastructure} from '../src/sender-infrastructure-mesh.mjs';

const journey={journeyKey:'welcome',audienceRef:'aud:1',goalRef:'goal:1',policyRef:'policy:1',maxEntriesPerProfile:1,maxMessagesPerProfilePerDay:2,nodes:[{id:'start',type:'TRIGGER',triggerRef:'event:signup'},{id:'wait',type:'DELAY',delaySeconds:60},{id:'msg',type:'MESSAGE',channel:'EMAIL_TRANSACTIONAL',contentRef:'content:welcome',communicationPolicyRef:'comm:1'},{id:'done',type:'EXIT'}],edges:[{from:'start',to:'wait'},{from:'wait',to:'msg'},{from:'msg',to:'done'}]};

test('journey compiles bounded DAG',()=>assert.equal(compileEnterpriseJourney(journey).ok,true));
test('journey rejects cycle',()=>{const x=structuredClone(journey);x.edges.push({from:'msg',to:'wait'});assert.ok(compileEnterpriseJourney(x).reasonCodes.includes('unbounded-journey-cycle-prohibited'));});
test('journey webhook rejects raw URL/secret',()=>{const x=structuredClone(journey);x.nodes.splice(2,0,{id:'hook',type:'WEBHOOK',webhookConfigRef:'hook:1',url:'https://x'});x.edges=[{from:'start',to:'wait'},{from:'wait',to:'hook'},{from:'hook',to:'msg'},{from:'msg',to:'done'}];assert.ok(compileEnterpriseJourney(x).reasonCodes.includes('raw-webhook-credential-or-url-prohibited'));});

const healthy={id:'a',organizationRef:'org:1',sendingDomainRef:'domain:a',ipPoolRef:'ip:a',messageClasses:['MARKETING'],authentication:{spf:true,dkim:true,dmarc:true,rdns:true,tls:true,aligned:true},warmupState:'WARM',providerPolicyRef:'policy:a',dailyCapacity:1000,sentToday:100,reputation:{spamRate:0.0005},oneClickUnsubscribeReady:true,stableIdentityAttested:true};

test('sender mesh selects healthy authenticated capacity',()=>{const r=allocateSenderInfrastructure({nodes:[healthy],messageClass:'MARKETING',organizationRef:'org:1'});assert.equal(r.ok,true);assert.equal(r.allocation.senderNodeId,'a');});
test('sender mesh refuses reputation bypass rotation',()=>{const r=allocateSenderInfrastructure({nodes:[healthy],messageClass:'MARKETING',organizationRef:'org:1',rotationReason:'REPUTATION_RESET_BYPASS'});assert.ok(r.reasonCodes.includes('sender-identity-or-reputation-evasion-prohibited'));});
test('sender mesh pauses sick infrastructure rather than hopping',()=>{const bad=structuredClone(healthy);bad.reputation.spamRate=0.004;const r=allocateSenderInfrastructure({nodes:[bad],messageClass:'MARKETING',organizationRef:'org:1'});assert.ok(r.reasonCodes.includes('no-healthy-authorized-sender-node'));});
test('marketing requires one-click unsubscribe readiness',()=>{const bad=structuredClone(healthy);bad.oneClickUnsubscribeReady=false;const r=allocateSenderInfrastructure({nodes:[bad],messageClass:'MARKETING',organizationRef:'org:1'});assert.equal(r.ok,false);});
