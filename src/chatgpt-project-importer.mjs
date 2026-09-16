import crypto from 'node:crypto';

export const CHATGPT_PROJECT_IMPORTER_VERSION='uberbond.chatgpt-project-importer.v1';

const text=(v,m=200000)=>{const s=String(v??'').trim();return s&&s.length<=m?s:null;};
const safeId=v=>String(v||'').toLowerCase().replace(/[^a-z0-9._:-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,120)||crypto.randomUUID();
const epoch=v=>{const n=Number(v);return Number.isFinite(n)?new Date(n*1000).toISOString():new Date().toISOString();};

function messageText(message){
  const content=message?.content;
  if(!content) return '';
  if(Array.isArray(content.parts)) return content.parts.map(part=>typeof part==='string'?part:JSON.stringify(part)).join('\n').trim();
  if(typeof content.text==='string') return content.text.trim();
  if(typeof content==='string') return content.trim();
  return '';
}

function flattenConversation(conv){
  const rows=[];
  const mapping=conv?.mapping&&typeof conv.mapping==='object'?conv.mapping:{};
  for(const node of Object.values(mapping)){
    const msg=node?.message;
    if(!msg) continue;
    const body=messageText(msg);
    if(!body) continue;
    const role=String(msg?.author?.role||'unknown').toLowerCase();
    const created=Number(msg?.create_time||node?.create_time||conv?.create_time||0);
    rows.push({role,body,created,id:String(msg.id||node?.id||'')});
  }
  rows.sort((a,b)=>a.created-b.created||a.id.localeCompare(b.id));
  return rows;
}

function conversationHaystack(conv,rows){
  return `${conv?.title||''}\n${conv?.project?.name||''}\n${conv?.project_name||''}\n${rows.slice(0,80).map(r=>r.body).join('\n')}`.toLowerCase();
}

function matchConversation(conv,rows,{projectIds=[],selectors=['uberbond'],includeAll=false}={}){
  if(includeAll) return true;
  const pid=String(conv?.project_id||conv?.project?.id||'');
  if(pid&&projectIds.map(String).includes(pid)) return true;
  const hay=conversationHaystack(conv,rows);
  return selectors.some(s=>hay.includes(String(s).toLowerCase()));
}

function transcriptChunks(rows,{maxChars=18000,maxMessages=80}={}){
  const chunks=[]; let current=[]; let chars=0;
  const flush=()=>{if(current.length){chunks.push(current);current=[];chars=0;}};
  for(const row of rows){
    const line=`${row.role.toUpperCase()}: ${row.body}`;
    if(current.length&&(chars+line.length>maxChars||current.length>=maxMessages)) flush();
    current.push(row); chars+=line.length+2;
  }
  flush(); return chunks;
}

export async function importChatGPTProjectExport({runtime,exportData,projectIds=[],selectors=['uberbond'],includeAll=false,maxConversations=1000,maxCharsPerChunk=18000,maxMessagesPerChunk=80}={}){
  if(!runtime?.registerChat||!runtime?.ingest||!runtime?.status) throw new TypeError('uber-socket-runtime-required');
  const conversations=Array.isArray(exportData)?exportData:Array.isArray(exportData?.conversations)?exportData.conversations:null;
  if(!conversations) throw new Error('chatgpt-conversations-array-required');
  const status=runtime.status();
  const selected=[];
  for(const conv of conversations){
    if(selected.length>=Math.max(1,Math.min(5000,Number(maxConversations)||1000))) break;
    const rows=flattenConversation(conv);
    if(rows.length&&!matchConversation(conv,rows,{projectIds,selectors,includeAll})) continue;
    if(rows.length) selected.push({conv,rows});
  }
  const receipts=[];
  for(const {conv,rows} of selected){
    const sourceId=String(conv?.id||conv?.conversation_id||crypto.randomUUID());
    const peerId=`chatgpt:${safeId(sourceId)}`;
    const title=text(conv?.title,500)||'Untitled ChatGPT conversation';
    const active=status.state==='ACTIVE';
    const peer=await runtime.registerChat({
      peerId,
      ...(active?{}:{conversationId:`archive:${safeId(sourceId)}`}),
      projectId:String(conv?.project_id||conv?.project?.id||'uberbond'),
      title,
      tags:['chatgpt-import','uberbond',...(Array.isArray(conv?.tags)?conv.tags.map(String):[])],
      metadata:{
        source:'chatgpt-export',
        sourceConversationId:sourceId,
        archivalOnly:!active,
        importedAt:new Date().toISOString(),
        createTime:epoch(conv?.create_time),
        updateTime:epoch(conv?.update_time||conv?.create_time),
      }
    });
    const chunks=transcriptChunks(rows,{maxChars:maxCharsPerChunk,maxMessages:maxMessagesPerChunk});
    const docIds=[];
    for(let i=0;i<chunks.length;i++){
      const chunk=chunks[i];
      const docId=`cgpt-${crypto.createHash('sha256').update(`${sourceId}:${i}`).digest('hex').slice(0,24)}`;
      const body=chunk.map(r=>`${r.role.toUpperCase()}: ${r.body}`).join('\n\n');
      runtime.ingest({
        peerId,
        docId,
        title:`${title} · part ${i+1}/${chunks.length}`,
        text:body,
        tags:['chatgpt-import','uberbond'],
        createdAt:epoch(chunk[0]?.created||conv?.create_time),
        metadata:{source:'chatgpt-export',sourceConversationId:sourceId,chunkIndex:i,chunkCount:chunks.length,messageCount:chunk.length}
      });
      docIds.push(docId);
    }
    receipts.push(Object.freeze({peerId,conversationId:peer.conversationId,title,messageCount:rows.length,documentCount:docIds.length,docIds:Object.freeze(docIds),archivalOnly:!active}));
  }
  return Object.freeze({
    ok:true,
    schema:'uberbond.chatgpt-project-import-receipt.v1',
    importedConversations:receipts.length,
    importedDocuments:receipts.reduce((n,r)=>n+r.documentCount,0),
    liveModelBound:status.state==='ACTIVE',
    receipts:Object.freeze(receipts),
    externalEffectsAuthorized:false,
  });
}

export { flattenConversation };
