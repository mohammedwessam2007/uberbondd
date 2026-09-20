import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compileDeclarativeWorld,
  compileDeclarativePolicy,
  compileSimulationEcology,
  perturbWorldInitialState,
  runDeclarativeSimulation
} from '../src/moonshot-simulation-ecology.mjs';

const baseWorld={
  id:'resource-world',
  initialState:{resource:10,output:0,risk:0},
  actions:[
    {id:'harvest',effects:[{key:'resource',op:'ADD',value:-2},{key:'output',op:'ADD',value:3},{key:'risk',op:'ADD',value:1}]},
    {id:'conserve',effects:[{key:'resource',op:'ADD',value:1},{key:'output',op:'ADD',value:1},{key:'risk',op:'MAX',value:0}]}
  ],
  dynamics:[{key:'risk',op:'MULTIPLY',value:0.9}],
  terminalConditions:[{key:'resource',op:'LTE',value:0}],
  maxSteps:6
};

test('simulation is deterministic and zero-effect',()=>{
  const world=compileDeclarativeWorld(baseWorld);
  const policy=compileDeclarativePolicy({id:'always-harvest',rules:[],defaultActionId:'harvest'});
  const a=runDeclarativeSimulation({world:world.world,policy:policy.policy});
  const b=runDeclarativeSimulation({world:world.world,policy:policy.policy});
  assert.deepEqual(a.finalState,b.finalState);
  assert.equal(a.networkCalls,0);
  assert.equal(a.executionAuthority,'NONE');
});

test('policy can adapt to synthetic state without arbitrary callbacks',()=>{
  const world=compileDeclarativeWorld(baseWorld);
  const policy=compileDeclarativePolicy({
    id:'adaptive',
    rules:[{conditions:[{key:'resource',op:'LTE',value:5}],actionId:'conserve'}],
    defaultActionId:'harvest'
  });
  const run=runDeclarativeSimulation({world:world.world,policy:policy.policy});
  assert.ok(run.actionCounts.harvest>0);
  assert.ok(run.actionCounts.conserve>0);
  assert.match(run.truthBoundary,/NOT_FORECAST/);
});

test('ecology preserves counterexamples across worlds instead of reporting one universal winner',()=>{
  const compiled=compileDeclarativeWorld(baseWorld).world;
  const neighborhood=perturbWorldInitialState({world:compiled,variants:[
    {resource:-6},{resource:0},{resource:10}
  ]});
  const worlds=[compiled,...neighborhood.worlds];
  const policies=[
    {id:'harvest',rules:[],defaultActionId:'harvest'},
    {id:'adaptive',rules:[{conditions:[{key:'resource',op:'LTE',value:5}],actionId:'conserve'}],defaultActionId:'harvest'}
  ];
  const ecology=compileSimulationEcology({
    worlds,policies,metricKeys:['output','resource','risk'],score:{key:'output',direction:'MAX'}
  });
  assert.equal(ecology.ok,true);
  assert.equal(ecology.runCount,8);
  assert.equal(ecology.policySummaries.length,2);
  assert.ok(ecology.policySummaries.some(row=>row.losses>0||row.ties>0));
  assert.match(ecology.law,/PRESERVES_COUNTEREXAMPLES/);
});

test('invalid policy action fails closed',()=>{
  const world=compileDeclarativeWorld(baseWorld);
  const policy=compileDeclarativePolicy({id:'bad',rules:[],defaultActionId:'network-call'});
  const run=runDeclarativeSimulation({world:world.world,policy:policy.policy});
  assert.equal(run.ok,false);
  assert.ok(run.reasonCodes.includes('unknown-default-action:network-call'));
});

test('unknown state mutation is refused',()=>{
  const world=compileDeclarativeWorld({...baseWorld,actions:[
    {id:'bad',effects:[{key:'secret',op:'SET',value:1}]}
  ]});
  assert.equal(world.ok,false);
  assert.ok(world.reasonCodes.includes('action-unknown-state-key:secret'));
});
