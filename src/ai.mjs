import { safeJson } from './utils.mjs';

function extractJson(text) {
  const direct = safeJson(text);
  if (direct) return direct;
  const match = String(text).match(/\{[\s\S]*\}/);
  return match ? safeJson(match[0]) : null;
}
function promptFor(prospect, crawl, rules) {
  return `You are a restrained B2B website auditor. Return JSON only. Never invent facts, traffic, revenue, conversion impact, credentials or people. Use only evidence in the supplied pages.\n\nPROSPECT:\n${JSON.stringify(prospect)}\n\nRULE ISSUES:\n${JSON.stringify(rules)}\n\nPUBLIC PAGE EXTRACTS:\n${crawl.combinedText.slice(0,70000)}\n\nReturn: {"issues":[{"title":"","severity":1-5,"confidence":0-1,"evidenceUrl":"","evidenceExcerpt":"","implication":"","service":""}],"companySummary":"","recommendedOffer":"","language":"en"}. Reject weak observations. Maximum 5 issues.`;
}
async function anthropic(cfg, input) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {method:'POST',headers:{'content-type':'application/json','x-api-key':cfg.anthropicKey,'anthropic-version':'2023-06-01'},body:JSON.stringify({model:cfg.anthropicModel,max_tokens:1800,messages:[{role:'user',content:input}]})});
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.content?.filter(x=>x.type==='text').map(x=>x.text).join('\n') || '';
}
async function openai(cfg, input) {
  const res = await fetch('https://api.openai.com/v1/responses', {method:'POST',headers:{'content-type':'application/json','authorization':`Bearer ${cfg.openaiKey}`},body:JSON.stringify({model:cfg.openaiModel,input,temperature:.2})});
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.output_text || data.output?.flatMap(x=>x.content||[]).filter(x=>x.type==='output_text').map(x=>x.text).join('\n') || '';
}
export async function enhanceAudit(cfg, prospect, crawl, ruleIssues) {
  if (cfg.provider === 'rules') return null;
  const input = promptFor(prospect, crawl, ruleIssues);
  const text = cfg.provider === 'anthropic' ? await anthropic(cfg, input) : await openai(cfg, input);
  const parsed = extractJson(text);
  if (!parsed || !Array.isArray(parsed.issues)) throw new Error('AI returned invalid audit JSON');
  return parsed;
}
export async function classifyReply(cfg, text) {
  const lower = String(text).toLowerCase();
  if (/unsubscribe|remove me|stop emailing|do not contact|don't contact|no thanks|not interested/.test(lower)) return {label:'optout',confidence:.95,reason:'Explicit rejection or opt-out phrase'};
  if (/yes|interested|send it|tell me more|book|call|meeting|price|proposal/.test(lower)) return {label:'positive',confidence:.72,reason:'Positive-intent phrase'};
  if (cfg.provider === 'rules') return {label:'neutral',confidence:.45,reason:'No decisive rule match'};
  const prompt = `Classify this reply to a B2B outreach email. Return JSON only: {"label":"positive|neutral|negative|optout|automatic","confidence":0-1,"reason":""}.\n\n${String(text).slice(0,10000)}`;
  const raw = cfg.provider === 'anthropic' ? await anthropic(cfg,prompt) : await openai(cfg,prompt);
  return extractJson(raw) || {label:'neutral',confidence:.3,reason:'Invalid AI result'};
}
