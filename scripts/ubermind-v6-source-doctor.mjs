#!/usr/bin/env node
/** Verify source custody, not cognitive quality or downstream ChatGPT activation. */
import {readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
const root=process.cwd();
const read=p=>readFileSync(join(root,p));
const hash=x=>createHash('sha256').update(x).digest('hex');
const registry=JSON.parse(read('config/ubermind-v6-52-operation-registry.json'));
const manifest=JSON.parse(read('library/ubermind/FOUNDER_DIRECTIVE_52_COVERAGE_MANIFEST.json'));
const source=read('library/ubermind/FOUNDER_DIRECTIVE_OMEGA47_TO_OMEGA52_ORIGINAL_2026-10-24.md');
const canon='artifacts/research/founder-moonshot-literal-corpus/';
const transcript=read(canon+'RAW_SOURCE_Branch_Branch_New_chat.txt');
const files=readdirSync(join(root,canon)).filter(x=>/^founder-moonshots-\d{3}-\d{3}\.json$/.test(x)).sort();
function verify(test,why){if(!test)throw new Error('SOURCE_DRIFT:'+why)}
verify(files.length===10,'ten canon shards');
verify(hash(transcript)==='8a7be38681fd0bf15ebccecec099f25c86e4ea567f3b6e0892b6c73b2a319109','raw 890 transcript SHA');
const founders=files.flatMap(file=>JSON.parse(read(canon+file)).entries);
verify(founders.length===890 && founders.every((e,i)=>e.ordinal===i+1 && e.literalTitle && e.literalBodyMarkdown),'890 contiguous original bodies');
verify(hash(source)===manifest.sourceSha256,'original 52 source SHA');
verify(registry.cards?.length===52 && manifest.atoms?.length===52,'52 distinct concepts');
const totals={};const seen=new Set();const body=source.toString('utf8').toLowerCase();
for(let i=0;i<52;i++){
 const a=registry.cards[i],m=manifest.atoms[i],id=a.omega+'/'+a.id;
 verify(a.id===m.id&&a.omega===m.omega,'crosswalk #'+(i+1));
 verify(!seen.has(id),'duplicate '+id);seen.add(id);
 verify(body.includes(m.founderOriginalHeading.toLowerCase()),'original heading '+id);
 verify(a.operation?.length>20&&a.falsifier?.length>20,'method/falsifier '+id);
 totals[a.omega]=(totals[a.omega]||0)+1;
}
verify(JSON.stringify(totals)===JSON.stringify({'Ω47':16,'Ω49':10,'Ω50':6,'Ω51':8,'Ω52':12}),'distribution');
const startup=read('AI_START_HERE.md').toString('utf8');const claude=read('CLAUDE.md').toString('utf8');
verify(startup.includes('UBERMIND_V6_CROSS_CHAT_RECOVERY_AND_AUDIT_2026-10-24.md'),'startup freshness pointer');
verify(claude.includes('ubermind-v6-52-operation-registry.json'),'Claude original index');
console.log(JSON.stringify({ok:true,sourceRead:true,founderBodies:founders.length,concepts:seen.size,distribution:totals,originalFounderTranscriptSha256:hash(transcript),original52Sha256:hash(source),projectChatAttachmentVerified:false,modelBehaviorVerified:false},null,2));