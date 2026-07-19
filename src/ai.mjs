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
  const res = await fetch('https://api.anthropic.com/v1/messages', {method:'POST',headers:{'content-type':'application/json','x-api-key':cfg.anthropicKey,'anthropic-version':'2023-06-01'},body:JSON.stringify({model:cfg.anthropicModel,max_tokens:1800,messages:[{role:'user',content:input}]}),signal:AbortSignal.timeout(20000)});
  if (!res.ok) throw new Error(`Anthropic request failed with HTTP ${res.status}`);
  const data = await res.json();
  return data.content?.filter(x=>x.type==='text').map(x=>x.text).join('\n') || '';
}
async function openai(cfg, input) {
  const res = await fetch('https://api.openai.com/v1/responses', {method:'POST',headers:{'content-type':'application/json','authorization':`Bearer ${cfg.openaiKey}`},body:JSON.stringify({model:cfg.openaiModel,input,temperature:.2}),signal:AbortSignal.timeout(20000)});
  if (!res.ok) throw new Error(`OpenAI request failed with HTTP ${res.status}`);
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
export async function enhanceOutreach(cfg, evidenceContext) {
  if (cfg.provider === 'rules') return null;
  const prompt = `You are a constrained B2B outreach editor. Return JSON only. You may reorder or tighten the supplied facts, but every factual phrase must remain exact and every sentence must list the binding IDs it uses. Never add people, claims, numbers, results, compliments, urgency, or medical claims. State that the review was software-assisted. Do not claim a manual review. Return at most 3 variants.\n\nEVIDENCE CONTEXT:\n${JSON.stringify(evidenceContext)}\n\nReturn: {"variants":[{"id":"","subject":"","sentences":[{"type":"disclosure|evidence|implication|offer|cta","text":"","bindingIds":[""]}]}]}. The deterministic system will add the greeting, opt-out, and signature and will reject any variant whose exact facts or bindings do not validate.`;
  const raw = cfg.provider === 'anthropic' ? await anthropic(cfg, prompt) : await openai(cfg, prompt);
  const parsed = extractJson(raw);
  if (!parsed || !Array.isArray(parsed.variants)) throw new Error('AI returned invalid outreach JSON');
  return { variants: parsed.variants.slice(0, 3) };
}
export async function classifyReply(cfg, text) {
  if (!cfg || cfg.provider === 'rules') return { label: 'unknown-needs-review', confidence: 0.3, reasonCode: 'ai-disabled' };
  const prompt = `Classify the visible new text of this B2B outreach reply. Return JSON only. Use exactly one label from: interested, meeting-requested, asks-for-information, price-objection, already-has-provider, not-now, not-interested, unsubscribe, automatic-reply, bounce, complaint, unknown-needs-review. Do not infer intent from quoted message history. Return: {"label":"","confidence":0-1}.\n\n${String(text).slice(0,10000)}`;
  const raw = cfg.provider === 'anthropic' ? await anthropic(cfg,prompt) : await openai(cfg,prompt);
  return extractJson(raw) || { label: 'unknown-needs-review', confidence: 0.3, reasonCode: 'invalid-ai-result' };
}
