import test from 'node:test';
import assert from 'node:assert/strict';
import {compileXListeningPlan,normalizePublicPost,dedupePublicPosts,atomizePublicPost,buildGamechangerObservationFromPublicPost} from '../src/public-signal-harvester.mjs';

test('listening plan batches accounts and topics and keeps read-only authority',()=>{
 const plan=compileXListeningPlan({accounts:['@a','b'],topics:['agent memory','mcp'],includeGithubLinks:true});
 assert.equal(plan.ok,true);
 assert.equal(plan.authority,'PUBLIC_READ_RESEARCH_ONLY');
 assert.ok(plan.rules.some(r=>r.kind==='ACCOUNT'));
 assert.ok(plan.rules.some(r=>r.kind==='TOPIC'));
 assert.ok(plan.rules.some(r=>r.kind==='GITHUB_LINK'));
});

test('post normalization strips tracking query and extracts github candidates',()=>{
 const out=normalizePublicPost({id:'123',author:'alice',url:'https://x.com/alice/status/123?s=61',text:'open source repo https://github.com/acme/brain'});
 assert.equal(out.ok,true);
 assert.equal(out.post.url,'https://x.com/alice/status/123');
 assert.deepEqual(out.post.githubRepos,['acme/brain']);
 assert.equal(out.post.authority,'RESEARCH_ONLY');
});

test('dedupe collapses identical observations',()=>{
 const raw={id:'123',author:'alice',text:'hello',url:'https://x.com/alice/status/123'};
 const out=dedupePublicPosts([raw,raw]);
 assert.equal(out.uniqueCount,1);
});

test('atomizer emits reusable mechanisms and zero promotion authority',()=>{
 const out=atomizePublicPost({id:'9',author:'bob',url:'https://x.com/bob/status/9',text:'open source multi-agent swarm with structured audit trail https://github.com/org/repo'});
 assert.equal(out.ok,true);
 assert.equal(out.promotionAuthority,'NONE');
 assert.ok(out.atoms.some(x=>x.type==='ORCHESTRATION'));
 assert.ok(out.atoms.some(x=>x.type==='AUDITABILITY'));
 assert.ok(out.atoms.some(x=>x.type==='REPOSITORY_CANDIDATE'));
});

test('gamechanger handoff remains community signal with research-only authority',()=>{
 const out=buildGamechangerObservationFromPublicPost({id:'42',author:'carol',url:'https://x.com/carol/status/42',text:'new AI agent framework with replay logs'});
 assert.equal(out.ok,true);
 assert.equal(out.observation.sourceTier,'COMMUNITY_SIGNAL');
 assert.equal(out.authority,'RESEARCH_ONLY');
 assert.ok(out.observation.domains.includes('AGENT_RUNTIME'));
});
