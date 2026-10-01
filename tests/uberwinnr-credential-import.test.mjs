import test from 'node:test';
import assert from 'node:assert/strict';
import { compileWinnrCredentialImport } from '../src/uberwinnr-credential-import.mjs';
import { openSmtpAccountCredential } from '../src/uberfleet.mjs';
import { openImapCredential } from '../src/uberimap.mjs';

const KEY = '07'.repeat(32);

const CSV = [
  'domain,from_email,from_name,user_name,password,smtp_host,smtp_port,imap_host,imap_port,imap_username,imap_password,footer',
  'uberbond.site,sam@uberbond.site,Sam,sam@uberbond.site,"smtp,pass",smtp-a.example.net,465,imap-a.example.net,993,sam@uberbond.site,"smtp,pass","UberBond, Cairo"'
].join('\n');

test('Winnr generic export compiles into encrypted SMTP and IMAP accounts without plaintext leakage', () => {
  const result = compileWinnrCredentialImport({
    csvText: CSV,
    encryptionKey: KEY,
    workspaceId: 'ws-1',
    linksByEmail: {
      'sam@uberbond.site': {
        sendingDomainId: 'domain-1',
        sendingMailboxId: 'mailbox-1'
      }
    },
    routeEvidenceRef: 'winnr:provider-policy-receipt',
    routeAuthorized: true,
    termsCompatible: true
  });

  assert.equal(result.status, 'IMPORT_READY');
  assert.equal(result.preparedCount, 1);
  assert.equal(result.failureCount, 0);
  assert.equal(result.plaintextCredentialReturned, false);

  const row = result.prepared[0];
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes('smtp,pass'), false);
  assert.equal(openSmtpAccountCredential(row.smtpAccount, KEY).password, 'smtp,pass');
  assert.equal(openImapCredential(row.imapAccount, KEY).password, 'smtp,pass');
  assert.equal(row.smtpAccount.smtpRoute.host, 'smtp-a.example.net');
  assert.equal(row.imapAccount.imapRoute.host, 'imap-a.example.net');
});

test('credential import refuses rows without canonical local domain/mailbox linkage', () => {
  const result = compileWinnrCredentialImport({
    csvText: CSV,
    encryptionKey: KEY,
    workspaceId: 'ws-1',
    linksByEmail: {},
    routeEvidenceRef: 'winnr:evidence',
    routeAuthorized: true,
    termsCompatible: true
  });
  assert.equal(result.status, 'IMPORT_REFUSED');
  assert.equal(result.preparedCount, 0);
  assert.ok(result.failures[0].reasonCodes.includes('sending-domain-link-required'));
  assert.ok(result.failures[0].reasonCodes.includes('sending-mailbox-link-required'));
});

test('credential import refuses provider routes without authorization or terms evidence', () => {
  const result = compileWinnrCredentialImport({
    csvText: CSV,
    encryptionKey: KEY,
    workspaceId: 'ws-1',
    linksByEmail: {
      'sam@uberbond.site': { sendingDomainId: 'domain-1', sendingMailboxId: 'mailbox-1' }
    },
    routeEvidenceRef: 'winnr:evidence',
    routeAuthorized: false,
    termsCompatible: false
  });
  assert.equal(result.status, 'IMPORT_REFUSED');
  assert.ok(result.failures[0].reasonCodes.includes('route-authorization-required'));
  assert.ok(result.failures[0].reasonCodes.includes('route-terms-compatibility-required'));
});


test('credential import fails closed on an invalid encryption key', () => {
  const result = compileWinnrCredentialImport({
    csvText: CSV,
    encryptionKey: 'not-a-key',
    workspaceId: 'ws-1',
    linksByEmail: {
      'sam@uberbond.site': { sendingDomainId: 'domain-1', sendingMailboxId: 'mailbox-1' }
    },
    routeEvidenceRef: 'winnr:evidence',
    routeAuthorized: true,
    termsCompatible: true
  });
  assert.equal(result.status, 'IMPORT_REFUSED');
  assert.deepEqual(result.failures[0].reasonCodes, ['valid-encryption-key-required']);
});
