import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const cfg=JSON.parse(fs.readFileSync(new URL('../config/typingmind-opus-quality-mincost-v3.json',import.meta.url),'utf8'));

test('TypingMind v3 optimizes Opus-quality first and cost second',()=>{
  assert.equal(cfg.schemaVersion,'uberbond.typingmind.opus-quality-mincost.v3');
  assert.match(cfg.objective,/CLAUDE_OPUS_5_5_FINAL_WORK_QUALITY/);
  assert.equal(cfg.modelRoles.crown.model,'anthropic/claude-opus-5.5');
  assert.equal(cfg.modelRoles.crown.authority,'FINAL_SEMANTIC_GATE');
});

test('Sol Pro is exception-only and never the normal builder',()=>{
  assert.equal(cfg.modelRoles.builder.model,'openai/gpt-6.1-sol');
  assert.equal(cfg.modelRoles.hard.model,'openai/gpt-6.1-sol-pro');
  assert.equal(cfg.modelRoles.hard.routing,'escalation_only');
  assert.ok(!cfg.nativeTypingMindFlows.LEAN_CROWN.chain.includes('UberDeep'));
  assert.ok(cfg.nativeTypingMindFlows.HARD_CROWN.chain.includes('UberDeep'));
});

test('native flows include direct Opus bypass so orchestration cannot become mandatory tax',()=>{
  assert.deepEqual(cfg.nativeTypingMindFlows.DIRECT_CROWN.chain,['UberCrownDirect']);
  assert.match(cfg.nativeTypingMindFlows.DIRECT_CROWN.invariant,/direct Opus is the cost floor/i);
});

test('Crown cache locality is protected from changing Dynamic Context',()=>{
  assert.equal(cfg.contextEconomics.crownPromptCaching,true);
  assert.equal(cfg.contextEconomics.dynamicContextOnCrown,false);
  assert.ok(cfg.contextEconomics.dynamicContextPreferredAgents.includes('UberScout'));
});

test('Crown is a delta reviewer and cheap agents cannot silently become final authority',()=>{
  assert.deepEqual(cfg.outputEconomics.crownDecisionProtocol,[
    'ACCEPT_BUILDER_VERBATIM','PATCH_MINIMAL','REWRITE_COMPLETE','ESCALATE_SOL_PRO'
  ]);
  assert.equal(cfg.modelRoles.scout.authority,'PROPOSAL_ONLY');
  assert.equal(cfg.modelRoles.critic.authority,'PROPOSAL_ONLY');
  assert.equal(cfg.modelRoles.builder.authority,'PROPOSAL_ONLY');
  assert.ok(cfg.qualityRules.some(x=>/Cheap agents cannot lower/.test(x)));
});

test('tool routing never blindly trades quality for floor price',()=>{
  assert.match(cfg.costControls.cheapModelProviderPolicy,/Auto-Exacto for tool calls/);
  assert.ok(cfg.qualityRules.some(x=>/tool-heavy requests use quality-aware provider routing/.test(x)));
});
