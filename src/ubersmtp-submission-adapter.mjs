import crypto from 'node:crypto';
import net from 'node:net';
import tls from 'node:tls';

export const UBERSMTP_SUBMISSION_VERSION = 'uberbond.ubersmtp-submission.v1';
const clean=(v,n=2000)=>String(v??'').trim().slice(0,n);
const hash=v=>crypto.createHash('sha256').update(String(v)).digest('hex');
const loopback=h=>['127.0.0.1','::1','localhost'].includes(String(h||'').toLowerCase());

function header(value,max=1000){return clean(value,max).replace(/[\r\n]+/g,' ');}
function messageId(from=''){
  const domain=String(from||'').trim().toLowerCase().split('@').pop()?.replace(/[^a-z0-9.-]/g,'');
  const safeDomain=domain&&domain.includes('.')?domain:'uberbond.local';
  return `<ub-${crypto.randomUUID()}@${safeDomain}>`;
}
function dotStuff(body){return String(body??'').replace(/\r?\n/g,'\r\n').split('\r\n').map(line=>line.startsWith('.')?`.${line}`:line).join('\r\n');}
function mimeMessage(message={}){
  const id=header(message.messageId,500)||messageId(message.from);
  const headers=[
    `Message-ID: ${id}`,
    `From: ${header(message.from,320)}`,
    `To: ${header(message.to,320)}`,
    `Subject: ${header(message.subject,998)}`,
    `Date: ${new Date().toUTCString()}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit'
  ];
  if(message.replyTo)headers.push(`Reply-To: ${header(message.replyTo,320)}`);
  if(message.listUnsubscribe)headers.push(`List-Unsubscribe: ${header(message.listUnsubscribe,1200)}`);
  return {messageId:id,raw:`${headers.join('\r\n')}\r\n\r\n${dotStuff(message.body)}\r\n`};
}

function responseReader(socket,{timeoutMs=30000}={}){
  let buffer='';
  const waiters=[];
  const fail=error=>{while(waiters.length)waiters.shift().reject(error);};
  socket.setEncoding('utf8');
  socket.on('data',chunk=>{buffer+=chunk;drain();});
  socket.on('error',fail);socket.on('close',()=>fail(new Error('smtp-connection-closed')));
  function drain(){
    while(waiters.length){
      const lines=buffer.split(/\r?\n/); if(lines.length<2)return;
      let consumed=0,code=null,final=-1;
      for(let i=0;i<lines.length-1;i++){
        const m=lines[i].match(/^(\d{3})([ -])(.*)$/); if(!m)continue;
        if(code==null)code=m[1];
        if(m[1]===code&&m[2]===' '){final=i;break;}
      }
      if(final<0)return;
      const taken=lines.slice(0,final+1); consumed=taken.join('\r\n').length+2;
      buffer=buffer.slice(consumed);
      const waiter=waiters.shift();clearTimeout(waiter.timer);
      waiter.resolve({code:Number(code),lines:taken,text:taken.join('\n')});
    }
  }
  return ()=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('smtp-response-timeout')),timeoutMs);waiters.push({resolve,reject,timer});drain();});
}

async function connectSocket({host,port,secure,connectTimeoutMs}){
  return new Promise((resolve,reject)=>{
    const options={host,port};
    const socket=secure?tls.connect({...options,servername:net.isIP(host)?undefined:host,rejectUnauthorized:true}):net.createConnection(options);
    const timer=setTimeout(()=>{socket.destroy();reject(new Error('smtp-connect-timeout'));},connectTimeoutMs);
    const event=secure?'secureConnect':'connect';
    socket.once(event,()=>{clearTimeout(timer);resolve(socket);});
    socket.once('error',error=>{clearTimeout(timer);reject(error);});
  });
}

async function openSmtpSession({host,port,secure,username,password,connectTimeoutMs=10000,commandTimeoutMs=30000}){
  if(!secure&&!loopback(host))throw new Error('plaintext-smtp-only-allowed-on-loopback');
  const socket=await connectSocket({host,port,secure,connectTimeoutMs});
  const read=responseReader(socket,{timeoutMs:commandTimeoutMs});
  const expect=async(allowed)=>{const r=await read();if(!allowed.includes(r.code))throw new Error(`smtp-${r.code}:${clean(r.text,500)}`);return r;};
  const cmd=async(line,allowed=[250])=>{socket.write(`${line}\r\n`);return expect(allowed);};
  const greeting=await expect([220]);
  await cmd(`EHLO ${loopback(host)?'uberbond.local':'uberbond'}`, [250]);
  if(username||password){
    if(!username||!password)throw new Error('smtp-username-and-password-required-together');
    const token=Buffer.from(`\0${username}\0${password}`,'utf8').toString('base64');
    await cmd(`AUTH PLAIN ${token}`,[235]);
  }
  return {
    greeting,
    async sendMessage({from,to,raw}){
      await cmd(`MAIL FROM:<${from}>`,[250]);
      await cmd(`RCPT TO:<${to}>`,[250,251]);
      await cmd('DATA',[354]);
      socket.write(`${raw}\r\n.\r\n`);
      const final=await expect([250]);
      return {accepted:true,response:final.text};
    },
    async close(){try{await cmd('QUIT',[221,250]);}catch{} socket.end();}
  };
}

export function createUberSmtpSubmissionTransport({
  host, port=465, secure=true, username='', password='', connectTimeoutMs=10000, commandTimeoutMs=30000,
  authorized=false, termsCompatible=false, evidenceRef='', smtpSessionFactory=openSmtpSession
}={}){
  const reasons=[];
  const h=clean(host,253);const p=Number(port);
  if(!h)reasons.push('smtp-host-required');
  if(!Number.isInteger(p)||p<1||p>65535)reasons.push('valid-smtp-port-required');
  if(authorized!==true)reasons.push('smtp-route-authorization-required');
  if(termsCompatible!==true)reasons.push('smtp-route-terms-compatibility-required');
  if(!clean(evidenceRef,1500))reasons.push('smtp-route-evidence-ref-required');
  if(!secure&&!loopback(h))reasons.push('plaintext-smtp-only-allowed-on-loopback');
  if(reasons.length)return {ok:false,status:'UBERSMTP_TRANSPORT_REFUSED',reasonCodes:reasons,providerCalls:0,messagesSent:0};
  return {
    ok:true,status:'UBERSMTP_TRANSPORT_READY',version:UBERSMTP_SUBMISSION_VERSION,
    host:h,port:p,secure:Boolean(secure),evidenceRef:clean(evidenceRef,1500),
    async send(message={}){
      const to=clean(message.to,320).toLowerCase(),from=clean(message.from,320).toLowerCase();
      if(!to||!from||!clean(message.subject,998)||!clean(message.body,100000))return {confirmed:false,reasonCodes:['complete-message-required']};
      const mime=mimeMessage({...message,to,from});
      let session;
      try{
        session=await smtpSessionFactory({host:h,port:p,secure:Boolean(secure),username,password,connectTimeoutMs,commandTimeoutMs});
        const result=await session.sendMessage({from,to,raw:mime.raw,messageId:mime.messageId});
        if(result?.accepted!==true||!clean(result?.response,2000))return {confirmed:false,providerResponse:clean(result?.response,2000)||null};
        return {
          confirmed:true,
          providerReceiptId:`smtp250:${hash(JSON.stringify({host:h,port:p,messageId:mime.messageId,response:result.response}))}`,
          providerResponse:clean(result.response,2000),
          messageId:mime.messageId,
          evidenceRef:clean(evidenceRef,1500)
        };
      }finally{await session?.close?.().catch?.(()=>{});}
    },
    truthBoundary:'A confirmed result requires an SMTP 250 response after DATA from the configured authorized submission route. It proves provider acceptance at submission time only, not inbox placement, reply, revenue, or future delivery.'
  };
}
