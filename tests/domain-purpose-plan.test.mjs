import test from 'node:test';
import assert from 'node:assert/strict';
import { compileDomainPurposePlan, evaluateDomainObservation } from '../src/domain-purpose-plan.mjs';

const plan = compileDomainPurposePlan({
  rootDomain:'uberbond.agency',
  assignments:{
    APP_PRODUCT:'app.uberbond.agency',
    OUTBOUND:'send.uberbond.agency',
    INBOUND_REPLIES:'reply.uberbond.agency',
    TRACKING:'track.uberbond.agency',
    TRANSACTIONAL:'tx.uberbond.agency',
    TESTING:'test.uberbond.agency'
  },
  providerRequirements:{
    OUTBOUND:{requiresTls:true},
    TRACKING:{requiresTls:true},
    TRANSACTIONAL:{requiresTls:true}
  }
});
const row = plan.rows.find(item => item.purpose === 'OUTBOUND');
const now = '2026-09-03T12:00:00.000Z';

function green(overrides={}) {
  return {
    status:'GREEN',
    observedAt:'2026-09-03T11:00:00.000Z',
    provenance:'EXTERNAL_DNS_OBSERVATION',
    tlsVerified:true,
    generatedExpectedRecords:false,
    ...overrides
  };
}

test('independent fresh observed DNS can verify the configured purpose',()=>{
  assert.equal(evaluateDomainObservation({planRow:row,observation:green(),now}).state,'VERIFIED');
});

test('a record this system generated cannot verify itself',()=>{
  const result=evaluateDomainObservation({planRow:row,observation:green({provenance:'SYSTEM_GENERATED_EXPECTATION'}),now});
  assert.notEqual(result.state,'VERIFIED');
  assert.ok(result.reasonCodes.includes('dns-observation-provenance-not-independent'));
});

test('generated expected records remain configuration evidence, not observed DNS proof',()=>{
  const result=evaluateDomainObservation({planRow:row,observation:green({generatedExpectedRecords:true}),now});
  assert.equal(result.state,'CONFIGURED');
  assert.ok(result.reasonCodes.includes('generated-expectations-are-not-observed-proof'));
});

test('a stale DNS observation stops verifying',()=>{
  const result=evaluateDomainObservation({planRow:row,observation:green({observedAt:'2026-09-01T00:00:00.000Z'}),now});
  assert.equal(result.state,'UNKNOWN');
  assert.ok(result.reasonCodes.includes('dns-observation-stale'));
});
