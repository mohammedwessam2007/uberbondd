const $=s=>document.querySelector(s);const token=new URLSearchParams(location.search).get('token')||'';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(Number(n||0));
const confidence=n=>`${Math.round(Number(n||0)*100)}%`;
function finding(x){return `<article class="public-finding"><div class="finding-head"><span>${esc(x.category||'Opportunity')}</span><b>${x.severity}/5 impact · ${confidence(x.confidence)} confidence</b></div><h3>${esc(x.title)}</h3><p>${esc(x.implication)}</p><div class="evidence"><strong>Evidence</strong><p>${esc(x.evidenceExcerpt)}</p><a href="${esc(x.evidenceUrl)}" target="_blank" rel="noopener">Open source page</a></div><div class="service-line">Recommended response: <strong>${esc(x.service)}</strong></div></article>`}
async function checkout(product){
  const buttons=document.querySelectorAll(`[data-product="${product}"]`);buttons.forEach(b=>b.disabled=true);
  try{const res=await fetch('/api/public/checkout',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token,product})});const data=await res.json();if(!res.ok)throw new Error(data.error||'Checkout unavailable');location.href=data.url;}catch(e){alert(`${e.message}. The owner still needs to connect the hosted checkout link.`);buttons.forEach(b=>b.disabled=false);}
}
function render(data){
  const {lead,report,offers}=data;document.title=`${lead.company} Opportunity Report · UberBond`;
  const score=report.score?.total??'—',tier=report.score?.tier||'Pending';const observations=report.observations||[];
  const shots=report.screenshots||[];
  $('#report-content').innerHTML=`
  <section class="report-hero"><div><p class="eyebrow">PRIVATE DIGITAL OPPORTUNITY REPORT</p><h1>${esc(lead.company)}</h1><a href="${esc(lead.website)}" target="_blank" rel="noopener">${esc(lead.website)}</a><p class="report-date">Generated ${esc((report.generatedAt||'').replace('T',' ').slice(0,16))}</p></div><div class="report-score"><b>${esc(score)}</b><span>Tier ${esc(tier)}</span><small>Opportunity score</small></div></section>
  <section class="report-summary"><div><span>Access</span><b>${report.fullAccess?'Full report':'Free snapshot'}</b></div><div><span>Supported findings</span><b>${observations.length}${report.hiddenFindings?` + ${report.hiddenFindings} locked`:''}</b></div><div><span>Evidence standard</span><b>URL + capture</b></div></section>
  ${report.primaryOpportunity?`<section class="primary-panel"><p class="eyebrow">PRIMARY OPPORTUNITY</p>${finding(report.primaryOpportunity)}</section>`:''}
  ${shots.length?`<section class="report-section"><div class="section-intro"><p class="eyebrow">VISUAL EVIDENCE</p><h2>What the browser captured.</h2></div><div class="report-gallery">${shots.map(s=>`<figure><a href="${esc(s.desktop)}" target="_blank"><img src="${esc(s.desktop)}" alt="Desktop capture of ${esc(lead.company)}"></a><figcaption>${esc(s.url)}</figcaption><a href="${esc(s.mobile)}" target="_blank">View mobile capture</a></figure>`).join('')}</div></section>`:''}
  <section class="report-section"><div class="section-intro"><p class="eyebrow">SUPPORTED FINDINGS</p><h2>${report.fullAccess?'The complete opportunity map.':'Your first verified finding.'}</h2></div><div class="public-findings">${observations.map(finding).join('')||'<div class="empty">The worker has not produced a safe finding yet.</div>'}</div></section>
  ${report.hiddenFindings?`<section class="locked-report"><div class="lock-icon">${report.hiddenFindings}</div><div><p class="eyebrow">FULL REPORT LOCKED</p><h2>Unlock ${report.hiddenFindings} additional evidence-backed findings.</h2><p>See every supported observation, screenshot, risk flag, and prioritized service recommendation.</p></div><button class="button gold large" data-product="full">Unlock full audit · ${money(offers.full.price)}</button></section>`:''}
  <section class="report-section"><div class="section-intro"><p class="eyebrow">NEXT STEPS</p><h2>Turn diagnosis into movement.</h2></div><div class="next-grid">
    <article><span>01</span><h3>Full Digital Audit</h3><p>Unlock the complete automated report and printable evidence map.</p><button class="button" data-product="full">${money(offers.full.price)}</button></article>
    <article><span>02</span><h3>Strategy Audit</h3><p>Add human review, prioritization, and an implementation roadmap.</p><button class="button" data-product="strategy">${money(offers.strategy.price)}</button></article>
    <article><span>03</span><h3>UberBond Watch</h3><p>Schedule recurring scans and preserve a change history over time.</p><button class="button" data-product="monitoring">${money(offers.monitoring.price)}/mo</button></article>
    <article><span>04</span><h3>Implementation Sprint</h3><p>Have UberBond design and build the highest-impact fix.</p>${offers.implementation.bookingUrl?`<a class="button gold" href="${esc(offers.implementation.bookingUrl)}" target="_blank">Book a conversation</a>`:`<a class="button gold" href="mailto:uberbond.co@gmail.com?subject=${encodeURIComponent(lead.company+' implementation sprint')}">Discuss implementation</a>`}</article>
  </div></section>`;
  $('#report-loading').hidden=true;$('#report-content').hidden=false;document.querySelectorAll('[data-product]').forEach(b=>b.onclick=()=>checkout(b.dataset.product));
}
async function load(){
  if(!token){$('#report-loading').innerHTML='<h1>Missing private report token.</h1><p>Return to the audit form and submit your website again.</p>';return;}
  try{const res=await fetch(`/api/public/report/${encodeURIComponent(token)}`);const data=await res.json();if(!res.ok)throw new Error(data.error||'Report unavailable');if(data.report.ready){render(data);return;}$('#report-loading h1').textContent=data.report.status==='error'?'The scan needs attention.':'Nightshift is inspecting the website.';$('#report-loading p').textContent=data.report.error||'This page refreshes automatically. The worker is collecting evidence now.';setTimeout(load,7000);}catch(e){$('#report-loading h1').textContent='Report unavailable';$('#report-loading p').textContent=e.message;}
}
$('#print-report').onclick=()=>window.print();load();
