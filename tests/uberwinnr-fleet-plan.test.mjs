import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compileWinnrPostPurchaseRegistryPlan,
  compileWinnrPostPurchaseFleetPlan,
  applyWinnrPostPurchaseFleetPlan
} from '../src/uberwinnr-postpurchase.mjs';
import { inspectWinnrCredentialExport, compileWinnrCredentialImport } from '../src/uberwinnr-credential-import.mjs';
import { loadSendingDomain } from '../src/sending-domain-registry.mjs';
import { classifyWinnrDomainOwnership } from '../src/winnr-domain-ownership.mjs';

const HEADER='domain,from_email,from_name,user_name,password,smtp_host,smtp_port,imap_host,imap_port,imap_username,imap_password,footer';

// Synthetic fleet: 10 domains x 5 mailboxes = 50 Startup mailboxes. Credentials are fake placeholders.
function fleetCsv({domains=10,perDomain=5}={}){
  const rows=[HEADER];
  for(let d=1;d<=domains;d++){
    const domain=`fleet-${String(d).padStart(2,"0")}-startup.co`;
    for(let m=1;m<=perDomain;m++){
      const email=`box${m}@${domain}`;
      rows.push(`${domain},${email},Box ${m},${email},secret-${d}-${m},smtp.example.net,465,imap.example.net,993,${email},imap-secret-${d}-${m},`);
    }
  }
  return rows.join('\n');
}

// Provider-side facts as the Winnr API reports them for Startup domains: customer-registered, Winnr-hosted DNS, not pre-warmed.
function providerFixtures(csv){
  const inspection=inspectWinnrCredentialExport(csv);
  const providerDomainRecordsByDomain={};
  const providerDomainIdsByDomain={};
  const providerMailboxIdsByEmail={};
  for(const domain of inspection.domains){
    providerDomainRecordsByDomain[domain]={name:domain,tags:[],registrar:'external',dns_provider:'winnr_20'};
    providerDomainIdsByDomain[domain]=`prov-domain-${domain}`;
  }
  for(const row of inspection.rows)providerMailboxIdsByEmail[row.email]=`prov-mailbox-${row.email}`;
  return {providerDomainRecordsByDomain,providerDomainIdsByDomain,providerMailboxIdsByEmail};
}

const ATTEST={ownerAttestedRegistrar:'godaddy',ownerAttestationRef:'owner-mission:UBERBOND_WINNR_FLEET_FINAL_INTEGRATION_2026-10-13'};

function store(){
  const rows=[];
  return {
    rows,
    async log(type,detail){const row={id:`audit-${rows.length+1}`,type,detail,createdAt:detail.timestamp||new Date().toISOString()};rows.push(row);return {id:row.id,type,detail};},
    async list(collection,{filters}={}){
      if(collection!=='auditLog')return[];
      return rows.filter(row=>!filters?.type||row.type===filters.type);
    },
    async count(collection,filters={}){
      if(collection!=='auditLog')return 0;
      return rows.filter(row=>!filters?.type||row.type===filters.type).length;
    }
  };
}

test('fleet plan maps 50 mailboxes across 10 domains without carrying any password',()=>{
  const csv=fleetCsv();
  const plan=compileWinnrPostPurchaseFleetPlan({csvText:csv,...providerFixtures(csv),...ATTEST});
  assert.equal(plan.ok,true);
  assert.equal(plan.status,'WINNR_POSTPURCHASE_FLEET_PLAN_READY');
  assert.equal(plan.domainCount,10);
  assert.equal(plan.mailboxCount,50);
  assert.equal(plan.domainPlans.length,10);
  assert.equal(plan.domainPlans.every(p=>p.mailboxes.length===5),true);
  assert.equal(Object.keys(plan.linksByEmail).length,50);
  assert.equal(JSON.stringify(plan).includes('secret-'),false);
  assert.equal(JSON.stringify(plan).includes('imap-secret-'),false);
});

test('each mailbox link points at the domain identity of its own domain plan',()=>{
  const csv=fleetCsv();
  const plan=compileWinnrPostPurchaseFleetPlan({csvText:csv,...providerFixtures(csv),...ATTEST});
  for(const domainPlan of plan.domainPlans){
    for(const row of domainPlan.mailboxes){
      assert.equal(plan.linksByEmail[row.email].sendingDomainId,domainPlan.domain.domainId);
      assert.equal(plan.linksByEmail[row.email].sendingMailboxId,row.mailboxId);
    }
  }
});

test('Startup domains are customer-owned Winnr-DNS domains, never pre-warmed leases',()=>{
  const csv=fleetCsv();
  const plan=compileWinnrPostPurchaseFleetPlan({csvText:csv,...providerFixtures(csv),...ATTEST});
  for(const domainPlan of plan.domainPlans){
    assert.equal(domainPlan.domain.classification,'CUSTOMER_OWNED_WINNR_DNS');
    assert.equal(domainPlan.domain.ownershipStatus,'OWNER_CONFIRMED');
    assert.equal(domainPlan.domain.registrar,'godaddy');
    assert.equal(domainPlan.domain.provider,'winnr-dns-hosted');
    assert.notEqual(domainPlan.domain.ownershipStatus,'PROVIDER_CONTROL_CONFIRMED');
    for(const row of domainPlan.mailboxes)assert.equal(row.mailboxProvider,'winnr-customer-domain');
  }
});

test('without an owner attestation the Startup domains stay UNVERIFIED rather than control-confirmed',()=>{
  const csv=fleetCsv();
  const plan=compileWinnrPostPurchaseFleetPlan({csvText:csv,...providerFixtures(csv)});
  assert.equal(plan.ok,true);
  for(const domainPlan of plan.domainPlans){
    assert.equal(domainPlan.domain.ownershipStatus,'UNVERIFIED');
    assert.equal(domainPlan.domain.registrar,'external');
  }
});

test('a pre-warmed tagged domain is classified as the Winnr lease, and only that one',()=>{
  const prewarmed=classifyWinnrDomainOwnership({providerDomain:{name:'cedar.example',tags:['pre-warmed'],registrar:'external',dns_provider:'winnr_20'}});
  assert.equal(prewarmed.ok,true);
  assert.equal(prewarmed.classification,'WINNR_PREWARMED_LEASED');
  assert.equal(prewarmed.ownershipStatus,'PROVIDER_CONTROL_CONFIRMED');
  assert.equal(prewarmed.provider,'winnr-prewarmed');
  const customer=classifyWinnrDomainOwnership({providerDomain:{name:'startup.example',tags:[],registrar:'external',dns_provider:'winnr_20'},ownerAttestedRegistrar:'godaddy',ownerAttestationRef:'ref'});
  assert.equal(customer.classification,'CUSTOMER_OWNED_WINNR_DNS');
  assert.notEqual(customer.provider,'winnr-prewarmed');
});

test('a domain with no provider record is refused, never defaulted to pre-warmed',()=>{
  const csv=fleetCsv();
  const fixtures=providerFixtures(csv);
  delete fixtures.providerDomainRecordsByDomain['fleet-04-startup.co'];
  const plan=compileWinnrPostPurchaseFleetPlan({csvText:csv,...fixtures,...ATTEST});
  assert.equal(plan.ok,false);
  assert.equal(plan.failedDomain,'fleet-04-startup.co');
  assert.ok(plan.reasonCodes.includes('provider-domain-record-required'));
  assert.equal(plan.providerCalls,0);
  assert.equal(plan.messagesSent,0);
});

test('a provider mailbox id is required for every address (no positional identity)',()=>{
  const csv=fleetCsv();
  const fixtures=providerFixtures(csv);
  delete fixtures.providerMailboxIdsByEmail['box3@fleet-02-startup.co'];
  const plan=compileWinnrPostPurchaseFleetPlan({csvText:csv,...fixtures,...ATTEST});
  assert.equal(plan.ok,false);
  assert.ok(plan.reasonCodes.includes('provider-mailbox-id-required'));
});

test('single-domain plan still refuses a multi-domain export (behaviour preserved)',()=>{
  const p=compileWinnrPostPurchaseRegistryPlan({csvText:fleetCsv()});
  assert.equal(p.ok,false);
  assert.ok(p.reasonCodes.includes('exactly-one-prewarmed-domain-required'));
});

test('fleet plan refuses an empty export without provider calls',()=>{
  const p=compileWinnrPostPurchaseFleetPlan({csvText:HEADER});
  assert.equal(p.ok,false);
  assert.equal(p.providerCalls,0);
  assert.equal(p.messagesSent,0);
  assert.ok(p.reasonCodes.includes('credential-export-mailboxes-required'));
});

test('fleet registry application is idempotent across all 10 domains and records customer ownership',async()=>{
  const s=store();
  const csv=fleetCsv();
  const plan=compileWinnrPostPurchaseFleetPlan({csvText:csv,...providerFixtures(csv),...ATTEST});
  const first=await applyWinnrPostPurchaseFleetPlan({store:s,fleetPlan:plan,date:new Date('2026-10-13T09:00:00Z')});
  assert.equal(first.ok,true);
  assert.equal(first.domainCount,10);
  assert.equal(first.mailboxCount,50);
  assert.equal(Object.keys(first.linksByEmail).length,50);
  const domainState=await loadSendingDomain(s,plan.domainPlans[0].domain.domainId,{date:new Date('2026-10-13T09:00:00Z')});
  assert.equal(domainState.ownershipStatus,'OWNER_CONFIRMED');
  assert.equal(domainState.registrar,'godaddy');
  const count=s.rows.length;
  const second=await applyWinnrPostPurchaseFleetPlan({store:s,fleetPlan:plan,date:new Date('2026-10-13T09:01:00Z')});
  assert.equal(second.ok,true);
  assert.equal(second.eventsWritten,0);
  assert.equal(s.rows.length,count);
  assert.deepEqual(second.linksByEmail,plan.linksByEmail);
});

test('re-applying a domain under a different ownership classification is refused as a conflict',async()=>{
  const s=store();
  const csv=fleetCsv();
  const owned=compileWinnrPostPurchaseFleetPlan({csvText:csv,...providerFixtures(csv),...ATTEST});
  await applyWinnrPostPurchaseFleetPlan({store:s,fleetPlan:owned,date:new Date('2026-10-13T09:00:00Z')});
  const unverified=compileWinnrPostPurchaseFleetPlan({csvText:csv,...providerFixtures(csv)});
  const r=await applyWinnrPostPurchaseFleetPlan({store:s,fleetPlan:unverified,date:new Date('2026-10-13T09:02:00Z')});
  assert.equal(r.ok,false);
  assert.equal(r.status,'WINNR_POSTPURCHASE_DOMAIN_CONFLICT');
});

test('fleet apply refuses an unvalidated plan',async()=>{
  const r=await applyWinnrPostPurchaseFleetPlan({store:store(),fleetPlan:{ok:false}});
  assert.equal(r.ok,false);
  assert.ok(r.reasonCodes.includes('valid-fleet-plan-required'));
});

// A domain column that disagrees with the address is a contradiction, not a grouping hint.
const MISMATCH_CSV=[HEADER,'beta-startup.co,sales@alpha-startup.co,Sales,sales@alpha-startup.co,secret,smtp.example.net,465,imap.example.net,993,sales@alpha-startup.co,imap-secret,'].join('\n');

test('a domain column that disagrees with the address refuses the single-domain and fleet plans',()=>{
  assert.equal(inspectWinnrCredentialExport(MISMATCH_CSV).mismatchedDomainRowCount,1);
  const single=compileWinnrPostPurchaseRegistryPlan({csvText:MISMATCH_CSV});
  assert.equal(single.ok,false);
  assert.ok(single.reasonCodes.includes('domain-column-address-mismatch'));
  const fleet=compileWinnrPostPurchaseFleetPlan({csvText:MISMATCH_CSV,...providerFixtures(MISMATCH_CSV),...ATTEST});
  assert.equal(fleet.ok,false);
  assert.ok(fleet.reasonCodes.includes('domain-column-address-mismatch'));
});

test('credential import fails a mismatched row rather than binding it to the column domain',()=>{
  const r=compileWinnrCredentialImport({
    csvText:MISMATCH_CSV,encryptionKey:'ab'.repeat(32),workspaceId:'uberbond-outreach',
    linksByEmail:{'sales@alpha-startup.co':{sendingDomainId:'domain-alpha',sendingMailboxId:'mailbox-alpha'}},
    routeEvidenceRef:'fixture:ref',routeAuthorized:true,termsCompatible:true
  });
  assert.equal(r.preparedCount,0);
  assert.equal(r.failureCount,1);
  assert.ok(r.failures[0].reasonCodes.includes('domain-column-address-mismatch'));
  assert.equal(r.plaintextCredentialReturned,false);
});

test('a pilot domain accidentally present in the Startup export is refused before any registry write', () => {
  const csv=fleetCsv();
  const withPilot=`${csv}\ncedarpointdomains.com,pilot@cedarpointdomains.com,Pilot,pilot@cedarpointdomains.com,pilot-secret,smtp.example.net,465,imap.example.net,993,pilot@cedarpointdomains.com,pilot-imap-secret,`;
  const plan=compileWinnrPostPurchaseFleetPlan({csvText:withPilot,...providerFixtures(fleetCsv()),...ATTEST,excludedDomains:['cedarpointdomains.com']});
  assert.equal(plan.ok,false);
  assert.ok(plan.reasonCodes.includes('excluded-pilot-domain-in-startup-export'));
  assert.equal(plan.messagesSent,0);
});

test('a duplicate mailbox address in one export is refused, not resolved by last-row-wins', () => {
  const dup=fleetCsv()+'\nfleet-01-startup.co,box1@fleet-01-startup.co,Box 1,box1@fleet-01-startup.co,other-secret,smtp.example.net,465,imap.example.net,993,box1@fleet-01-startup.co,imap-other,';
  const plan=compileWinnrPostPurchaseFleetPlan({csvText:dup,...providerFixtures(fleetCsv()),...ATTEST});
  assert.equal(plan.ok,false);
  assert.ok(plan.reasonCodes.includes('duplicate-mailbox-address'));
});
