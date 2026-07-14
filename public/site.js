const $=s=>document.querySelector(s);
const money=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(Number(n||0));
async function loadConfig(){try{const r=await fetch('/api/public/config');const c=await r.json();$('#price-full').textContent=money(c.prices.full);$('#price-strategy').textContent=money(c.prices.strategy);$('#price-monitoring').textContent=money(c.prices.monitoring);}catch{}}
$('#audit-form').addEventListener('submit',async e=>{
  e.preventDefault();const button=$('.submit-audit'),status=$('#form-status');button.disabled=true;status.className='form-status active';status.textContent='The engine is accepting your website…';
  try{
    const f=new FormData(e.currentTarget);const payload=Object.fromEntries(f);payload.consent=f.has('consent');
    const res=await fetch('/api/public/audit',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});const data=await res.json();if(!res.ok)throw new Error(data.error||'Could not create audit');
    status.className='form-status active success';status.textContent='Audit accepted. Opening your private report room…';
    setTimeout(()=>location.href=data.statusUrl,650);
  }catch(error){status.className='form-status active error';status.textContent=error.message;button.disabled=false;}
});
loadConfig();
