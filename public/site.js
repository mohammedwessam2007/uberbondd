const $=s=>document.querySelector(s);
const money=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(Number(n||0));
async function loadConfig(){try{const r=await fetch('/api/public/config');const c=await r.json();$('#price-full').textContent=money(c.prices.full);$('#price-strategy').textContent=money(c.prices.strategy);$('#price-monitoring').textContent=money(c.prices.monitoring);$('#price-implementation').textContent=`from ${money(c.prices.implementationFrom)}`;}catch{}}
document.querySelectorAll('[data-offer]').forEach(link=>link.addEventListener('click',()=>{
  const select=document.querySelector('select[name="requestedOffer"]');
  if(select) select.value=link.dataset.offer;
}));
$('#audit-form').addEventListener('submit',async e=>{
  e.preventDefault();const button=$('.submit-audit'),status=$('#form-status');button.disabled=true;status.className='form-status active';status.textContent='The engine is accepting your website…';
  try{
    const f=new FormData(e.currentTarget);const payload=Object.fromEntries(f);payload.consent=f.has('consent');payload.followUp=f.has('followUp');
    // A printed consent-bridge code (typed, or from ?code=) only attributes this request; the consent is the boxes above.
    const code=String(payload.code||'').toUpperCase().replace(/[^0-9A-Z]/g,'');delete payload.code;if(/^[0-9A-Z]{12}$/.test(code))payload.source=`bridge:${code}`;
    const res=await fetch('/api/public/audit',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});const data=await res.json();if(!res.ok)throw new Error(data.error||'Could not create audit');
    status.className='form-status active success';status.textContent='Audit accepted. Opening your private report room…';
    setTimeout(()=>location.href=data.statusUrl,650);
  }catch(error){status.className='form-status active error';status.textContent=error.message;button.disabled=false;}
});
{const linked=new URLSearchParams(location.search).get('code');const field=document.querySelector('input[name="code"]');if(linked&&field)field.value=String(linked).slice(0,20);}
loadConfig();
