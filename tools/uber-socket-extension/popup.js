const $=id=>document.getElementById(id);
const status=text=>{$('status').textContent=text};
const b64u=bytes=>{let s='';for(const b of bytes)s+=String.fromCharCode(b);return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,'')};
const decode=s=>JSON.parse(atob(String(s).replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-String(s).length%4)%4)));
const encode=o=>btoa(JSON.stringify(o)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,'');
async function activeTab(){const [t]=await chrome.tabs.query({active:true,currentWindow:true});return t}
function parsePair(){try{const p=decode($('pair').value.trim());if(!p.roomId||!p.pairKey)throw 0;return p}catch{return null}}
$('create').onclick=()=>{const key=crypto.getRandomValues(new Uint8Array(32));$('pair').value=encode({v:1,roomId:'uber-'+crypto.randomUUID(),pairKey:b64u(key)});status('New encrypted pair created')};
$('copy').onclick=async()=>{if(!$('pair').value.trim())return status('Create or paste a pair first');await navigator.clipboard.writeText($('pair').value.trim());status('Pair code copied')};
$('apply').onclick=async()=>{
 const tab=await activeTab(); if(!tab?.id||!String(tab.url||'').startsWith('https://chatgpt.com/'))return status('Open a ChatGPT conversation in this tab');
 const p=parsePair(); if(!p)return status('Invalid pair code');
 const role=$('role').value; const cfg={roomId:p.roomId,pairKey:p.pairKey,peerId:role==='A'?'chat-a':'chat-b',targetPeer:role==='A'?'chat-b':'chat-a',armed:$('armed').checked,autoDialogue:$('auto').checked,maxTurns:Math.max(1,Math.min(20,Number($('turns').value)||6))};
 const r=await chrome.runtime.sendMessage({type:'UBER_SOCKET_CONFIGURE',tabId:tab.id,config:cfg});status(r?.ok?(cfg.armed?`Armed ${cfg.peerId} → ${cfg.targetPeer}`:'Saved but disarmed'):`Error: ${r?.error||'configure failed'}`);
};
$('send').onclick=async()=>{
 const tab=await activeTab(); const body=$('prompt').value.trim(); if(!body)return status('Write a prompt first');
 const r=await chrome.runtime.sendMessage({type:'UBER_SOCKET_PROMPT',tabId:tab.id,body});status(r?.ok?'Encrypted prompt sent':`Send failed: ${r?.reason||r?.error||'unknown'}`);
};
(async()=>{try{const tab=await activeTab();if(!tab?.id)return;const r=await chrome.runtime.sendMessage({type:'UBER_SOCKET_GET_CONFIG',tabId:tab.id});const c=r?.config;if(!c)return;if(c.pairKey)$('pair').value=encode({v:1,roomId:c.roomId,pairKey:c.pairKey});$('role').value=c.peerId==='chat-b'?'B':'A';$('armed').checked=!!c.armed;$('auto').checked=c.autoDialogue!==false;$('turns').value=c.maxTurns||6;status(c.armed?`Armed ${c.peerId}`:'Configured, disarmed')}catch{}})();