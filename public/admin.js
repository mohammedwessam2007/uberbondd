const $=s=>document.querySelector(s);
let token=''; let cache={prospects:[],campaigns:[]};
$('#token').value='';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const api=async(path,opts={})=>{const headers={authorization:`Bearer ${token}`,...(opts.headers||{})};if(opts.body&&typeof opts.body==='string'&&!headers['content-type'])headers['content-type']='application/json';const res=await fetch(path,{...opts,headers,cache:'no-store'});const type=res.headers.get('content-type')||'';const data=type.includes('json')?await res.json():await res.text();if(!res.ok){const error=new Error(data.error||data||'Request failed');error.status=res.status;throw error;}return data;};
const pill=s=>`<span class="pill ${esc(s)}">${esc(s)}</span>`;
function metric(label,value,sub=''){return `<div class="metric"><b>${esc(value)}</b><span>${esc(label)}</span>${sub?`<small>${esc(sub)}</small>`:''}</div>`}
function money(v){return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(Number(v||0))}
function renderNativeOps(tower, lookalike=null){
  const coverage=tower?.coverage?.totals||{};
  const buying=tower?.buyingGroups?.summary||{};
  const preflight=tower?.providerPreflight||{};
  const bottlenecks=tower?.coverage?.bottlenecks||[];
  $('#native-ops-tower').innerHTML=tower
    ? `<div class="metrics">${metric('Accounts',coverage.accounts||0,`${coverage.accountCoveragePercent||0}% target coverage`)}${metric('Eligible leads',coverage.eligible||0,`${coverage.leadCoveragePercent||0}% target coverage`)}${metric('Evidence gaps',bottlenecks.find(x=>x.key==='missing_evidence')?.count||0)}${metric('Buying-group coverage',buying.averageCoveragePercent||0,'% average')}</div><div class="mini-card"><b>${esc(preflight.safeToRun?'Local/provider plan is runnable':'Provider plan needs closure')}</b><small>${esc(preflight.blockingReasons?.slice(0,2).join(' · ')||'No blocking provider-plan reason')}</small><p>${esc(bottlenecks.slice(0,3).map(x=>x.label+': '+x.count).join(' · ')||'No current bottlenecks')}</p></div>${lookalike?`<div class="mini-card"><b>Lookalike plan · ${esc(lookalike.results?.length||0)} candidates</b><small>Seed: ${esc(lookalike.seeds?.[0]?.company||'selected account')} · no send</small></div>`:''}`
    : '<div class="mini-card"><small>Quality control tower unavailable.</small></div>';
  const report={
    coverage:{totals:coverage,bottlenecks:bottlenecks.slice(0,6)},
    buyingGroups:buying,
    providerPreflight:{safeToRun:preflight.safeToRun,blockingReasons:preflight.blockingReasons,estimate:preflight.estimate},
    lookalike:lookalike?{status:lookalike.status,results:(lookalike.results||[]).slice(0,10)}:null
  };
  $('#native-ops-report').textContent=JSON.stringify(report,null,2);
}
async function download(url){
  const res=await fetch(url,{headers:{authorization:`Bearer ${token}`},cache:'no-store'});
  if(!res.ok){const type=res.headers.get('content-type')||'';const data=type.includes('json')?await res.json():await res.text();throw new Error(data?.error||data||'Download failed');}
  const blob=await res.blob();
  const disposition=res.headers.get('content-disposition')||'';
  const named=/filename="?([^";]+)"?/i.exec(disposition)?.[1];
  const fallback=url.endsWith('.csv')?'uberbond-opportunities.csv':'uberbond-revenue-engine.json';
  const objectUrl=URL.createObjectURL(blob);
  const anchor=document.createElement('a');
  anchor.href=objectUrl;anchor.download=named||fallback;anchor.rel='noopener';anchor.style.display='none';
  document.body.appendChild(anchor);anchor.click();anchor.remove();
  setTimeout(()=>URL.revokeObjectURL(objectUrl),0);
}
async function startGoogle(slot){
  const result=await api(`/api/admin/oauth/google/start?slot=${slot==='B'?'B':'A'}`,{method:'POST'});
  const authorizationUrl=String(result?.authorizationUrl||'');
  let parsed;
  try{parsed=new URL(authorizationUrl);}catch{throw new Error('OAuth authorization URL was invalid');}
  if(parsed.protocol!=='https:'||parsed.hostname!=='accounts.google.com')throw new Error('OAuth authorization URL was refused');
  location.assign(parsed.toString());
}
function clearProtectedState(){token='';cache={prospects:[],campaigns:[]};const field=$('#token');if(field)field.value='';}
window.addEventListener('pagehide',clearProtectedState);
const localDateTime=()=>{const d=new Date();const pad=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;};
const setIfBlank=(form,name,value)=>{const field=form?.elements?.namedItem(name);if(field&&!field.value&&value)field.value=value;};
const approvalKey=x=>{const material=JSON.stringify(x);let hash=2166136261;for(const char of material){hash^=char.charCodeAt(0);hash=Math.imul(hash,16777619);}return `canary-approval-${(hash>>>0).toString(16)}-${material.length}`;};
function renderCanaryPreview(){
  const id=$('#canary-prospect-select')?.value;const p=cache.prospects.find(row=>row.id===id);const preview=$('#canary-preview');
  if(!preview){return;}
  if(!p){preview.innerHTML='<small>Select a researched prospect to see the exact stored payload.</small>';return;}
  const authorization=p.sourceMetadata?.authorization||{};
  const approvalForm=$('#canary-approval-form');
  setIfBlank(approvalForm,'sourceUrl',authorization.sourceUrl||p.contact?.sourceUrl||'');
  setIfBlank(approvalForm,'jurisdiction',authorization.jurisdiction||'');
  preview.innerHTML=`<b>${esc(p.company)} · ${esc(p.contact?.email||'no exact email')}</b><small>Status ${esc(p.status)} · sender ${esc(p.inbox||'not routed')}</small><div><strong>Subject:</strong> ${esc(p.subject||'No stored subject')}</div><pre>${esc(p.draft||'No stored body')}</pre>`;
  const status=$('#approval-status');if(status)status.textContent=p.outreachApproval?`Existing approval ${esc(p.outreachApproval.approvalId)} · expires ${esc(p.outreachApproval.expiresAt||'')}`:'No canary approval stored for this prospect.';
}

async function load(){
  try{
    const [sum,pros,camps,replies,social,jobs,leads,orders,subs,notes,discoveryRuns,canary,leadgen,ownerSetup,nativeLists,controlTower]=await Promise.all([
      api('/api/summary'),api('/api/prospects'),api('/api/campaigns'),api('/api/replies'),api('/api/social-tasks'),api('/api/jobs'),api('/api/leads'),api('/api/orders'),api('/api/subscriptions'),api('/api/notifications'),api('/api/discovery-runs'),api('/api/outbound/canary/status').catch(()=>null),api('/api/leadgen/intelligence').catch(()=>null),api('/api/owner/setup').catch(()=>null),api('/api/leadgen/lists').catch(()=>[]),api('/api/leadgen/control-tower').catch(()=>null)
    ]);
    cache={prospects:pros,campaigns:camps};
    $('#mode').textContent=`${sum.paused?'PAUSED':sum.running?'WORKING':sum.workerOnline?'WORKER ONLINE':'WORKER OFFLINE'} · ${sum.autopilot?'AUTOPILOT ON':'MANUAL MODE'}`;
    const outbound=sum.outbound||{};
    $('#outbound-status').textContent=`Outbound: ${outbound.enabled?(outbound.dryRun?'DRY RUN':outbound.globalPaused?'EMERGENCY STOPPED':'ARMED'):'DISABLED'} · ${outbound.reservedToday||0} reserved today · ${outbound.uncertain||0} uncertain`;
    const canaryReasons=(canary?.reasonCodes||[]).slice(0,4).join(' · ');
    $('#canary-status').textContent=canary?`First canary: ${canary.state.replaceAll('_',' ')} · ${canary.counts?.governedReady||0} exact approved · ${canaryReasons||'press is available'}`:'First canary status unavailable';
    $('#pause-outbound').disabled=outbound.globalPaused; $('#resume-outbound').disabled=!outbound.globalPaused;
    const r=sum.revenue||{};
    $('#revenue-metrics').innerHTML=[metric('Today',money(r.todayRevenue),`${r.targetProgress||0}% of $200 target`),metric('Gross revenue',money(r.grossRevenue)),metric('MRR',money(r.mrr)),metric('Paid customers',r.paidCustomers||0),metric('Active subscriptions',r.activeSubscriptions||0),metric('Inbound leads',r.leads||0),metric('Reports ready',r.reportReady||0)].join('');
    $('#metrics').innerHTML=[metric('Prospects',sum.prospects),metric('Queued',sum.queued),metric('Completed',sum.completed),metric('Qualified',sum.qualified,`${sum.qualificationRate}% rate`),metric('Ready',sum.ready),metric('Replies',sum.replied),metric('Positive',sum.positive)].join('');
    const leadStats=leadgen?.stats||{};
    $('#leadgen-metrics').innerHTML=[
      metric('Lead records',leadStats.totalRecords||0),
      metric('Eligible',leadStats.eligibleRecords||0),
      metric('Business email',leadStats.withBusinessEmail||0),
      metric('Accounts',leadStats.accountCount||0)
    ].join('');
    $('#leadgen-top').innerHTML=leadgen?.topLeads?.length
      ? leadgen.topLeads.slice(0,6).map(lead => '<div class="mini-card"><b>'+esc(lead.company||'Unnamed account')+'</b><small>'+esc(lead.website||lead.domain||'No website')+' · score '+esc(lead.score?.total||0)+' · '+esc(lead.source||'local_prospect')+'</small><p>'+esc(lead.nextAction||'Owner review required')+'</p></div>').join('')
      : '<div class="mini-card"><small>No durable prospect records yet. Import authorized leads to populate the workspace.</small></div>';
    $('#leadgen-policy').innerHTML=leadgen
      ? '<div class="mini-card"><b>Live source · '+esc(leadgen.liveSource||'durable-prospects')+'</b><small>'+esc(leadgen.runtime?.prospectRecords||0)+' prospect records · '+esc(leadgen.runtime?.suppressionRecords||0)+' suppression records</small><p>Provider calls: '+esc(leadgen.runtime?.providerCalls||0)+' · external effects: '+esc(leadgen.runtime?.externalEffects||0)+' · handoff is read-only until certification.</p></div>'
      : '<div class="mini-card"><small>Lead intelligence route unavailable.</small></div>';
    $('#native-lists').innerHTML=Array.isArray(nativeLists)&&nativeLists.length
      ? nativeLists.slice(0,6).map(list=>`<div class="mini-card"><b>${esc(list.name||list.id)}</b><small>${esc(list.stats?.selected||0)} selected · ${esc(list.stats?.eligible||0)} owner-plan ready · ${esc(list.stats?.blocked||0)} blocked</small><p>${esc(list.handoff?.send||'NOT_AUTHORIZED')} · <a href="#" class="download-native-list" data-id="${esc(list.id)}">Download CSV</a></p></div>`).join('')
      : '<div class="mini-card"><small>No native lead lists yet.</small></div>';
    renderNativeOps(controlTower);
    const campaignOptions=camps.length?camps.filter(c=>!c.systemKey).map(c=>`<option value="${esc(c.id)}">${esc(c.name)} · min ${c.minScore}</option>`).join(''):'<option value="">Create a campaign first</option>';
    $('#campaign-select').innerHTML=campaignOptions;
    $('#discovery-campaign-select').innerHTML=campaignOptions;
    $('#recipient-campaign-select').innerHTML=camps.filter(c=>!c.systemKey&&c.approved&&c.autoSend).map(c=>`<option value="${esc(c.id)}">${esc(c.name)} · approved auto-send</option>`).join('')||'<option value="">Create an approved auto-send campaign first</option>';
    const identityForm=$('#owner-identity-form');
    if(ownerSetup?.identity){
      setIfBlank(identityForm,'legalName',ownerSetup.identity.legalName);setIfBlank(identityForm,'senderName',ownerSetup.identity.senderName);setIfBlank(identityForm,'company',ownerSetup.identity.company);setIfBlank(identityForm,'postalAddress',ownerSetup.identity.postalAddress);
      $('#identity-status').textContent=`Saved ${ownerSetup.identity.updatedAt||'identity'} · sender address gate is configured locally.`;
    }else $('#identity-status').textContent='No protected identity saved yet.';
    const recipientEvidence=ownerSetup?.recipientEvidence;
    $('#recipient-status').textContent=recipientEvidence?`${recipientEvidence.total||0} owner-recorded recipient(s) · ${recipientEvidence.suppressionRecords||0} suppression record(s) checked.`:'Recipient evidence status unavailable.';
    const campaignById=Object.fromEntries(camps.map(c=>[c.id,c]));
    const canaryCandidates=pros.filter(p=>['ready','research-complete'].includes(p.status)&&p.contact?.email&&campaignById[p.campaignId]?.approved===true&&campaignById[p.campaignId]?.autoSend===true);
    $('#canary-prospect-select').innerHTML=canaryCandidates.length?canaryCandidates.map(p=>`<option value="${esc(p.id)}">${esc(p.company)} · ${esc(p.contact.email)} · ${esc(p.status)}</option>`).join(''):'<option value="">Research an approved recipient first</option>';
    renderCanaryPreview();
    const healthBySlot=Object.fromEntries((outbound.senderHealth||[]).map(h=>[h.inbox,h]));
    $('#accounts').innerHTML=sum.accounts.length?sum.accounts.map(a=>{const h=healthBySlot[a.slot]||{};return `<div class="mini-card"><b>Email ${a.slot} · ${h.paused?'PAUSED':'healthy'}</b><small>${esc(a.email||'Disconnected')} · bounces ${h.hardBouncesToday||0} · complaints ${h.complaintsToday||0}</small></div>`}).join(''):'<div class="mini-card"><small>No Gmail accounts connected.</small></div>';
    $('#jobs').innerHTML=jobs.length?jobs.slice(0,8).map(j=>`<div class="mini-card"><b>${esc(j.status)} · ${esc(j.type||j.queue||'job')}</b><small>Attempt ${j.attempts||0}/${j.maxAttempts||1} · ${esc((j.runAt||j.startedAt||j.createdAt||'').replace('T',' ').slice(0,16))}</small>${j.lastError?`<p>${esc(j.lastError.slice(0,180))}</p>`:''}${j.status==='dead-letter'?`<button class="small retry-job" data-id="${esc(j.id)}">Retry job</button>`:''}</div>`).join(''):'<div class="mini-card"><small>No jobs yet.</small></div>';
    $('#discovery-runs').innerHTML=discoveryRuns.length?discoveryRuns.slice(0,8).map(r=>`<div class="mini-card"><b>${esc(r.status)} · ${r.dryRun?'preview':'import'} · ${r.importedCount||0} imported</b><small>${esc((r.startedAt||'').replace('T',' ').slice(0,16))} · ${r.discoveredCount||0} websites from ${r.rawCount||0} records</small><p>${r.error?esc(r.error):esc((r.preview||[]).slice(0,3).map(x=>x.company).join(' · ')||'No website-bearing records returned')}</p></div>`).join(''):'<div class="empty">No discovery runs yet.</div>';
    renderProspects();
    $('#leads').innerHTML=leads.length?leads.slice(0,12).map(l=>`<div class="mini-card"><b>${esc(l.company)}</b><small>${esc(l.status)} · ${esc(l.email)}</small><p>${esc(l.website)}</p></div>`).join(''):'<div class="empty">No inbound audit requests yet.</div>';
    const paid=orders.filter(o=>['order_created','subscription_created','transaction.completed'].includes(o.eventName)||o.status==='paid');
    $('#orders').innerHTML=(paid.length||subs.length)?`${paid.slice(0,6).map(o=>`<div class="mini-card"><b>${esc(o.product||o.eventName)}</b><small>${money((o.amountCents||0)/100)} · ${esc(o.status||'received')}</small></div>`).join('')}${subs.slice(0,6).map(s=>`<div class="mini-card"><b>Monitoring subscription</b><small>${esc(s.status)} · next ${esc((s.nextRunAt||'').slice(0,10))}</small></div>`).join('')}`:'<div class="empty">No paid orders yet.</div>';
    $('#notifications').innerHTML=notes.filter(n=>n.status!=='read').length?notes.filter(n=>n.status!=='read').slice(0,10).map(n=>`<div class="mini-card"><b>${esc(n.title)}</b><small>${esc(n.createdAt||'')}</small><button class="small mark-read" data-id="${esc(n.id)}">Mark read</button></div>`).join(''):'<div class="empty">Nothing needs attention.</div>';
    document.querySelectorAll('.mark-read').forEach(b=>b.onclick=async()=>{await api('/api/notifications/read',{method:'POST',body:JSON.stringify({id:b.dataset.id})});load();});
    document.querySelectorAll('.retry-job').forEach(b=>b.onclick=async()=>{await api(`/api/jobs/${b.dataset.id}/retry`,{method:'POST'});load();});
    document.querySelectorAll('.download-native-list').forEach(b=>b.onclick=async event=>{event.preventDefault();try{await download(`/api/leadgen/lists/${encodeURIComponent(b.dataset.id)}.csv`);}catch(error){alert(error.message);}});
    $('#replies').innerHTML=replies.length?replies.slice(0,12).map(r=>`<div class="mini-card"><b>${esc(r.classification?.label||'reply')} · ${esc(r.from)}</b><small>${esc(r.subject)}</small><p>${esc((r.body||'').slice(0,220))}</p></div>`).join(''):'<div class="empty">No matched replies.</div>';
    $('#social').innerHTML=social.length?social.slice(0,12).map(t=>`<div class="mini-card"><b>${esc(t.channel)} · ${esc(t.company||'prospect')}</b><small>${esc(t.draft)}</small></div>`).join(''):'<div class="empty">No social tasks yet.</div>';
  }catch(e){$('#mode').textContent=e.message;}
}
function renderProspects(){
  const filter=$('#status-filter').value;const rows=cache.prospects.filter(p=>!filter||p.status===filter);
  $('#prospects').innerHTML=rows.length?rows.map(p=>`<tr><td><b>${esc(p.company)}</b><small>${esc(p.website)}</small></td><td>${pill(p.status)}</td><td><b>${p.score?.total??'—'}</b>${p.score?.tier?`<small>Tier ${esc(p.score.tier)}</small>`:''}</td><td>${esc(p.issue?.title||p.error||'Waiting for research')}<small>${esc(p.issue?.service||'')}</small></td><td>${esc(p.contact?.email||p.customerEmail||'—')}<small>${esc(p.contact?.position||p.source||'')}</small></td><td><button class="small view" data-id="${esc(p.id)}">Open dossier</button>${p.status==='error'?`<button class="small retry" data-id="${esc(p.id)}">Retry</button>`:''}</td></tr>`).join(''):'<tr><td colspan="6" class="empty">No prospects match this view.</td></tr>';
  document.querySelectorAll('.view').forEach(b=>b.onclick=()=>openDossier(b.dataset.id));document.querySelectorAll('.retry').forEach(b=>b.onclick=async()=>{await api(`/api/prospects/${b.dataset.id}/retry`,{method:'POST'});load();});
}
function findingCard(x){return `<div class="finding"><div class="finding-head"><b>${esc(x.title)}</b><span>${x.severity}/5 · ${Math.round((x.confidence||0)*100)}%</span></div><p>${esc(x.implication)}</p><small><strong>Evidence:</strong> ${esc(x.evidenceExcerpt)}</small><div class="finding-foot"><a href="${esc(x.evidenceUrl)}" target="_blank" rel="noopener">Open source</a><span>${esc(x.service)}</span></div></div>`}
async function openDossier(id){
  const p=await api(`/api/prospects/${id}`);const d=p.dossier||{};const shots=(d.screenshots||[]).slice(0,6);
  $('#dossier').innerHTML=`<div class="dossier-hero"><div><div class="kicker">OPPORTUNITY DOSSIER</div><h2>${esc(p.company)}</h2><a href="${esc(p.website)}" target="_blank" rel="noopener">${esc(p.website)}</a></div><div class="score-orb"><b>${p.score?.total??'—'}</b><span>Tier ${esc(p.score?.tier||'—')}</span></div></div>
  <div class="dossier-grid"><section><h3>Primary opportunity</h3>${p.issue?findingCard(p.issue):'<div class="empty">No safe primary finding.</div>'}</section><section><h3>Score logic</h3><div class="score-list">${Object.entries(p.score?.breakdown||{}).map(([k,v])=>`<div><span>${esc(k.replace(/([A-Z])/g,' $1'))}</span><b>${v}</b></div>`).join('')}</div></section></div>
  <section><h3>Evidence gallery</h3><div class="gallery">${shots.map(s=>`<figure><a href="${esc(s.desktop)}" target="_blank"><img src="${esc(s.desktop)}" alt="Desktop screenshot of ${esc(p.company)}"></a><figcaption>${esc(s.url)}</figcaption><a href="${esc(s.mobile)}" target="_blank">Open mobile capture</a></figure>`).join('')||'<div class="empty">No screenshots yet.</div>'}</div></section>
  <section><h3>Supported observations</h3><div class="findings">${(p.audit||[]).map(findingCard).join('')||'<div class="empty">No findings.</div>'}</div></section>
  <div class="dossier-grid"><section><h3>Contact</h3><div class="contact-card"><b>${esc(p.contact?.email||p.customerEmail||'No selected email')}</b><small>${esc(p.contact?.position||p.contact?.source||p.source||'')}</small></div></section><section><h3>Risk flags</h3><ul>${(d.riskFlags||[]).map(x=>`<li>${esc(x)}</li>`).join('')||'<li>No major flags.</li>'}</ul></section></div>
  <section><h3>Prepared outreach</h3><div class="subject">${esc(p.subject||'No draft generated')}</div><pre>${esc(p.draft||'')}</pre><button id="copy-draft" class="gold">Copy draft</button></section>`;
  $('#modal').classList.add('open');$('#modal').setAttribute('aria-hidden','false');
  $('#copy-draft')?.addEventListener('click',async()=>{await navigator.clipboard.writeText(p.draft||'');$('#copy-draft').textContent='Copied';});
}
$('#close-modal').onclick=()=>{$('#modal').classList.remove('open');$('#modal').setAttribute('aria-hidden','true')};$('#modal').onclick=e=>{if(e.target===$('#modal'))$('#close-modal').click()};
$('#save-token').onclick=()=>{token=$('#token').value.trim();if(token)load();};
const campaignKey=async x=>{
  // Derive the retry identity from the request itself. This survives a browser
  // timeout or refresh without persisting the admin bearer or any form data.
  const material=JSON.stringify({name:x.name||'',niche:x.niche||'',offer:x.offer||'',offerId:x.offerId||'',allowedCountries:x.allowedCountries||'',minScore:x.minScore||'',dailyCaps:x.dailyCaps||'',maxFollowups:x.maxFollowups||'',autoSend:Boolean(x.autoSend),approved:Boolean(x.approved)});
  if(globalThis.crypto?.subtle){const bytes=new TextEncoder().encode(material);const digest=await crypto.subtle.digest('SHA-256',bytes);return `campaign-form-${Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('')}`;}
  let hash=2166136261;for(const char of material){hash^=char.charCodeAt(0);hash=Math.imul(hash,16777619);}return `campaign-form-${(hash>>>0).toString(16)}-${material.length}`;
};
const finalOfferPresets=Object.freeze({
  LEAD_TO_BOOKING_LEAK_AUDIT:{name:'White-Label Lead-to-Booking Leak Audit · founding lane',niche:'HVAC, plumbing, and electrical agencies serving local-service clients',offer:'White-Label Lead-to-Booking Leak Audit — $450 founding pilot'},
  AI_AGENT_RELEASE_GATE:{name:'AI Agent Release Gate · founding lane',niche:'AI implementation agencies, SaaS teams, and agent builders preparing releases',offer:'AI Agent Release Gate — $900 founding pilot'},
  CLIENT_ROI_PROOF_SPRINT:{name:'Client ROI Proof Sprint · founding lane',niche:'PPC, SEO, performance, growth, and lead-generation agencies',offer:'Client ROI Proof Sprint — $950 founding pilot'},
  BILINGUAL_BOOKING_LEAK_AUDIT:{name:'Arabic + English Booking Leak Audit · founding lane',niche:'UAE and KSA clinics, medspas, dental groups, and appointment businesses',offer:'Arabic + English Booking Leak Audit — $750 founding pilot'}
});
$('#campaign-offer-id').onchange=e=>{const preset=finalOfferPresets[e.currentTarget.value];if(!preset)return;for(const [field,value] of Object.entries(preset)){const input=e.currentTarget.form.elements.namedItem(field);if(input)input.value=value;}};
const splitField=value=>String(value||'').split(',').map(item=>item.trim()).filter(Boolean);
const nativeListKey=async x=>{
  const material=JSON.stringify(x);
  if(globalThis.crypto?.subtle){const bytes=new TextEncoder().encode(material);const digest=await crypto.subtle.digest('SHA-256',bytes);return `native-list-${Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('')}`;}
  let hash=2166136261;for(const char of material){hash^=char.charCodeAt(0);hash=Math.imul(hash,16777619);}return `native-list-${(hash>>>0).toString(16)}-${material.length}`;
};
$('#native-list-form').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.currentTarget);const profile={name:String(f.get('name')||''),query:{prompt:String(f.get('prompt')||''),industries:splitField(f.get('industries')),countries:splitField(f.get('countries')),cities:splitField(f.get('cities')),roles:splitField(f.get('roles')),minScore:Number(f.get('minScore')||55),requireEvidence:f.has('requireEvidence'),requireContact:f.has('requireContact'),skipOwned:true,limit:Number(f.get('limit')||50)}};const x={name:profile.name,profile,limit:profile.query.limit};try{const key=await nativeListKey(x);const result=await api('/api/leadgen/lists',{method:'POST',headers:{'Idempotency-Key':key},body:JSON.stringify({...x,idempotencyKey:key})});$('#native-list-status').textContent=`${result.idempotentReplay?'Replayed':'Compiled'} ${result.name} · ${result.stats?.selected||0} selected · ${result.stats?.eligible||0} owner-plan ready · no send.`;load();}catch(error){$('#native-list-status').textContent=error.message;}};
$('#capacity-plan-form').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.currentTarget);const input={monthlyMessages:Number(f.get('monthlyMessages')||100000),activeDaysPerMonth:Number(f.get('activeDaysPerMonth')||30),averagePriceUsd:Number(f.get('averagePriceUsd')||450),targetReplyRate:Number(f.get('targetReplyRate')||0.02),targetCloseRate:Number(f.get('targetCloseRate')||0.05),senderCells:[]};try{const plan=await api('/api/leadgen/capacity-plan',{method:'POST',body:JSON.stringify(input)});$('#capacity-status').textContent=`${plan.state} · ${plan.requiredDailyMessages} messages/day · ${plan.providerCalls||0} provider calls.`;$('#capacity-plan').textContent=JSON.stringify({requiredDailyMessages:plan.requiredDailyMessages,suppliedDailyCapacity:plan.suppliedDailyCapacity,capacityGap:plan.capacityGap,projectedReplies:plan.projectedReplies,projectedWins:plan.projectedWins,projectedGrossRevenueUsd:plan.projectedGrossRevenueUsd,blockers:plan.blockers},null,2);}catch(error){$('#capacity-status').textContent=error.message;}};
$('#provider-preflight-form').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.currentTarget);const input={fields:splitField(f.get('fields')),providers:splitField(f.get('providers')),volume:Number(f.get('volume')||25),maxProviderCalls:Number(f.get('maxProviderCalls')||0)};try{const plan=await api('/api/leadgen/provider-preflight',{method:'POST',body:JSON.stringify(input)});$('#provider-preflight-status').textContent=`${plan.safeToRun?'Plan is runnable':'Plan blocked'} · ${plan.estimate?.worstCaseAttempts||0} worst-case attempts · no provider calls.`;$('#provider-preflight-report').textContent=JSON.stringify({safeToRun:plan.safeToRun,blockingReasons:plan.blockingReasons,routes:plan.routes,estimate:plan.estimate},null,2);}catch(error){$('#provider-preflight-status').textContent=error.message;}};
$('#native-ops-run').onclick=async()=>{const button=$('#native-ops-run');button.disabled=true;$('#native-ops-status').textContent='Refreshing local coverage, buying-group, and lookalike maps…';try{const tower=await api('/api/leadgen/control-tower');const seed=cache.prospects.find(row=>['ready','research-complete'].includes(row.status))||cache.prospects[0];const lookalike=seed?await api('/api/leadgen/lookalike',{method:'POST',body:JSON.stringify({seedIds:[seed.id],limit:10})}):null;renderNativeOps(tower,lookalike);$('#native-ops-status').textContent=`Refreshed ${tower.coverage?.totals?.records||0} records · ${lookalike?.results?.length||0} local lookalike candidates · no calls or sends.`;}catch(error){$('#native-ops-status').textContent=error.message;}finally{button.disabled=false;}};
$('#campaign-form').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.currentTarget);const x=Object.fromEntries(f);x.approved=f.has('approved');x.autoSend=f.has('autoSend');try{const c=await api('/api/campaigns',{method:'POST',headers:{'Idempotency-Key':await campaignKey(x)},body:JSON.stringify(x)});alert(`${c.idempotentReplay?'Campaign already existed':'Campaign created'}: ${c.name}`);load();}catch(e){alert(e.message)}};
$('#owner-identity-form').onsubmit=async e=>{e.preventDefault();const x=Object.fromEntries(new FormData(e.currentTarget));try{const result=await api('/api/owner/business-identity',{method:'POST',body:JSON.stringify(x)});$('#identity-status').textContent=`Saved ${result.identity.legalName} · no provider call made.`;load();}catch(error){$('#identity-status').textContent=error.message;}};
$('#recipient-form').onsubmit=async e=>{e.preventDefault();const form=e.currentTarget;const x=Object.fromEntries(new FormData(form));try{x.observedAt=new Date(x.observedAt).toISOString();const result=await api('/api/owner/recipient',{method:'POST',body:JSON.stringify(x)});$('#recipient-status').textContent=`${result.idempotentReplay?'Already recorded':'Recorded'} ${result.prospect.company} · queued for local research only.`;form.reset();form.elements.namedItem('country').value='United Kingdom';form.elements.namedItem('niche').value='HVAC, plumbing, or electrical';form.elements.namedItem('authorizationBasis').value='requested_information';form.elements.namedItem('jurisdiction').value='GB';load();}catch(error){$('#recipient-status').textContent=error.message;}};
$('#canary-prospect-select').onchange=renderCanaryPreview;
$('#canary-approval-form').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.currentTarget);const prospectId=String(f.get('prospectId')||'');const sourceObservedAt=new Date(String(f.get('sourceObservedAt')||'')).toISOString();const routeEvidence={routeType:String(f.get('routeType')||''),sourceUrl:String(f.get('sourceUrl')||''),sourceExcerpt:String(f.get('sourceExcerpt')||''),sourceObservedAt,jurisdiction:String(f.get('jurisdiction')||''),permissionScope:'COMMERCIAL_OUTREACH',relevantToRecipientRole:f.has('relevantToRecipientRole'),noUnsolicitedStatementPresent:f.has('noUnsolicitedStatementPresent'),evidenceNote:String(f.get('evidenceNote')||'')};const key=approvalKey({prospectId,routeEvidence});try{const result=await api('/api/outbound/approve-prospect',{method:'POST',headers:{'Idempotency-Key':key},body:JSON.stringify({prospectId,routeEvidence,idempotencyKey:key})});$('#approval-status').textContent=`${result.idempotentReplay?'Replayed':'Approved'} exact canary ${result.approvalId} · provider calls: ${result.providerCalls||0}.`;load();}catch(error){$('#approval-status').textContent=error.message;}};
$('#csv-file').onchange=e=>$('#file-name').textContent=e.target.files[0]?.name||'No file selected';
$('#import-csv').onclick=async()=>{const file=$('#csv-file').files[0];if(!file)return alert('Choose a CSV file first.');const campaignId=$('#campaign-select').value;if(!campaignId)return alert('Create a campaign first.');try{const r=await api(`/api/prospects/import-csv?campaignId=${encodeURIComponent(campaignId)}`,{method:'POST',body:await file.text(),headers:{'content-type':'text/csv'}});alert(`Imported ${r.added}. Skipped ${r.skipped}.`);load();}catch(e){alert(e.message)}};
$('#import-json-btn').onclick=async()=>{try{const prospects=JSON.parse($('#import-json').value).map(x=>({...x,campaignId:$('#campaign-select').value}));const r=await api('/api/prospects/import',{method:'POST',body:JSON.stringify({prospects})});alert(`Imported ${r.added}. Skipped ${r.skipped}.`);load();}catch(e){alert(e.message)}};
$('#discovery-form').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.currentTarget);const payload={campaignId:$('#discovery-campaign-select').value,bbox:String(f.get('bbox')||'').trim(),categories:String(f.get('categories')||'').split(',').map(x=>x.trim()).filter(Boolean),country:String(f.get('country')||'').trim(),city:String(f.get('city')||'').trim(),limit:Number(f.get('limit')||20),dryRun:f.has('dryRun')};if(!payload.campaignId)return alert('Create and select an approved campaign first.');if(!payload.bbox)return alert('Paste a city-sized bounding box first.');try{const r=await api('/api/discovery/run',{method:'POST',body:JSON.stringify(payload)});alert(`Discovery queued as ${r.jobId}. The worker will run it safely in the background.`);load();}catch(e){alert(e.message)}};
$('#run').onclick=async()=>{try{await api('/api/run',{method:'POST',body:JSON.stringify({limit:25})});alert('Research batch queued. The worker will process it in the background.');setTimeout(load,1200);}catch(e){alert(e.message)}};
$('#pause').onclick=async()=>{await api('/api/worker/pause',{method:'POST'});load()};$('#resume').onclick=async()=>{await api('/api/worker/resume',{method:'POST'});load()};
$('#pause-outbound').onclick=async()=>{await api('/api/outbound/pause',{method:'POST',body:JSON.stringify({reason:'Emergency stop from command center'})});load()};
$('#resume-outbound').onclick=async()=>{if(confirm('Resume unattended outbound sending?')){await api('/api/outbound/resume',{method:'POST'});load()}};
$('#refresh').onclick=()=>{if(token)load()};$('#status-filter').onchange=renderProspects;$('#export-csv').onclick=async e=>{e.preventDefault();try{await download('/api/export.csv')}catch(error){alert(error.message)}};$('#export-json').onclick=async e=>{e.preventDefault();try{await download('/api/export.json')}catch(error){alert(error.message)}};
$('#gmail-a').onclick=async e=>{e.preventDefault();try{await startGoogle('A')}catch(error){alert(error.message)}};$('#gmail-b').onclick=async e=>{e.preventDefault();try{await startGoogle('B')}catch(error){alert(error.message)}};
setIfBlank($('#recipient-form'),'observedAt',localDateTime());setIfBlank($('#canary-approval-form'),'sourceObservedAt',localDateTime());
setInterval(()=>{if(token)load()},12000);
