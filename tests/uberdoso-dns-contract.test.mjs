import test from 'node:test';
import assert from 'node:assert/strict';
import { compileUberDosoTopology, compileUberDosoDnsPlan } from '../src/uberdoso-kernel.mjs';
import { compileUberDosoVerifierContracts } from '../src/uberdoso-dns-contract.mjs';

test('ready UberDoso DNS packet compiles canonical verifier contracts for both roots',()=>{
  const topology=compileUberDosoTopology().topology;
  const dns=compileUberDosoDnsPlan({topology,publicIpv4:'203.0.113.25',ptrHostname:'mta.uberbond.cloud',dkimRecordsByDomain:{
    'uberbond.agency':{host:'postal._domainkey.uberbond.agency',value:'v=DKIM1; k=rsa; p=AAA'},
    'uberbond.cloud':{host:'postal._domainkey.uberbond.cloud',value:'v=DKIM1; k=rsa; p=BBB'}
  },date:'2026-09-13T00:00:00Z'});
  const result=compileUberDosoVerifierContracts({dnsPlan:dns.plan});
  assert.equal(result.ok,true);
  assert.deepEqual(Object.keys(result.contracts).sort(),['uberbond.agency','uberbond.cloud']);
  for(const root of Object.keys(result.contracts)){
    const c=result.contracts[root];
    assert.deepEqual(c.mxHostSuffixes,['mta.uberbond.cloud']);
    assert.deepEqual(c.spfIncludes,['spf.uberbond.cloud']);
    assert.equal(c.dkimSelector,'postal');
    assert.equal(c.dmarcMinPolicy,'quarantine');
  }
  assert.equal(result.externalEffectLedger.dnsChanges,0);
});

test('blocked DNS plan cannot be converted into verifier expectations',()=>{
  const topology=compileUberDosoTopology().topology;
  const dns=compileUberDosoDnsPlan({topology});
  const result=compileUberDosoVerifierContracts({dnsPlan:dns.plan});
  assert.equal(result.ok,false);
  assert.ok(result.reasonCodes.includes('dns-plan-must-be-ready-before-verifier-contract'));
});
