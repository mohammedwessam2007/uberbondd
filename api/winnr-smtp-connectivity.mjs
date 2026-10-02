import tls from 'node:tls';

const HOST='inbound.mywinnr.com';
const PORT=465;

function probe(){
  return new Promise(resolve=>{
    const started=Date.now();
    let settled=false;
    const done=result=>{
      if(settled)return;
      settled=true;
      clearTimeout(timer);
      try{socket.destroy();}catch{}
      resolve({...result,elapsedMs:Date.now()-started});
    };
    const socket=tls.connect({
      host:HOST,
      port:PORT,
      servername:HOST,
      rejectUnauthorized:true
    });
    const timer=setTimeout(()=>done({ok:false,status:'TIMEOUT'}),8000);
    socket.once('secureConnect',()=>{
      const cert=socket.getPeerCertificate();
      socket.once('data',chunk=>{
        const greeting=String(chunk||'').trim().slice(0,120);
        done({
          ok:/^220\b/.test(greeting),
          status:/^220\b/.test(greeting)?'SMTP_TLS_GREETING_CONFIRMED':'SMTP_TLS_CONNECTED_NO_220',
          tlsAuthorized:socket.authorized===true,
          protocol:socket.getProtocol()||null,
          certSubjectCN:cert?.subject?.CN||null,
          greetingCode:greeting.slice(0,3)||null
        });
      });
      socket.write('');
    });
    socket.once('error',error=>{
      const nested=Array.isArray(error?.errors)
        ? error.errors.slice(0,6).map(item=>({code:item?.code||null,address:item?.address||null,port:item?.port||null}))
        : [];
      done({ok:false,status:'CONNECT_ERROR',code:error?.code||null,nested});
    });
  });
}

export default async function handler(req,res){
  if(req.method!=='GET')return res.status(405).json({ok:false,status:'METHOD_NOT_ALLOWED'});
  const result=await probe();
  res.setHeader('cache-control','no-store');
  return res.status(result.ok?200:503).json({
    ...result,
    host:HOST,
    port:PORT,
    credentialsUsed:false,
    messageSent:false,
    truthBoundary:'Connectivity probe only. No SMTP authentication and no message submission.'
  });
}
