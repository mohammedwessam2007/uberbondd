/** Vercel's vanilla Node functions expect a DEFAULT (req,res) handler.
 * Request/Response method exports alone are not a Node-function endpoint.
 * Preserve the exact signed raw bytes; never rebuild provider JSON from the
 * already-parsed req.body (which could alter an HMAC payload). */
export function createUberWarmNodeBridge(fetchHandler,{maxBodyBytes=65536}={}){
 if(typeof fetchHandler!=='function'||!Number.isSafeInteger(maxBodyBytes)||maxBodyBytes<1)
   throw Error('node-bridge-handler-and-finite-body-limit-required');
 return async function nodeHandler(req,res){
  const method=String(req?.method||'GET').toUpperCase();
  if(!['GET','POST','HEAD'].includes(method)){
   res.statusCode=405;res.setHeader('allow','GET, POST');res.end('Method not allowed');return;
  }
  let body=null;
  if(method==='POST'){
   const parts=[];let size=0;
   try{
    for await(const item of req){const part=Buffer.from(item);size+=part.length;
     if(size>maxBodyBytes){res.statusCode=413;res.end('Request too large');return;}parts.push(part);
    }
    body=Buffer.concat(parts);
   }catch{res.statusCode=400;res.end('Unable to read raw request');return;}
  }
  let response;
  try{
    const request=new Request('https://runtime.local.invalid'+(String(req?.url||'/').startsWith('/')?req.url:'/'),{
      method,headers:req.headers||{},...(method==='POST'?{body}:{}),redirect:'manual'
    });
    response=await fetchHandler(request);
  }catch{res.statusCode=503;res.end('Service unavailable');return;}
  if(!response||typeof response.arrayBuffer!=='function'){
    res.statusCode=503;res.end('Service unavailable');return;
  }
  res.statusCode=response.status;
  for(const [key,value] of response.headers)res.setHeader(key,value);
  res.end(Buffer.from(await response.arrayBuffer()));
 };
}
