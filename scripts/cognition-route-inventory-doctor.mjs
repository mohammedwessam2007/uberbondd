import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {COGNITION_ROUTES} from '../src/cognition-route-inventory.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),src=path.join(root,'src');
const needles=['api.openai.com/','api.anthropic.com/','openrouter.ai/api/','ai-gateway.vercel.sh/','createOpenAIAgentExecutor','createAnthropicAgentExecutor','createOpenRouterAgentExecutor','createVercelAIGatewayExecutor','createOpenModelRuntimeExecutor'];
const skip=new Set(['cognition-route-inventory.mjs']);
const files=[];function walk(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);if(e.isDirectory())walk(p);else if(/\.mjs$/.test(e.name)&&!skip.has(e.name))files.push(p);}}walk(src);
const known=new Set(COGNITION_ROUTES.map(r=>r.source));const hits=[];for(const p of files){const rel=path.relative(root,p).replaceAll('\\','/'),s=fs.readFileSync(p,'utf8');if(needles.some(n=>s.includes(n)))hits.push(rel);}
const unclassified=hits.filter(p=>!known.has(p)&&!p.endsWith('agent-model-executor-factory.mjs')&&!p.endsWith('infinite-opus-native-runtime.mjs'));
const report={ok:unclassified.length===0,status:unclassified.length?'UNGOVERNED_AI_ROUTE_CANDIDATES_FOUND':'ALL_DISCOVERED_PAID_INFERENCE_ROUTES_CLASSIFIED',hits,unclassified,inventoryCount:COGNITION_ROUTES.length};console.log(JSON.stringify(report,null,2));if(!report.ok)process.exitCode=1;
