export const PEER_SCHEMA='uberbond.peer.v1';
export function makePeerMessage({threadId,messageId,fromPeer,toPeer,body,replyTo=null,kind='MESSAGE',createdAt=new Date().toISOString()}={}){
 const msg={schema:PEER_SCHEMA,threadId:String(threadId||''),messageId:String(messageId||''),fromPeer:String(fromPeer||''),toPeer:String(toPeer||''),replyTo:replyTo==null?null:String(replyTo),kind:String(kind||'MESSAGE').toUpperCase(),body:String(body||''),externalEffectsAuthorized:false,createdAt:String(createdAt)};
 const errors=[];
 for(const k of ['threadId','messageId','fromPeer','toPeer']) if(!/^[a-z0-9][a-z0-9._:-]{0,127}$/i.test(msg[k])) errors.push(`${k}-invalid`);
 if(!['MESSAGE','PROMPT','RESPONSE','QUESTION','ANSWER','HANDOFF','ACK','STATE_SYNC'].includes(msg.kind)) errors.push('kind-invalid');
 if(Buffer.byteLength(msg.body,'utf8')>65536) errors.push('body-too-large');
 if(msg.replyTo!==null&&!/^[a-z0-9][a-z0-9._:-]{0,127}$/i.test(msg.replyTo)) errors.push('replyTo-invalid');
 if(!Number.isFinite(Date.parse(msg.createdAt))) errors.push('createdAt-invalid');
 return errors.length?{ok:false,errors}:{ok:true,message:Object.freeze(msg)};
}
