import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/store.mjs';
import { Pipeline } from '../src/pipeline.mjs';
import { buildEncryptedImapAccount, parseRawEmail } from '../src/uberimap.mjs';

// Synthetic example.invalid identities. No actual network, customers, or messages.
test('H04 an unlinked Auto-Submitted unsubscribe does not silently suppress sender',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'phoenix-h04-auto-'));
  const key=crypto.randomBytes(32).toString('hex');
  const store=new Store(dir);
  try{
    await store.init();
    const built=buildEncryptedImapAccount({
      slot:'h04-test-inbox',email:'test@uberbond.example.invalid',host:'imap.example.invalid',
      username:'test@uberbond.example.invalid',password:'fixture-only',
      evidenceRef:'h04:synthetic',authorized:true,termsCompatible:true
    },key);
    assert.equal(built.ok,true);
    await store.add('accounts',built.account);
    const raw=[
      'From: Auto <stranger@remote.example.invalid>',
      'To: test@uberbond.example.invalid',
      'Subject: Unsubscribe',
      'Auto-Submitted: auto-replied',
      'Message-ID: <machine@remote.example.invalid>',
      'Content-Type: text/plain; charset=utf-8',
      '',
      'Please unsubscribe me immediately.'
    ].join('\r\n');
    const parsed=parseRawEmail(raw);
    assert.equal(parsed.autoSubmitted,true);
    const pipeline=new Pipeline(store,{encryptionKey:key,ai:{provider:'rules'},outbound:{}},{
      imapPoll:async()=>({ok:true,status:'UBERIMAP_FETCH_CONFIRMED',
        uidValidity:1001,messages:[{uid:1,...parsed}],lastUid:1}),
      imapRetryDelaysMs:[0,0],imapSleep:async()=>{}
    });
    await pipeline.pollReplies();
    assert.equal((await store.list('suppressions')).length,0);
    assert.equal((await store.list('unlinkedReplies')).length,1);
  }finally{
    await store.close?.();
    await fs.rm(dir,{recursive:true,force:true});
  }
});
