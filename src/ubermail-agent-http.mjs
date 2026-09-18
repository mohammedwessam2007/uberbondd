import { uberMailHttpError } from './ubermail-agent-api.mjs';

export const UBERMAIL_AGENT_HTTP_VERSION='uberbond.ubermail-agent-http.v1';

const text=(v,max=2000)=>String(v??'').trim().slice(0,max);
const obj=v=>v&&typeof v==='object'&&!Array.isArray(v)?v:{};
const arr=v=>v==null?[]:Array.isArray(v)?v:[v];
function headersOf(value={}){const out={};if(value&&typeof value.get==='function'){for(const key of ['authorization','idempotency-key','x-ubermail-relationship']){const v=value.get(key);if(v!=null)out[key]=v;}return out;}for(const [k,v] of Object.entries(obj(value)))out[String(k).toLowerCase()]=v;return out;}
function authOf(headers){const raw=text(headers.authorization,2000);const match=/^Bearer\s+(.+)$/i.exec(raw);return match?{apiKey:match[1].trim()}:{};}
function pathParts(pathname){return String(pathname||'/').split('?')[0].split('/').filter(Boolean).map(v=>decodeURIComponent(v));}
function queryOf(request){if(request.query&&typeof request.query==='object')return request.query;const raw=String(request.url||request.path||'');try{const u=new URL(raw,'https://ubermail.local');return Object.fromEntries([...u.searchParams.entries()]);}catch{return{};}}
function bool(v){if(v===true||v==='true'||v==='1')return true;if(v===false||v==='false'||v==='0')return false;return undefined;}
function bodyOf(request){return obj(request.body);}
const ok=(body,status=200)=>({status,headers:{'content-type':'application/json'},body});
const created=body=>ok(body,201);
const gone=body=>ok(body,200);

export function createUberMailAgentHttp({api}={}){
  if(!api||typeof api.health!=='function')throw new TypeError('UberMail API instance required');
  return async function handle(request={}){
    const method=text(request.method||'GET',12).toUpperCase();
    const path=String(request.path||request.pathname||request.url||'/');
    const parts=pathParts(path);
    const q=queryOf(request);const h=headersOf(request.headers);const auth=authOf(h);const body=bodyOf(request);
    const effectApproval=request.effectApproval||null;
    const idempotencyKey=text(h['idempotency-key']||body.idempotency_key,300);
    const relationship=text(h['x-ubermail-relationship']||body.relationship||'USER_INITIATED',100);
    try{
      if(parts.length===1&&parts[0]==='health'&&method==='GET')return ok(await api.health());
      if(parts[0]!=='v0')return ok({error:'not-found'},404);

      if(parts[1]==='metrics'&&parts.length===2&&method==='GET')return ok(await api.metrics({auth}));
      if(parts[1]==='events'&&parts.length===2&&method==='GET')return ok(await api.pollEvents({auth,cursor:q.cursor,limit:q.limit,eventTypes:q.event_type?arr(q.event_type):[]}));

      if(parts[1]==='pods'){
        if(parts.length===2&&method==='GET')return ok(await api.listPods({auth,limit:q.limit,pageToken:q.page_token,ascending:bool(q.ascending)}));
        if(parts.length===2&&method==='POST')return created(await api.createPod({auth,name:body.name,clientId:body.client_id,idempotencyKey}));
        if(parts.length===3&&method==='GET')return ok(await api.getPod({auth,podId:parts[2]}));
        if(parts.length===3&&method==='DELETE')return gone(await api.deletePod({auth,podId:parts[2]}));
        const podId=parts[2];
        if(parts.length===4&&parts[3]==='inboxes'&&method==='GET')return ok(await api.listInboxes({auth,podId,limit:q.limit,pageToken:q.page_token,ascending:bool(q.ascending)}));
        if(parts.length===4&&parts[3]==='domains'&&method==='GET')return ok(await api.listDomains({auth,podId,limit:q.limit,pageToken:q.page_token,ascending:bool(q.ascending)}));
        if(parts.length===4&&parts[3]==='threads'&&method==='GET')return ok(await api.listThreads({auth,podId,limit:q.limit,pageToken:q.page_token,before:q.before,after:q.after}));
        if(parts.length===4&&parts[3]==='drafts'&&method==='GET')return ok(await api.listDrafts({auth,podId,limit:q.limit,pageToken:q.page_token}));
        if(parts.length===4&&parts[3]==='webhooks'&&method==='GET')return ok(await api.listWebhooks({auth,podId,limit:q.limit,pageToken:q.page_token}));
        if(parts.length===4&&parts[3]==='webhooks'&&method==='POST')return created(await api.createWebhook({auth,url:body.url,eventTypes:body.event_types,inboxIds:body.inbox_ids,podIds:[podId],headers:body.headers,clientId:body.client_id,idempotencyKey}));
        if(parts.length===4&&parts[3]==='api-keys'&&method==='GET')return ok(await api.listApiKeys({auth,type:q.type,limit:q.limit,pageToken:q.page_token}));
        if(parts.length===4&&parts[3]==='api-keys'&&method==='POST')return created(await api.createApiKey({auth,name:body.name,type:body.type,permissions:body.permissions,podId,expiresAt:body.expires_at,idempotencyKey}));
      }

      if(parts[1]==='domains'){
        if(parts.length===2&&method==='GET')return ok(await api.listDomains({auth,podId:q.pod_id,limit:q.limit,pageToken:q.page_token,ascending:bool(q.ascending)}));
        if(parts.length===2&&method==='POST')return created(await api.createDomain({auth,domain:body.domain,podId:body.pod_id,clientId:body.client_id,metadata:body.metadata,subdomainsEnabled:body.subdomains_enabled,idempotencyKey}));
        if(parts.length===3&&method==='GET')return ok(await api.getDomain({auth,domainId:parts[2]}));
        if(parts.length===3&&method==='PATCH')return ok(await api.updateDomain({auth,domainId:parts[2],metadata:body.metadata,subdomainsEnabled:body.subdomains_enabled}));
        if(parts.length===3&&method==='DELETE')return gone(await api.deleteDomain({auth,domainId:parts[2]}));
        if(parts.length===4&&parts[3]==='verify'&&method==='POST')return ok(await api.verifyDomain({auth,domainId:parts[2],idempotencyKey}));
      }

      if(parts[1]==='messages'&&parts[2]==='search'&&method==='GET')return ok(await api.searchMessages({auth,q:q.q||q.query,limit:q.limit,pageToken:q.page_token,inboxId:q.inbox_id,podId:q.pod_id,before:q.before,after:q.after}));
      if(parts[1]==='inboxes'&&parts[2]==='search'&&method==='GET')return ok(await api.searchInboxes({auth,q:q.q||q.query,podId:q.pod_id,limit:q.limit,pageToken:q.page_token}));
      if(parts[1]==='inboxes'){
        if(parts.length===2&&method==='GET')return ok(await api.listInboxes({auth,limit:q.limit,pageToken:q.page_token,ascending:bool(q.ascending),podId:q.pod_id}));
        if(parts.length===2&&method==='POST')return created(await api.createInbox({auth,username:body.username,domain:body.domain,displayName:body.display_name,clientId:body.client_id,metadata:body.metadata,podId:body.pod_id,idempotencyKey}));
        const inboxId=parts[2];
        if(parts.length===3&&method==='GET')return ok(await api.getInbox({auth,inboxId}));
        if(parts.length===3&&method==='PATCH')return ok(await api.updateInbox({auth,inboxId,displayName:body.display_name,metadata:body.metadata,paused:body.paused}));
        if(parts.length===3&&method==='DELETE')return gone(await api.deleteInbox({auth,inboxId}));
        if(parts.length===4&&parts[3]==='webhooks'&&method==='GET')return ok(await api.listWebhooks({auth,inboxId,limit:q.limit,pageToken:q.page_token}));
        if(parts.length===4&&parts[3]==='webhooks'&&method==='POST')return created(await api.createWebhook({auth,url:body.url,eventTypes:body.event_types,inboxIds:[inboxId],podIds:body.pod_ids,headers:body.headers,clientId:body.client_id,idempotencyKey}));
        if(parts.length===4&&parts[3]==='api-keys'&&method==='GET')return ok(await api.listApiKeys({auth,type:q.type,limit:q.limit,pageToken:q.page_token}));
        if(parts.length===4&&parts[3]==='api-keys'&&method==='POST')return created(await api.createApiKey({auth,name:body.name,type:body.type,permissions:body.permissions,inboxId,expiresAt:body.expires_at,idempotencyKey}));

        if(parts[3]==='messages'){
          if(parts.length===4&&method==='GET')return ok(await api.listMessages({auth,inboxId,limit:q.limit,pageToken:q.page_token,labels:q.label?arr(q.label):[],before:q.before,after:q.after,from:q.from,to:q.to,subject:q.subject}));
          if(parts.length===5&&parts[4]==='send'&&method==='POST')return created(await api.sendMessage({auth,inboxId,to:body.to,cc:body.cc,bcc:body.bcc,replyTo:body.reply_to,subject:body.subject,text:body.text,html:body.html,labels:body.labels,attachments:body.attachments,headers:body.headers,relationship,approval:effectApproval,idempotencyKey}));
          const messageId=parts[4];
          if(parts.length===5&&method==='GET')return ok(await api.getMessage({auth,inboxId,messageId}));
          if(parts.length===5&&method==='PATCH')return ok(await api.updateMessage({auth,inboxId,messageId,addLabels:body.add_labels||body.labels,removeLabels:body.remove_labels||[]}));
          if(parts.length===5&&method==='DELETE')return gone(await api.deleteMessage({auth,inboxId,messageId}));
          if(parts.length===6&&parts[5]==='reply'&&method==='POST')return created(await api.replyToMessage({auth,inboxId,messageId,to:body.to,cc:body.cc,bcc:body.bcc,replyTo:body.reply_to,text:body.text,html:body.html,labels:body.labels,attachments:body.attachments,headers:body.headers,replyAll:Boolean(body.reply_all),relationship,approval:effectApproval,idempotencyKey}));
          if(parts.length===6&&parts[5]==='forward'&&method==='POST')return created(await api.forwardMessage({auth,inboxId,messageId,to:body.to,cc:body.cc,bcc:body.bcc,replyTo:body.reply_to,text:body.text,html:body.html,labels:body.labels,attachments:body.attachments,headers:body.headers,relationship,approval:effectApproval,idempotencyKey}));
          if(parts.length===6&&parts[5]==='reply-draft'&&method==='POST')return created(await api.createReplyDraft({auth,inboxId,messageId,to:body.to,cc:body.cc,bcc:body.bcc,replyTo:body.reply_to,text:body.text,html:body.html,labels:body.labels,attachments:body.attachments,replyAll:Boolean(body.reply_all),sendAt:body.send_at,clientId:body.client_id,idempotencyKey}));
          if(parts.length===6&&parts[5]==='forward-draft'&&method==='POST')return created(await api.createForwardDraft({auth,inboxId,messageId,to:body.to,cc:body.cc,bcc:body.bcc,replyTo:body.reply_to,text:body.text,html:body.html,labels:body.labels,attachments:body.attachments,sendAt:body.send_at,clientId:body.client_id,idempotencyKey}));
          if(parts.length===7&&parts[5]==='attachments'&&method==='GET')return ok(await api.getMessageAttachment({auth,inboxId,messageId,attachmentId:parts[6]}));
        }

        if(parts[3]==='threads'){
          if(parts.length===4&&method==='GET')return ok(await api.listThreads({auth,inboxId,limit:q.limit,pageToken:q.page_token,before:q.before,after:q.after}));
          const threadId=parts[4];
          if(parts.length===5&&method==='GET')return ok(await api.getThread({auth,inboxId,threadId}));
          if(parts.length===5&&method==='PATCH')return ok(await api.updateThread({auth,inboxId,threadId,addLabels:body.add_labels||body.labels,removeLabels:body.remove_labels||[]}));
          if(parts.length===5&&method==='DELETE')return gone(await api.deleteThread({auth,inboxId,threadId}));
          if(parts.length===7&&parts[5]==='attachments'&&method==='GET')return ok(await api.getThreadAttachment({auth,inboxId,threadId,attachmentId:parts[6]}));
        }

        if(parts[3]==='drafts'){
          if(parts.length===4&&method==='GET')return ok(await api.listDrafts({auth,inboxId,limit:q.limit,pageToken:q.page_token}));
          if(parts.length===4&&method==='POST')return created(await api.createDraft({auth,inboxId,to:body.to,cc:body.cc,bcc:body.bcc,replyTo:body.reply_to,subject:body.subject,text:body.text,html:body.html,labels:body.labels,attachments:body.attachments,inReplyTo:body.in_reply_to,forwardOf:body.forward_of,replyAll:Boolean(body.reply_all),sendAt:body.send_at,clientId:body.client_id,idempotencyKey}));
          const draftId=parts[4];
          if(parts.length===5&&method==='GET')return ok(await api.getDraft({auth,inboxId,draftId}));
          if(parts.length===5&&method==='PATCH')return ok(await api.updateDraft({auth,inboxId,draftId,replyTo:body.reply_to,to:body.to,cc:body.cc,bcc:body.bcc,subject:body.subject,text:body.text,html:body.html,addAttachments:body.add_attachments,removeAttachments:body.remove_attachments,addLabels:body.add_labels,removeLabels:body.remove_labels,sendAt:body.send_at}));
          if(parts.length===5&&method==='DELETE')return gone(await api.deleteDraft({auth,inboxId,draftId}));
          if(parts.length===6&&parts[5]==='send'&&method==='POST')return created(await api.sendDraft({auth,inboxId,draftId,addLabels:body.add_labels,removeLabels:body.remove_labels,relationship,approval:effectApproval,idempotencyKey}));
          if(parts.length===7&&parts[5]==='attachments'&&method==='GET')return ok(await api.getDraftAttachment({auth,inboxId,draftId,attachmentId:parts[6]}));
        }
      }

      if(parts[1]==='threads'&&parts[2]==='search'&&method==='GET')return ok(await api.searchThreads({auth,q:q.q||q.query,podId:q.pod_id,limit:q.limit,pageToken:q.page_token,before:q.before,after:q.after}));

      if(parts[1]==='webhooks'){
        if(parts.length===2&&method==='GET')return ok(await api.listWebhooks({auth,limit:q.limit,pageToken:q.page_token}));
        if(parts.length===2&&method==='POST')return created(await api.createWebhook({auth,url:body.url,eventTypes:body.event_types,inboxIds:body.inbox_ids,podIds:body.pod_ids,headers:body.headers,clientId:body.client_id,idempotencyKey}));
        if(parts.length===3&&method==='GET')return ok(await api.getWebhook({auth,webhookId:parts[2]}));
        if(parts.length===3&&method==='PATCH')return ok(await api.updateWebhook({auth,webhookId:parts[2],url:body.url,headers:body.headers,eventTypes:body.event_types,addInboxIds:body.add_inbox_ids,removeInboxIds:body.remove_inbox_ids,addPodIds:body.add_pod_ids,removePodIds:body.remove_pod_ids,enabled:body.enabled}));
        if(parts.length===3&&method==='DELETE')return gone(await api.deleteWebhook({auth,webhookId:parts[2]}));
      }

      if(parts[1]==='api-keys'){
        if(parts.length===2&&method==='GET')return ok(await api.listApiKeys({auth,type:q.type,limit:q.limit,pageToken:q.page_token}));
        if(parts.length===2&&method==='POST')return created(await api.createApiKey({auth,name:body.name,type:body.type,permissions:body.permissions,podId:body.pod_id,inboxId:body.inbox_id,expiresAt:body.expires_at,idempotencyKey}));
        if(parts.length===3&&method==='GET')return ok(await api.getApiKey({auth,apiKeyId:parts[2]}));
        if(parts.length===3&&method==='PATCH')return ok(await api.updateApiKey({auth,apiKeyId:parts[2],name:body.name,type:body.type,permissions:body.permissions,expiresAt:body.expires_at}));
        if(parts.length===3&&method==='DELETE')return gone(await api.deleteApiKey({auth,apiKeyId:parts[2]}));
      }

      if(parts[1]==='list-entries'){
        if(parts.length===2&&method==='GET')return ok(await api.listEntries({auth,direction:q.direction,type:q.type,inboxId:q.inbox_id,podId:q.pod_id,limit:q.limit,pageToken:q.page_token}));
        if(parts.length===2&&method==='POST')return created(await api.createListEntry({auth,direction:body.direction,type:body.type,entry:body.entry,reason:body.reason,inboxId:body.inbox_id,podId:body.pod_id,idempotencyKey}));
        if(parts.length===3&&method==='DELETE')return gone(await api.deleteListEntry({auth,listEntryId:parts[2]}));
      }

      return ok({error:'not-found'},404);
    }catch(error){const out=uberMailHttpError(error);return{status:out.status,headers:{'content-type':'application/json'},body:out.body};}
  };
}
