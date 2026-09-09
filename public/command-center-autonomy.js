const CACHE_KEY='uberbond.command-center.last-good.v1';
const REPO_URL='https://github.com/mohammedwessam2007/uberbondd';
const WAKE_URL=`${REPO_URL}/actions/workflows/uberbond-autonomy-wake.yml`;
const REVIEWS_URL=`${REPO_URL}/pulls?q=is%3Apr+is%3Aopen+head%3Auberbond%2Fself-maintain%2F`;
const $=id=>document.getElementById(id);
let lastFingerprint='';

function text(id,value){const el=$(id);if(el)el.textContent=value==null||value===''?'—':String(value).replaceAll('_',' ')}
function readSanitizedAutonomy(){
  try{
    const wrapper=JSON.parse(localStorage.getItem(CACHE_KEY)||'null');
    if(!wrapper||wrapper.schemaVersion!==CACHE_KEY||!wrapper.payload||typeof wrapper.payload!=='object')return null;
    const autonomy=wrapper.payload.autonomy;
    if(!autonomy||typeof autonomy!=='object'||Array.isArray(autonomy))return null;
    return autonomy;
  }catch{return null}
}
function element(tag,attrs={},label=''){
  const node=document.createElement(tag);
  for(const [key,value] of Object.entries(attrs)){
    if(key==='className')node.className=value;
    else node.setAttribute(key,value);
  }
  if(label)node.textContent=label;
  return node;
}
function ensureMetric(card,label,id){
  if($(id))return;
  const row=element('div',{className:'metric'});
  row.append(element('span',{},label),element('b',{id},'—'));
  card.append(row);
}
function ensureCockpit(){
  const card=$('autonomyCard');
  if(!card||$('autonomyQuestion'))return;
  ensureMetric(card,'Open finite','finiteOpenCount');
  ensureMetric(card,'Next target','finiteNextTarget');

  const cockpit=element('div',{className:'autonomy-cockpit'});
  const label=element('label',{for:'autonomyQuestion'},'ASK UBERBOND');
  const input=element('input',{id:'autonomyQuestion',type:'text',autocomplete:'off',placeholder:"What's left? Why are you blocked?"});
  const ask=element('button',{id:'autonomyAsk',type:'button',className:'mini'},'ASK');
  const answer=element('div',{id:'autonomyAnswer',className:'alerts','aria-live':'polite'},'Evidence-bound answers only.');
  const actions=element('div',{className:'authrow'});
  const wake=element('a',{id:'autonomyWake',href:WAKE_URL,target:'_blank',rel:'noopener noreferrer',className:'mini'},'WAKE / RESUME');
  const reviews=element('a',{id:'autonomyReviews',href:REVIEWS_URL,target:'_blank',rel:'noopener noreferrer',className:'mini'},'REVIEW QUEUE');
  actions.append(wake,reviews);
  cockpit.append(label,input,ask,answer,actions);
  card.append(cockpit);
  ask.addEventListener('click',answerQuestion);
  input.addEventListener('keydown',event=>{if(event.key==='Enter')answerQuestion()});
}
function concise(value){return String(value||'').replaceAll('_',' ').trim()}
function answerQuestion(){
  const autonomy=readSanitizedAutonomy();
  const input=$('autonomyQuestion');
  const answer=$('autonomyAnswer');
  if(!answer)return;
  if(!autonomy){answer.textContent='No current autonomy receipt is available. Connect and refresh the Command Center first.';return;}
  const query=String(input?.value||'').trim().toLowerCase();
  const boot=autonomy.bootstrapAutonomy||{};
  const terminal=autonomy.terminal||{};
  const open=Array.isArray(terminal.finiteOpenRequirements)?terminal.finiteOpenRequirements:[];
  const target=open[0]||null;
  const reasons=Array.isArray(terminal.reasonCodes)?terminal.reasonCodes:[];
  if(/\b(done|finished|complete|closed)\b/.test(query)){
    answer.textContent=autonomy.status==='FINITE_ENGINEERING_CLOSED__REALITY_PROOF_REMAINS'
      ? `Finite engineering is closed. Reality gates remain separate: runtime ${concise(terminal.namedRuntimeStatus)}, autonomy ${concise(terminal.observedAutonomyStatus)}, commercial ${concise(terminal.externalCommercialStatus)}, ASI ${concise(terminal.asiEvidenceStatus)}.`
      : `Not closed yet. Finite status: ${concise(boot.finiteEngineeringClosure||'NOT_MEASURED')}. Open finite requirements: ${boot.finiteOpenRequirementCount??open.length}.`;
    return;
  }
  if(/\b(why|block|stuck|problem)\b/.test(query)){
    answer.textContent=reasons.length?`Current tribunal blockers: ${reasons.slice(0,6).map(concise).join('; ')}.`:'No explicit terminal reason code is currently available. The loop will regenerate exact-current truth before inventing work.';
    return;
  }
  if(/\b(left|remain|next|todo|finish)\b/.test(query)){
    const count=boot.finiteOpenRequirementCount??open.length;
    answer.textContent=count>0?`${count} finite requirement${count===1?'':'s'} remain. Next target: ${target||'exact-current terminal proof'}.`:`No finite-open requirement is currently listed. Next step is ${concise(autonomy.status)}.`;
    return;
  }
  answer.textContent=`Loop: ${concise(autonomy.status)}. Maintainer: ${concise(boot.maintainerStatus)}. Continuation: ${concise(boot.continuationStatus)}. Finite closure: ${concise(boot.finiteEngineeringClosure)}. Next target: ${target||'exact-current terminal proof'}.`;
}
function render(){
  ensureCockpit();
  const autonomy=readSanitizedAutonomy();
  const fingerprint=autonomy?JSON.stringify(autonomy):'';
  if(fingerprint===lastFingerprint)return;
  lastFingerprint=fingerprint;
  if(!autonomy){
    text('autonomyState','UNAVAILABLE');
    text('maintainerState','UNAVAILABLE');
    text('continuationState','UNAVAILABLE');
    text('finiteClosure','NOT MEASURED');
    text('finiteOpenCount','—');
    text('finiteNextTarget','—');
    text('mergePolicy','UNAVAILABLE');
    text('selfCompletionClaim','No bounded autonomy receipt is available yet.');
    return;
  }
  const boot=autonomy.bootstrapAutonomy||{};
  const terminal=autonomy.terminal||{};
  const open=Array.isArray(terminal.finiteOpenRequirements)?terminal.finiteOpenRequirements:[];
  text('autonomyState',autonomy.status||boot.state);
  text('maintainerState',boot.maintainerStatus);
  text('continuationState',boot.continuationStatus);
  text('finiteClosure',boot.finiteEngineeringClosure);
  text('finiteOpenCount',boot.finiteOpenRequirementCount??open.length);
  text('finiteNextTarget',open[0]||'terminal truth');
  text('mergePolicy',boot.mergePolicy);
  text('selfCompletionClaim',boot.selfCompletionClaim||'NOT_ESTABLISHED_UNTIL_REPEATED_OBSERVED_CYCLES');
  const answer=$('autonomyAnswer');
  if(answer&&!$('autonomyQuestion')?.value)answer.textContent=`Loop ${concise(autonomy.status)} · ${boot.finiteOpenRequirementCount??open.length} finite open.`;
}
ensureCockpit();
render();
setInterval(render,1000);