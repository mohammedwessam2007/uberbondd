import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {COGNITION_ROUTES} from '../src/cognition-route-inventory.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const needles=['api.openai.com/v1/','api.anthropic.com/v1/','openrouter.ai/api/v1/chat/completions','ai-gateway.vercel.sh/v1/chat/completions','createOpenAIAgentExecutor','createAnthropicAgentExecutor','createOpenRouterAgentExecutor','createVercelAIGatewayExecutor','createOpenModelRuntimeExecutor'];
const ignoredRoots=new Set(['tests','docs','node_modules','.git','open router','artifacts']);const files=[];
function walk(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){if(e.isDirectory()&&ignoredRoots.has(e.name))continue;const p=path.join(d,e.name);if(e.isDirectory())walk(p);else if(/\.mjs$/.test(e.name))files.push(p);}}walk(root);
const known=new Set(COGNITION_ROUTES.map(r=>r.source));const discovered=[];
for(const p of files){const rel=path.relative(root,p).replaceAll('\\','/');if(rel==='src/cognition-route-inventory.mjs'||rel==='scripts/cognition-route-inventory-doctor.mjs')continue;const s=fs.readFileSync(p,'utf8');if(needles.some(n=>s.includes(n)))discovered.push(rel);}
const infrastructureAllow=new Set(['src/agent-model-executor-factory.mjs','src/infinite-opus-native-runtime.mjs']);
const unclassified=discovered.filter(p=>!known.has(p)&&!infrastructureAllow.has(p));
const missingInventory=[...known].filter(p=>!fs.existsSync(path.join(root,p)));
const report={ok:unclassified.length===0&&missingInventory.length===0,status:unclassified.length?'UNGOVERNED_AI_ROUTE_CANDIDATES_FOUND':missingInventory.length?'INVENTORY_SOURCE_MISSING':'ALL_DISCOVERED_INFERENCE_ROUTES_CLASSIFIED',discovered,unclassified,missingInventory,inventory:COGNITION_ROUTES};
console.log(JSON.stringify(report,null,2));if(!report.ok)process.exitCode=1;
