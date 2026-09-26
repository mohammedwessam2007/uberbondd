import test from 'node:test';
import assert from 'node:assert/strict';

import { createUberClayInboxAdapter, UBERCLAYINBOX_DONOR } from '../src/uberclayinbox.mjs';
import { resolveProviderAdapter, validateProviderAdapter } from '../src/provider-adapter-contract.mjs';
import { openSmtpAccountCredential } from '../src/uberfleet.mjs';
import { openImapCredential } from '../src/uberimap.mjs';

const KEY='a'.repeat(64);
const headers={ get: () => null };
const jsonResponse=(status, body)=>({
  status,
  headers,
  text:async()=>JSON.stringify(body)
});
const htmlResponse=(status, body)=>({
  status,
  headers,
  text:async()=>body
});
const envelope=data=>({ success:true, message:'ok', data });
const cfg=()=>({apiKey:'fixture-key',baseUrl:'https://app.clayinbox.ai/api/v1',configured:true});

test('UberClayInbox preserves donor provenance and satisfies canonical provider contract structurally',()=>{
  assert.equal(UBERCLAYINBOX_DONOR.repository,'developerinlondon/assay');
  assert.equal(UBERCLAYINBOX_DONOR.license,'Apache-2.0');
  const resolution=resolveProviderAdapter({providers:{clayinbox:cfg()}},'clayinbox');
  assert.equal(resolution.ok,true);
  assert.equal(validateProviderAdapter(resolution.adapter).ok,true);
});

test('ClayInbox reads use x-api-key plus browser User-Agent and redact list-row passwords',async()=>{
  let observed=null;
  const adapter=createUberClayInboxAdapter({
    ...cfg(),
    fetchImpl:async(url,options)=>{
      observed={url:String(url),headers:options.headers};
      return jsonResponse(200,envelope({
        mailboxes:[{
          id:'mbx_1',username:'Ada@Example.test',type:'GOOGLE',status:'ACTIVE',
          password:'never-log-this',
          domains:{domain_id:'dom_1',domain:'example.test'}
        }],
        limit:100,page:1,total_count:1
      }));
    }
  });
  const result=await adapter.listMailboxes();
  assert.equal(result.ok,true);
  assert.equal(result.data[0].address,'ada@example.test');
  assert.equal(result.data[0].providerType,'GOOGLE');
  assert.equal(result.data[0].raw.password,undefined);
  assert.equal(observed.headers['x-api-key'],'fixture-key');
  assert.match(observed.headers['User-Agent'],/Mozilla\/5\.0/);
});

test('HTTP 200 Cloudflare/HTML response is unreadable, never an empty fleet',async()=>{
  const adapter=createUberClayInboxAdapter({
    ...cfg(),
    fetchImpl:async()=>htmlResponse(200,'<html><title>Attention Required</title></html>')
  });
  const result=await adapter.listDomains();
  assert.equal(result.ok,false);
  assert.equal(result.status,'PROVIDER_RESPONSE_UNREADABLE');
});

test('ClayInbox list pagination walks to the end but stays bounded',async()=>{
  let calls=0;
  const first=Array.from({length:100},(_,i)=>({
    id:`mbx_${i}`,username:`user${i}@example.test`,type:'GOOGLE',status:'ACTIVE',
    domains:{domain:'example.test'}
  }));
  const adapter=createUberClayInboxAdapter({
    ...cfg(),
    fetchImpl:async url=>{
      calls+=1;
      const page=new URL(String(url)).searchParams.get('page');
      return page==='1'
        ? jsonResponse(200,envelope({mailboxes:first,limit:100,page:1,total_count:101}))
        : jsonResponse(200,envelope({mailboxes:[{
            id:'mbx_100',username:'user100@example.test',type:'GOOGLE',status:'ACTIVE',
            domains:{domain:'example.test'}
          }],limit:100,page:2,total_count:101}));
    }
  });
  const result=await adapter.listMailboxes();
  assert.equal(result.ok,true);
  assert.equal(result.data.length,101);
  assert.equal(result.pagination.truncated,false);
  assert.equal(calls,2);
});

test('provider domain DNS flags stay provider-observed rather than independent DNS truth',async()=>{
  const adapter=createUberClayInboxAdapter({
    ...cfg(),
    fetchImpl:async()=>jsonResponse(200,envelope({
      domains:[{
        domain_id:'dom_1',domain:'Example.test',status:'ACTIVE',
        spf:true,dkim:true,dmarc:true,mx_records:true
      }],
      limit:100,page:1,total_count:1
    }))
  });
  const observed=await adapter.domainDns({domainId:'example.test'});
  assert.equal(observed.ok,true);
  assert.deepEqual(observed.data.providerObservedDns,{spf:true,dkim:true,dmarc:true,mx:true});
  assert.match(observed.data.truthBoundary,/UberDNS/);
  const independent=await adapter.verifyDns({domainId:'example.test'});
  assert.equal(independent.status,'UNSUPPORTED_CAPABILITY');
});

test('BYO order refuses bare local parts, domain mismatch, missing quote, approval and idempotency before any write',async()=>{
  let calls=0;
  const adapter=createUberClayInboxAdapter({...cfg(),fetchImpl:async()=>{calls+=1;return jsonResponse(200,envelope({available:100}));}});

  const bare=await adapter.provisionMailboxes({
    domain:'brand.test',
    mailboxes:[{username:'ada'}],
    quotedTotalCents:1000,quoteEvidenceRef:'quote:1',idempotencyKey:'k1',
    ownerApproval:{granted:true,grantedBy:'owner',scope:['clayinbox:provisionMailboxes'],expiresAt:'2099-01-01T00:00:00Z',spendLimitCents:1000}
  });
  assert.equal(bare.status,'FULL_EMAIL_REQUIRED');

  const mismatch=await adapter.provisionMailboxes({
    domain:'brand.test',
    mailboxes:[{username:'ada@other.test'}],
    quotedTotalCents:1000,quoteEvidenceRef:'quote:1',idempotencyKey:'k1',
    ownerApproval:{granted:true,grantedBy:'owner',scope:['clayinbox:provisionMailboxes'],expiresAt:'2099-01-01T00:00:00Z',spendLimitCents:1000}
  });
  assert.equal(mismatch.status,'DOMAIN_MISMATCH');

  const noQuote=await adapter.provisionMailboxes({
    domain:'brand.test',mailboxes:[{username:'ada@brand.test',password:'protected-admin-fixture'}],idempotencyKey:'k1',
    ownerApproval:{granted:true,grantedBy:'owner',scope:['clayinbox:provisionMailboxes'],expiresAt:'2099-01-01T00:00:00Z',spendLimitCents:1000}
  });
  assert.equal(noQuote.status,'OBSERVED_QUOTE_REQUIRED');

  const noApproval=await adapter.provisionMailboxes({
    domain:'brand.test',mailboxes:[{username:'ada@brand.test',password:'protected-admin-fixture'}],
    quotedTotalCents:1000,quoteEvidenceRef:'quote:1',idempotencyKey:'k1'
  });
  assert.equal(noApproval.status,'OWNER_APPROVAL_REQUIRED');

  const noKey=await adapter.provisionMailboxes({
    domain:'brand.test',mailboxes:[{username:'ada@brand.test',password:'protected-admin-fixture'}],
    quotedTotalCents:1000,quoteEvidenceRef:'quote:1',
    ownerApproval:{granted:true,grantedBy:'owner',scope:['clayinbox:provisionMailboxes'],expiresAt:'2099-01-01T00:00:00Z',spendLimitCents:1000}
  });
  assert.equal(noKey.status,'IDEMPOTENCY_KEY_REQUIRED');
  assert.equal(calls,0);
});

test('approved BYO order always sets import:true, uses full addresses, checks wallet and returns no password',async()=>{
  const calls=[];
  const adapter=createUberClayInboxAdapter({
    ...cfg(),
    fetchImpl:async(url,options)=>{
      calls.push({url:String(url),options});
      if(String(url).endsWith('/wallet')) return jsonResponse(200,envelope({available:25}));
      if(String(url).endsWith('/order')) return jsonResponse(200,envelope({order_id:'ord_1'}));
      throw new Error('unexpected route');
    }
  });
  const result=await adapter.provisionMailboxes({
    domain:'brand.test',
    mailboxes:[{username:'ada@brand.test',firstName:'Ada',lastName:'Lovelace',password:'protected-admin-fixture'}],
    quotedTotalCents:2250,
    quoteEvidenceRef:'checkout:observed-2026-09-26',
    idempotencyKey:'order-1',
    ownerApproval:{
      granted:true,grantedBy:'owner',scope:['clayinbox:provisionMailboxes'],
      expiresAt:'2099-01-01T00:00:00Z',spendLimitCents:2250
    }
  });
  assert.equal(result.ok,true);
  assert.equal(result.data.orderId,'ord_1');
  assert.equal(result.data.initialPasswordsReturned,false);
  assert.equal(calls.length,2);
  const order=calls.find(x=>x.url.endsWith('/order'));
  const body=JSON.parse(order.options.body);
  assert.equal(body.import,true);
  assert.equal(body.data[0].domain_name,'brand.test');
  assert.equal(body.data[0].mailboxes[0].username,'ada@brand.test');
  assert.equal(body.data[0].mailboxes[0].password,'protected-admin-fixture');
  assert.equal(JSON.stringify(result).includes(body.data[0].mailboxes[0].password),false);
});

test('mutation timeout/5xx is outcome-uncertain and never blindly retried',async()=>{
  let orderCalls=0;
  const adapter=createUberClayInboxAdapter({
    ...cfg(),
    fetchImpl:async(url)=>{
      if(String(url).endsWith('/wallet')) return jsonResponse(200,envelope({available:50}));
      if(String(url).endsWith('/order')){orderCalls+=1;throw new Error('socket dropped after write');}
      throw new Error('unexpected route');
    }
  });
  const result=await adapter.provisionMailboxes({
    domain:'brand.test',mailboxes:[{username:'ada@brand.test',password:'protected-admin-fixture'}],
    quotedTotalCents:1000,quoteEvidenceRef:'quote:x',idempotencyKey:'order-x',
    ownerApproval:{granted:true,grantedBy:'owner',scope:['clayinbox:provisionMailboxes'],expiresAt:'2099-01-01T00:00:00Z',spendLimitCents:1000}
  });
  assert.equal(result.ok,false);
  assert.equal(result.status,'EXTERNAL_OUTCOME_UNKNOWN');
  assert.equal(result.reconciliationRequired,true);
  assert.equal(result.automaticRetryAuthorized,false);
  assert.equal(orderCalls,1);
});

test('empty app-password response is credential-not-ready, not an SMTP authentication failure',async()=>{
  const adapter=createUberClayInboxAdapter({
    ...cfg(),
    fetchImpl:async url=>{
      if(String(url).includes('/mailbox?')){
        return jsonResponse(200,envelope({
          mailboxes:[{id:'mbx_1',username:'sender@brand.test',type:'GOOGLE',status:'ACTIVE',domains:{domain:'brand.test'}}],
          limit:100,page:1,total_count:1
        }));
      }
      if(String(url).endsWith('/mailbox/mbx_1/app-password')) return jsonResponse(200,envelope({}));
      throw new Error('unexpected route');
    }
  });
  const result=await adapter.prepareGoogleFleetImport({
    mailboxId:'mbx_1',encryptionKey:KEY,
    sendingDomainId:'d1',sendingMailboxId:'m1',sendingWorkspaceId:'w1',
    routeEvidenceRef:'provider:clayinbox:mbx_1',
    routeAuthorized:true,termsCompatible:true
  });
  assert.equal(result.ok,false);
  assert.equal(result.status,'CREDENTIAL_NOT_READY');
  assert.equal(result.retryClass,'ELAPSED_PROVIDER_PROVISIONING');
});

test('Google app password flows directly into encrypted UberFleet and UberIMAP accounts without plaintext escape',async()=>{
  const appPassword='abcd efgh ijkl mnop';
  const adapter=createUberClayInboxAdapter({
    ...cfg(),
    fetchImpl:async url=>{
      if(String(url).includes('/mailbox?')){
        return jsonResponse(200,envelope({
          mailboxes:[{id:'mbx_1',username:'sender@brand.test',type:'GOOGLE',status:'ACTIVE',domains:{domain:'brand.test'}}],
          limit:100,page:1,total_count:1
        }));
      }
      if(String(url).endsWith('/mailbox/mbx_1/app-password')) return jsonResponse(200,envelope({app_password:appPassword}));
      throw new Error('unexpected route');
    }
  });
  const result=await adapter.prepareGoogleFleetImport({
    mailboxId:'mbx_1',encryptionKey:KEY,
    sendingDomainId:'d1',sendingMailboxId:'m1',sendingWorkspaceId:'w1',
    routeEvidenceRef:'provider:clayinbox:mbx_1',
    routeAuthorized:true,termsCompatible:true,
    plannedDailyCap:5,plannedHourlyCap:1,minGapSeconds:1800
  });
  assert.equal(result.ok,true);
  assert.equal(result.status,'GOOGLE_FLEET_IMPORT_READY');
  assert.equal(JSON.stringify(result).includes(appPassword),false);
  assert.equal(openSmtpAccountCredential(result.data.smtpAccount,KEY).password,appPassword);
  assert.equal(openImapCredential(result.data.imapAccount,KEY).password,appPassword);
  assert.equal(result.data.smtpAccount.smtpRoute.host,'smtp.gmail.com');
  assert.equal(result.data.imapAccount.imapRoute.host,'imap.gmail.com');
});

test('Microsoft/Azure mailbox cannot enter the Google app-password import path by assumption',async()=>{
  const adapter=createUberClayInboxAdapter({
    ...cfg(),
    fetchImpl:async url=>{
      if(String(url).includes('/mailbox?')){
        return jsonResponse(200,envelope({
          mailboxes:[{id:'mbx_ms',username:'sender@brand.test',type:'MICROSOFT',status:'ACTIVE',domains:{domain:'brand.test'}}],
          limit:100,page:1,total_count:1
        }));
      }
      throw new Error('credential endpoint must not be called');
    }
  });
  const result=await adapter.prepareGoogleFleetImport({
    mailboxId:'mbx_ms',encryptionKey:KEY,
    sendingDomainId:'d1',sendingMailboxId:'m1',sendingWorkspaceId:'w1',
    routeEvidenceRef:'provider:clayinbox:mbx_ms',
    routeAuthorized:true,termsCompatible:true
  });
  assert.equal(result.ok,false);
  assert.equal(result.status,'GOOGLE_MAILBOX_REQUIRED');
});

test('credential import remains fail-closed until current provider terms are evidenced',async()=>{
  let calls=0;
  const adapter=createUberClayInboxAdapter({...cfg(),fetchImpl:async()=>{calls+=1;throw new Error('must not call');}});
  const result=await adapter.prepareGoogleFleetImport({
    mailboxId:'mbx_1',encryptionKey:KEY,
    sendingDomainId:'d1',sendingMailboxId:'m1',sendingWorkspaceId:'w1',
    routeEvidenceRef:'provider:clayinbox:mbx_1',
    routeAuthorized:true,termsCompatible:false
  });
  assert.equal(result.status,'PROVIDER_TERMS_EVIDENCE_REQUIRED');
  assert.equal(calls,0);
});


test('BYO order refuses to generate-and-forget an initial admin password',async()=>{
  let calls=0;
  const adapter=createUberClayInboxAdapter({...cfg(),fetchImpl:async()=>{calls+=1;return jsonResponse(200,envelope({available:25}));}});
  const result=await adapter.provisionMailboxes({
    domain:'brand.test',
    mailboxes:[{username:'ada@brand.test'}],
    quotedTotalCents:1000,
    quoteEvidenceRef:'quote:password-custody',
    idempotencyKey:'password-custody',
    ownerApproval:{granted:true,grantedBy:'owner',scope:['clayinbox:provisionMailboxes'],expiresAt:'2099-01-01T00:00:00Z',spendLimitCents:1000}
  });
  assert.equal(result.ok,false);
  assert.equal(result.status,'INITIAL_PASSWORD_REQUIRED');
  assert.equal(calls,0);
});
