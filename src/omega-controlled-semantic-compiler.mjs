export const OMEGA_CONTROLLED_SEMANTIC_COMPILER_VERSION='uberbond.omega-controlled-semantic-compiler.v1';
const clean=s=>String(s||'').trim();
const list=s=>s.split(',').map(x=>x.trim()).filter(Boolean);
function refuse(reason){return{ok:false,status:'OMEGA_SEMANTIC_COMPILE_REFUSED',version:OMEGA_CONTROLLED_SEMANTIC_COMPILER_VERSION,reasonCodes:[reason]};}
function parseGiven(text){const m=text.match(/^given\s+([A-Za-z][\w-]*)\s*=\s*([A-Za-z0-9.-]+)$/i);return m?{variable:m[1],value:/^-?\d+(?:\.\d+)?$/.test(m[2])?Number(m[2]):m[2]}:null;}
export function compileControlledIntent({text,domain='CONTROLLED_INTENT'}={}){
  const raw=clean(text); if(!raw)return refuse('text-required');
  const parts=raw.split(';').map(clean).filter(Boolean); if(parts.length<2)return refuse('structured-clauses-required');
  const head=parts[0]; let family,variables,values;
  let m=head.match(/^assign\s+(.+?)\s+to\s+(.+)$/i);
  if(m){family='CONFLICT';values=list(m[1]);variables=list(m[2]);}
  if(!family&&(m=head.match(/^schedule\s+(.+?)\s+in\s+(-?\d+)\.\.(-?\d+)$/i))){family='PRECEDENCE';variables=list(m[1]);const a=Number(m[2]),b=Number(m[3]);if(a>b)return refuse('invalid-range');values=Array.from({length:b-a+1},(_,i)=>a+i);}
  if(!family&&(m=head.match(/^allocate\s+(.+?)\s+in\s+(-?\d+)\.\.(-?\d+)$/i))){family='CONSERVATION';variables=list(m[1]);const a=Number(m[2]),b=Number(m[3]);if(a>b)return refuse('invalid-range');values=Array.from({length:b-a+1},(_,i)=>a+i);}
  if(!family||variables.length<2||values.length<2)return refuse('unsupported-or-invalid-head');
  const varSet=new Set(variables);if(varSet.size!==variables.length)return refuse('duplicate-variable');
  const constraints=[],givens={};
  for(const clause of parts.slice(1)){
    const g=parseGiven(clause);if(g){if(!varSet.has(g.variable)||!values.some(v=>Object.is(v,g.value)))return refuse('invalid-given');givens[g.variable]=g.value;continue;}
    let x=clause.match(/^([A-Za-z][\w-]*)\s*(?:!=|different from)\s*([A-Za-z][\w-]*)$/i);
    if(x){if(!varSet.has(x[1])||!varSet.has(x[2]))return refuse('unknown-variable');constraints.push({type:'neq',vars:[x[1],x[2]]});continue;}
    x=clause.match(/^([A-Za-z][\w-]*)\s+before\s+([A-Za-z][\w-]*)$/i);
    if(x){if(family!=='PRECEDENCE')return refuse('before-only-valid-for-schedule');if(!varSet.has(x[1])||!varSet.has(x[2]))return refuse('unknown-variable');constraints.push({type:'lt',vars:[x[1],x[2]]});continue;}
    x=clause.match(/^sum\(([^)]+)\)\s*=\s*(-?\d+(?:\.\d+)?)$/i);
    if(x){if(family!=='CONSERVATION')return refuse('sum-only-valid-for-allocation');const vars=list(x[1]);if(vars.some(v=>!varSet.has(v)))return refuse('unknown-variable');constraints.push({type:'sumEq',vars,target:Number(x[2])});continue;}
    return refuse('unsupported-clause');
  }
  if(!constraints.length)return refuse('at-least-one-constraint-required');
  return{ok:true,status:'OMEGA_CONTROLLED_INTENT_COMPILED',version:OMEGA_CONTROLLED_SEMANTIC_COMPILER_VERSION,problem:{id:`intent-${family.toLowerCase()}`,domain,family,variables,values,constraints,givens},truthBoundary:'This compiler supports a deliberately narrow controlled language and refuses unsupported phrasing. It is evidence of bounded semantic compilation, not general natural-language understanding.'};
}
