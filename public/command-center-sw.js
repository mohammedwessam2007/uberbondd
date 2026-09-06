const CACHE='uberbond-command-center-shell-v1';
const SHELL=['/command-center.html','/command-center.css','/command-center.js','/command-center.webmanifest','/icon.svg'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE&&key.startsWith('uberbond-command-center-shell-')).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET')return;
  const url=new URL(request.url);
  const hasAuthorization=request.headers.has('authorization');
  const isApi=url.pathname.startsWith('/api/');
  if(hasAuthorization||isApi)return;
  if(url.origin!==self.location.origin)return;
  event.respondWith(caches.match(request).then(cached=>cached||fetch(request).then(response=>{
    if(!response||!response.ok||response.type==='opaque')return response;
    const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(request,copy));return response;
  }).catch(()=>caches.match('/command-center.html'))));
});
