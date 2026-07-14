import { encryptJson, decryptJson } from './crypto.mjs';

const scopes = ['https://www.googleapis.com/auth/gmail.readonly','https://www.googleapis.com/auth/gmail.send'];
export function googleAuthUrl(cfg, state) {
  const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  Object.entries({client_id:cfg.clientId,redirect_uri:cfg.redirectUri,response_type:'code',scope:scopes.join(' '),access_type:'offline',prompt:'consent',state}).forEach(([k,v])=>u.searchParams.set(k,v));
  return u.href;
}
async function tokenRequest(body) {
  const res = await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams(body)});
  if (!res.ok) throw new Error(`Google token ${res.status}: ${await res.text()}`);
  return res.json();
}
export async function exchangeCode(cfg, code) { return tokenRequest({code,client_id:cfg.clientId,client_secret:cfg.clientSecret,redirect_uri:cfg.redirectUri,grant_type:'authorization_code'}); }
export async function refresh(cfg, refreshToken) { return tokenRequest({refresh_token:refreshToken,client_id:cfg.clientId,client_secret:cfg.clientSecret,grant_type:'refresh_token'}); }
export function sealTokens(tokens, key) { return encryptJson(tokens,key); }
export function openTokens(blob, key) { return decryptJson(blob,key); }
async function accessToken(cfg, account, key) {
  const tokens = openTokens(account.tokens,key);
  if (tokens.access_token && tokens.expires_at > Date.now()+60000) return {token:tokens.access_token,tokens};
  const fresh = await refresh(cfg,tokens.refresh_token);
  const merged = {...tokens,...fresh,expires_at:Date.now()+(fresh.expires_in||3600)*1000};
  return {token:merged.access_token,tokens:merged};
}
async function gmail(cfg, account, key, path, options={}) {
  const auth = await accessToken(cfg,account,key);
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`,{...options,headers:{...(options.headers||{}),authorization:`Bearer ${auth.token}`}});
  if (!res.ok) throw new Error(`Gmail ${res.status}: ${await res.text()}`);
  return {data:res.status===204?null:await res.json(),tokens:auth.tokens};
}
const b64url = s => Buffer.from(s).toString('base64url');
export async function getProfile(cfg, account, key) { return gmail(cfg,account,key,'profile'); }
export async function sendEmail(cfg, account, key, message) {
  const headers = [`From: ${message.from}`,`To: ${message.to}`,`Subject: ${message.subject}`,'MIME-Version: 1.0','Content-Type: text/plain; charset="UTF-8"'];
  if (message.replyToId) headers.push(`In-Reply-To: ${message.replyToId}`,`References: ${message.replyToId}`);
  if (message.listUnsubscribe) headers.push(`List-Unsubscribe: <${message.listUnsubscribe}>`, 'List-Unsubscribe-Post: List-Unsubscribe=One-Click');
  const raw=b64url(`${headers.join('\r\n')}\r\n\r\n${message.body}`);
  return gmail(cfg,account,key,'messages/send',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({raw,threadId:message.threadId||undefined})});
}
export async function listMessages(cfg,account,key,q,maxResults=50) {
  const qs=new URLSearchParams({q,maxResults:String(maxResults)});
  return gmail(cfg,account,key,`messages?${qs}`);
}
export async function getMessage(cfg,account,key,id) { return gmail(cfg,account,key,`messages/${id}?format=full`); }
export function parseGmailMessage(message) {
  const headers=Object.fromEntries((message.payload?.headers||[]).map(h=>[h.name.toLowerCase(),h.value]));
  const collect = part => {
    if (part.mimeType==='text/plain' && part.body?.data) return Buffer.from(part.body.data,'base64url').toString('utf8');
    return (part.parts||[]).map(collect).join('\n');
  };
  return {id:message.id,threadId:message.threadId,from:headers.from||'',to:headers.to||'',subject:headers.subject||'',messageId:headers['message-id']||'',inReplyTo:headers['in-reply-to']||'',date:headers.date||'',body:collect(message.payload)||message.snippet||''};
}
