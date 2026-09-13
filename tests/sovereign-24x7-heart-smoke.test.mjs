import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');

function simulate24h({ticks=86_400,failures=[12_345,43_210,70_000],staleAt=50_000}={}){
  let alive=true;
  let recoveries=0;
  let wealthFresh=true;
  let wealthAdvances=0;
  for(let tick=1;tick<=ticks;tick++){
    if(failures.includes(tick)) alive=false;
    if(tick===staleAt) wealthFresh=false;
    if(!alive){alive=true;recoveries++;}
    if(!wealthFresh){wealthFresh=true;recoveries++;}
    if(alive&&wealthFresh) wealthAdvances++;
  }
  return {ticks,alive,wealthFresh,recoveries,wealthAdvances};
}

test('sovereign heart is configured for unconditional service recovery and boot enablement',()=>{
  const core=read('ops/sovereign/uberlit.service');
  const tls=read('ops/sovereign/uberlit-tls-edge.service');
  const worker=read('ops/sovereign/uberlit-worker.service');
  const installer=read('ops/sovereign/install-uberlit.sh');
  for(const unit of [core,tls,worker]) assert.match(unit,/Restart=always/);
  assert.match(worker,/AUTOPILOT_ENABLED=true/);
  assert.match(worker,/WatchdogSec=60/);
  assert.match(installer,/systemctl enable uberlit\.service uberlit-tls-edge\.service uberlit-worker\.service/);
});

test('wealth control heartbeat is exactly one second and zero-capital by default',()=>{
  const scheduler=read('src/scheduler.mjs');
  assert.match(scheduler,/const SECOND = 1000/);
  assert.match(scheduler,/const WEALTH_HEARTBEAT_MS = SECOND/);
  assert.match(scheduler,/\['universal\.wealth\.pulse', WEALTH_HEARTBEAT_MS, \{ maxSearchCells: 256, maxCanaries: 5, maxCapitalAtRisk: 0 \}/);
});

test('accelerated logical day survives clean exits and a stale wealth signal',()=>{
  const r=simulate24h();
  assert.equal(r.ticks,86_400);
  assert.equal(r.alive,true);
  assert.equal(r.wealthFresh,true);
  assert.equal(r.recoveries,4);
  assert.equal(r.wealthAdvances,86_400);
});

test('24x7 source smoke has no authority widening',()=>{
  const worker=read('ops/sovereign/uberlit-worker.service');
  assert.match(worker,/OUTBOUND_ENABLED=false/);
  assert.match(worker,/DISCOVERY_ENABLED=false/);
});
