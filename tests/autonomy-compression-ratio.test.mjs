import test from 'node:test';
import assert from 'node:assert/strict';
import {compileAutonomyCompressionMeasurement,compareAutonomyCompressionReplay} from '../src/autonomy-compression-ratio.mjs';

const baseline=[1,2,3,4].map(i=>({taskId:`t${i}`,layer:'FRONTIER_MODEL',quality:.9,accepted:true,frontierTokens:1000,hiddenFrontierInterventions:0,defects:0}));
const improved=[
 {taskId:'t1',layer:'DETERMINISTIC',quality:.9,accepted:true,frontierTokens:0,hiddenFrontierInterventions:0,defects:0},
 {taskId:'t2',layer:'JEV_SYSTEM_ONE',quality:.9,accepted:true,frontierTokens:0,hiddenFrontierInterventions:0,defects:0},
 {taskId:'t3',layer:'LOCAL_MODEL',quality:.9,accepted:true,frontierTokens:0,hiddenFrontierInterventions:0,defects:0},
 {taskId:'t4',layer:'FRONTIER_MODEL',quality:.9,accepted:true,frontierTokens:1000,hiddenFrontierInterventions:0,defects:0}
];

test('measures quality-adjusted compiled work rather than raw task count',()=>{
 const r=compileAutonomyCompressionMeasurement({tasks:improved});
 assert.equal(r.ok,true); assert.equal(r.autonomyCompressionRatio,.75); assert.equal(r.frontierQualityShare,.25);
});

test('supports compression only when frontier intensity falls without quality or safety regression',()=>{
 const r=compareAutonomyCompressionReplay({baselineTasks:baseline,currentTasks:improved});
 assert.equal(r.status,'AUTONOMY_COMPRESSION_IMPROVEMENT_SUPPORTED'); assert.equal(r.hypothesisSupported,true); assert.equal(r.falsifierTriggered,false);
});

test('higher compression with more defects triggers the candidate falsifier',()=>{
 const bad=structuredClone(improved); bad[0].defects=1;
 const r=compareAutonomyCompressionReplay({baselineTasks:baseline,currentTasks:bad});
 assert.equal(r.status,'AUTONOMY_COMPRESSION_GAMING_RISK'); assert.equal(r.hypothesisSupported,false); assert.equal(r.falsifierTriggered,true); assert.equal(r.gates.defectsSafe,false);
});

test('hidden frontier intervention cannot masquerade as local autonomy',()=>{
 const bad=structuredClone(improved); bad[0].hiddenFrontierInterventions=1;
 const r=compareAutonomyCompressionReplay({baselineTasks:baseline,currentTasks:bad});
 assert.equal(r.status,'AUTONOMY_COMPRESSION_GAMING_RISK'); assert.equal(r.gates.hiddenFrontierSafe,false);
});

test('replay refuses different task populations',()=>{
 const bad=structuredClone(improved); bad[3].taskId='different';
 const r=compareAutonomyCompressionReplay({baselineTasks:baseline,currentTasks:bad});
 assert.equal(r.ok,false); assert.ok(r.reasonCodes.includes('same-declared-task-population-required'));
});

test('malformed metrics fail closed',()=>{
 const r=compileAutonomyCompressionMeasurement({tasks:[{taskId:'x',layer:'LOCAL_MODEL',quality:2,accepted:true,frontierTokens:0,hiddenFrontierInterventions:0,defects:0}]});
 assert.equal(r.ok,false); assert.ok(r.reasonCodes.includes('bounded-task-metrics-required'));
});
