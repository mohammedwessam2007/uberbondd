import test from 'node:test';
import assert from 'node:assert/strict';
import { runWinnrRuntimeBootstrap } from '../src/winnr-runtime-bootstrap.mjs';

const HEADER='domain,from_email,from_name,user_name,password,smtp_host,smtp_port,imap_host,imap_port,imap_username,imap_password,footer';

function csvWithRows(count){
  const rows=[HEADER];
  for(let i=1;i<=count;i++){
    const email=`box${i}@fixture-startup.co`;
    rows.push(`fixture-startup.co,${email},Box ${i},${email},secret-${i},smtp.example.net,465,imap.example.net,993,${email},imap-secret-${i},`);
  }
  return rows.join('\n');
}

test('positional SMTP skip is refused for a fleet-sized export before any store or provider work', async () => {
  const result=await runWinnrRuntimeBootstrap({config:{},csvText:csvWithRows(50),smtpSkipOrdinals:[1]});
  assert.equal(result.ok,false);
  assert.equal(result.status,'WINNR_RUNTIME_BOOTSTRAP_REFUSED');
  assert.deepEqual(result.reasonCodes,['ordinal-skip-requires-slot-keys']);
  assert.equal(result.providerCalls,0);
  assert.equal(result.messagesSent,0);
});
