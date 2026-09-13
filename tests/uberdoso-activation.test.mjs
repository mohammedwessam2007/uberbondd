import test from 'node:test';
import assert from 'node:assert/strict';
import { compileUberDosoActivation, UBERDOSO_MIN_HOST } from '../src/uberdoso-activation.mjs';

const postal='ghcr.io/postalserver/postal@sha256:'+'a'.repeat(64);
const mariadb='mariadb@sha256:'+'b'.repeat(64);
const host={
  publicIpv4:'203.0.113.25',ptrHostname:'mta.uberbond.cloud',outboundPort25Observed:true,inboundPort25Observed:true,
  dockerAvailable:true,persistentStorage:true,cpuCores:2,ramBytes:UBERDOSO_MIN_HOST.ramBytes,diskBytes:UBERDOSO_MIN_HOST.diskBytes,
  evidenceRefs:['receipt:physical-mail-host-proof']
};

test('activation refuses floating images and unevidenced physical mail host',()=>{
  const result=compileUberDosoActivation({postalImage:'ghcr.io/postalserver/postal:3.3.7',mariaDbImage:'mariadb:11.4'});
  assert.equal(result.ok,false);
  assert.ok(result.reasonCodes.includes('digest-pinned-postal-image-required'));
  assert.ok(result.reasonCodes.includes('digest-pinned-mariadb-image-required'));
  assert.ok(result.reasonCodes.includes('outbound-port-25-proof-required'));
  assert.equal(result.externalEffectAuthority,'NONE');
});

test('host readiness cannot masquerade as DNS readiness before observed Postal DKIM exists',()=>{
  const result=compileUberDosoActivation({postalImage:postal,mariaDbImage:mariadb,hostEvidence:host,date:'2026-09-13T00:00:00Z'});
  assert.equal(result.ok,true);
  assert.equal(result.status,'UBERDOSO_HOST_READY__POSTAL_BOOT_AND_DKIM_REQUIRED');
  assert.ok(result.dnsPlan.reasonCodes.includes('observed-postal-dkim-record-required:uberbond.agency'));
  assert.ok(result.dnsPlan.reasonCodes.includes('observed-postal-dkim-record-required:uberbond.cloud'));
  assert.equal(result.externalEffectLedger.deployments,0);
  assert.equal(result.externalEffectLedger.dnsChanges,0);
});

test('fully evidenced host plus observed DKIM yields exact DNS publication packet but no DNS authority',()=>{
  const result=compileUberDosoActivation({postalImage:postal,mariaDbImage:mariadb,hostEvidence:host,date:'2026-09-13T00:00:00Z',dkimRecordsByDomain:{
    'uberbond.agency':{host:'postal._domainkey.uberbond.agency',value:'v=DKIM1; k=rsa; p=AAA'},
    'uberbond.cloud':{host:'postal._domainkey.uberbond.cloud',value:'v=DKIM1; k=rsa; p=BBB'}
  }});
  assert.equal(result.ok,true);
  assert.equal(result.status,'UBERDOSO_DNS_PUBLICATION_PACKET_READY');
  assert.equal(result.dnsPlan.ptrRequirement.verified,true);
  assert.ok(result.dnsPlan.records.some(row=>row.host==='uberbond.agency'&&row.type==='MX'));
  assert.ok(result.dnsPlan.records.some(row=>row.host==='postal._domainkey.uberbond.cloud'));
  assert.equal(result.externalEffectAuthority,'NONE');
  assert.equal(result.externalEffectLedger.dnsChanges,0);
  assert.equal(result.externalEffectLedger.messages,0);
});

test('undersized host or wrong PTR is rejected even if every software input looks ready',()=>{
  const result=compileUberDosoActivation({postalImage:postal,mariaDbImage:mariadb,hostEvidence:{...host,cpuCores:1,ptrHostname:'wrong.uberbond.cloud'}});
  assert.equal(result.ok,false);
  assert.ok(result.reasonCodes.includes('minimum-2-cpu-cores-required'));
  assert.ok(result.reasonCodes.includes('ptr-must-match-mta.uberbond.cloud'));
});
