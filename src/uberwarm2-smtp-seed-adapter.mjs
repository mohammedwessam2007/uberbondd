import { createUberSmtpSubmissionTransport } from './ubersmtp-submission-adapter.mjs';
import { openSmtpAccountCredential } from './uberfleet.mjs';

export const UBERWARM2_SMTP_SEED_ADAPTER_VERSION = 'uberbond.uberwarm2.smtp-seed-adapter.v1';
const lower = x => String(x ?? '').trim().toLowerCase();
const emailOk = x => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(x || '').trim());
const refused = reason => ({ok:false,status:'UBERWARM2_SMTP_SEED_ADAPTER_REFUSED',reasonCodes:[reason],messagesSent:0});

// Binds one existing, encrypted UberFleet account to ONE explicitly authorized
// diagnostic sender. This cannot buy mailboxes, send arbitrary campaigns or
// manufacture replies/engagement. Secrets never appear in return values.
export function createUberWarm2SmtpSeedAdapter({account={},encryptionKey='',
  transportFactory=createUberSmtpSubmissionTransport,credentialReader=openSmtpAccountCredential}={}) {
  const boundSender=lower(account?.email), boundMailboxId=String(account?.sendingMailboxId||'').trim();
  const route=account?.smtpRoute||{};
  const reasons=[];
  if(!emailOk(boundSender)||!boundMailboxId)reasons.push('exact-encrypted-mailbox-binding-required');
  if(account?.connected!==true||!account?.tokens)reasons.push('connected-encrypted-account-required');
  if(route.authorized!==true||route.termsCompatible!==true||!route.evidenceRef)reasons.push('authorized-provider-route-and-evidence-required');
  if(!route.host||route.secure===false)reasons.push('encrypted-smtp-route-required');
  if(!encryptionKey)reasons.push('runtime-decryption-key-required');
  if(reasons.length)return {...refused('account-not-ready'),reasonCodes:reasons};
  return Object.freeze({
    authorizedSmtp:true,boundSender,boundMailboxId,
    version:UBERWARM2_SMTP_SEED_ADAPTER_VERSION,
    async sendProbe({from,to,mailboxId,subject,text,idempotencyKey,purpose}={}){
      if(lower(from)!==boundSender||String(mailboxId||'')!==boundMailboxId||!emailOk(to))return refused('identity-binding-mismatch');
      if(purpose!=='OWNER_CONTROLLED_PLACEMENT_TEST'||!String(idempotencyKey||'').startsWith('uw2_')||!String(subject||'').startsWith('UberBond delivery check ')||!text)return refused('bounded-test-envelope-required');
      let secret;
      try{ secret=credentialReader(account,encryptionKey); }catch{ return refused('encrypted-credential-unavailable'); }
      const transport=transportFactory({host:route.host,port:route.port,secure:route.secure!==false,
        username:secret.username,password:secret.password,authorized:true,termsCompatible:true,evidenceRef:route.evidenceRef});
      if(transport?.ok!==true||typeof transport.send!=='function')return refused('authorized-smtp-transport-not-ready');
      const domain=boundSender.split('@')[1];
      const result=await transport.send({from:boundSender,to:lower(to),subject,body:text,
        messageId:`<${String(idempotencyKey).replace(/[^a-zA-Z0-9_-]/g,'')}@${domain}>`});
      return result?.confirmed===true&&result?.messageId
        ? {ok:true,status:'PROVIDER_ACCEPTED',providerMessageId:result.messageId}
        : {ok:false,status:'OUTCOME_UNCERTAIN'};
    }
  });
}