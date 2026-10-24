export const fixtures = [
 ['proof.compile',{proofs:[{id:'p1',kind:'synthetic-evidence',evidenceRef:'fixture:p1',sourceClass:'SYNTHETIC',synthetic:true}]}],
 ['proof.route-missing',{requirements:[{id:'r1',proofClass:'SOURCE_INTERNAL',description:'synthetic requirement'}]}],
 ['founder.exception-prioritize',{exceptions:[]}],
 ['institution.compile-cell',{task:{taskClass:'SYNTHETIC',requiredCapabilities:['test'],maxLatencyMs:100,maxCostUsd:0,maxFounderMinutes:0},candidates:[{id:'local',executorClass:'DETERMINISTIC_CODE',capabilities:['test'],evidenceRefs:['fixture:tested'],verified:true,latencyMs:1,costUsd:0,founderMinutes:0,authority:'NONE'}]}],
 ['strategy.minimax-regret',{scenarios:[{id:'s1'}],strategies:[{id:'a',outcomes:{s1:{low:1,high:2}}}]}],
 ['authority.revoke-subtree',{grants:[{id:'root',actions:['LOCAL_TEST'],expiresAt:'2099-12-31T00:00:00.000Z'}],revokeId:'root',revokedAt:'2026-10-24T00:00:00.000Z',reason:'test-only'}],
 ['world.simulate-counterfactual',{initialState:{stock:1},rules:[{target:'stock',coefficient:2}],steps:2}],
 ['theory.form-evidence-bound',{observations:[{id:'obs',summary:'synthetic observation',evidenceRefs:['fixture:obs']}],candidateMechanisms:[{id:'m',statement:'testable relationship',predicts:['obs']}]}],
 ['causal.assess-witness',{cause:'fixture A',effect:'fixture B',temporalOrder:true,evidenceRefs:['fixture:causal']}],
 ['evaluator.coevolve',{hypotheses:[{id:'h',features:{score:1},targetRank:0}],evaluators:[{id:'e',weights:{score:1}}],rounds:1}],
 ['architecture.generate-rivals',{baseline:{id:'synthetic'},changedPrimitives:[{id:'new'}],maxRivals:1}],
 ['policy.evolve-generations',{seedPolicies:[{id:'p',weights:{score:1}}],benchmarkCases:[{candidates:[{id:'a',features:{score:2}},{id:'b',features:{score:1}}],winnerId:'a'}],generations:1}],
 ['ontology.invent-language',{namespace:'ub',concepts:[{id:'buyer'},{id:'offer'}],relations:[{from:'buyer',relation:'PAYS',to:'offer'}]}],
 ['economy.compile-dsl',{entities:[{id:'buyer',kind:'ACTOR'},{id:'seller',kind:'ACTOR'},{id:'cash',kind:'RESOURCE'}],flows:[{from:'buyer',to:'seller',resource:'cash',rate:1}]}],
 ['company.compile-genome',{company:{buyer:'synthetic client',problem:'fixture',mechanism:'test',value:'receipt',distribution:'none',revenue:'zero',delivery:'local',capabilities:[]}}]
];
