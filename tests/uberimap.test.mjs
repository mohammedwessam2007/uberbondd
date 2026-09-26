import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRawEmail, buildEncryptedImapAccount, openImapCredential, pollImapForwardingAccount } from '../src/uberimap.mjs';
const KEY='a'.repeat(64);
test('parses reply identity and body',()=>{
 const r=parseRawEmail('Message-ID: <r1@example.com>\r\nIn-Reply-To: <m1@uberbond.local>\r\nFrom: Lead <lead@example.com>\r\nTo: sender@example.net\r\nSubject: Re: hello\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nYes, send details.\r\n');
 assert.equal(r.fromEmail,'lead@example.com');assert.equal(r.inReplyTo,'<m1@uberbond.local>');assert.match(r.body,/send details/);
});
test('IMAP credentials are encrypted at rest',()=>{
 const r=buildEncryptedImapAccount({email:'replies@maildoso.email',host:'imap.example.com',username:'u',password:'p',evidenceRef:'receipt:i',authorized:true,termsCompatible:true},KEY);
 assert.equal(r.ok,true);assert.equal(JSON.stringify(r.account).includes('"p"'),false);assert.equal(openImapCredential(r.account,KEY).password,'p');
});
test('polling delegates to the bounded reader without exposing credential',async()=>{
 const account=buildEncryptedImapAccount({email:'replies@maildoso.email',host:'imap.example.com',username:'u',password:'p',evidenceRef:'receipt:i',authorized:true,termsCompatible:true},KEY).account;
 const out=await pollImapForwardingAccount({account,encryptionKey:KEY,readerFactory:()=>({ok:true,fetchRecent:async()=>({ok:true,messages:[{uid:2,fromEmail:'lead@example.com'}],lastUid:2})})});
 assert.equal(out.lastUid,2);assert.equal(JSON.stringify(out).includes('"p"'),false);
});
