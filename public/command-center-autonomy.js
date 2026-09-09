const CACHE_KEY='uberbond.command-center.last-good.v1';
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
function render(){
  const autonomy=readSanitizedAutonomy();
  const fingerprint=autonomy?JSON.stringify(autonomy):'';
  if(fingerprint===lastFingerprint)return;
  lastFingerprint=fingerprint;
  if(!autonomy){
    text('autonomyState','UNAVAILABLE');
    text('maintainerState','UNAVAILABLE');
    text('continuationState','UNAVAILABLE');
    text('finiteClosure','NOT MEASURED');
    text('mergePolicy','UNAVAILABLE');
    text('selfCompletionClaim','No bounded autonomy receipt is available yet.');
    return;
  }
  const boot=autonomy.bootstrapAutonomy||{};
  text('autonomyState',autonomy.status||boot.state);
  text('maintainerState',boot.maintainerStatus);
  text('continuationState',boot.continuationStatus);
  text('finiteClosure',boot.finiteEngineeringClosure);
  text('mergePolicy',boot.mergePolicy);
  text('selfCompletionClaim',boot.selfCompletionClaim||'NOT_ESTABLISHED_UNTIL_REPEATED_OBSERVED_CYCLES');
}
render();
setInterval(render,1000);
