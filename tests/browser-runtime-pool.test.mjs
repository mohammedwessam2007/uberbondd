import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { BrowserRuntimePool, getSharedBrowserRuntime, closeSharedBrowserRuntimes } from '../src/browser-runtime-pool.mjs';

test('shares one browser process while isolating contexts', async () => {
  let launches=0, contexts=0, contextCloses=0;
  const browser={isConnected:()=>true,newContext:async()=>({id:++contexts,close:async()=>{contextCloses++}}),close:async()=>{},on:()=>{}};
  const pool=new BrowserRuntimePool({launchBrowser:async()=>{launches++;return browser},maxConcurrentContexts:2,recycleAfterContexts:10});
  const a=await pool.acquire(), b=await pool.acquire();
  assert.equal(launches,1);
  assert.notEqual(a.context.id,b.context.id);
  await a.release(); await b.release();
  assert.equal(contextCloses,2);
  await pool.close();
});

test('blocks a third context until one lease releases', async () => {
  let contexts=0;
  const browser={isConnected:()=>true,newContext:async()=>({id:++contexts,close:async()=>{}}),close:async()=>{},on:()=>{}};
  const pool=new BrowserRuntimePool({launchBrowser:async()=>browser,maxConcurrentContexts:2,recycleAfterContexts:10});
  const a=await pool.acquire(), b=await pool.acquire();
  let acquired=false;
  const cPromise=pool.acquire().then(x=>{acquired=true;return x});
  await new Promise(r=>setTimeout(r,10));
  assert.equal(acquired,false);
  await a.release();
  const c=await cPromise;
  assert.equal(acquired,true);
  await b.release(); await c.release(); await pool.close();
});

test('stress never exceeds configured active-context cap', async () => {
  const browser={isConnected:()=>true,newContext:async()=>({close:async()=>{}}),close:async()=>{},on:()=>{}};
  const pool=new BrowserRuntimePool({launchBrowser:async()=>browser,maxConcurrentContexts:3,recycleAfterContexts:100});
  let maxActive=0;
  await Promise.all(Array.from({length:50},async()=>{
    const lease=await pool.acquire();
    maxActive=Math.max(maxActive,pool.active);
    await new Promise(r=>setTimeout(r,1));
    await lease.release();
  }));
  assert.equal(maxActive,3);
  await pool.close();
});

test('recycles the browser after a bounded number of completed contexts', async () => {
  let launches=0, browserCloses=0;
  const make=()=>({isConnected:()=>true,newContext:async()=>({close:async()=>{}}),close:async()=>{browserCloses++},on:()=>{}});
  const pool=new BrowserRuntimePool({launchBrowser:async()=>{launches++;return make()},maxConcurrentContexts:1,recycleAfterContexts:2});
  const a=await pool.acquire(); await a.release();
  const b=await pool.acquire(); await b.release();
  const c=await pool.acquire();
  assert.equal(launches,2);
  assert.equal(browserCloses,1);
  await c.release(); await pool.close();
});

test('non-worker runtime auto-closes when its only lease becomes idle', async () => {
  const previous=process.env.PROCESS_ROLE;
  delete process.env.PROCESS_ROLE;
  let browserCloses=0;
  const browser={isConnected:()=>true,newContext:async()=>({close:async()=>{}}),close:async()=>{browserCloses++},on:()=>{}};
  try {
    const runtime=getSharedBrowserRuntime({key:'test-non-worker',launchBrowser:async()=>browser});
    const lease=await runtime.acquire(); await lease.release();
    assert.equal(runtime.closed,true);
    assert.equal(browserCloses,1);
  } finally {
    if(previous===undefined) delete process.env.PROCESS_ROLE; else process.env.PROCESS_ROLE=previous;
  }
});

test('worker runtime persists until explicit shared-runtime shutdown', async () => {
  const previous=process.env.PROCESS_ROLE;
  process.env.PROCESS_ROLE='worker';
  let browserCloses=0;
  const browser={isConnected:()=>true,newContext:async()=>({close:async()=>{}}),close:async()=>{browserCloses++},on:()=>{}};
  try {
    const runtime=getSharedBrowserRuntime({key:'test-worker-persistent',launchBrowser:async()=>browser,recycleAfterContexts:100});
    const lease=await runtime.acquire(); await lease.release();
    assert.equal(runtime.closed,false);
    assert.equal(browserCloses,0);
    await closeSharedBrowserRuntimes();
    assert.equal(browserCloses,1);
  } finally {
    if(previous===undefined) delete process.env.PROCESS_ROLE; else process.env.PROCESS_ROLE=previous;
  }
});

test('worker runtime refuses to reuse a key across incompatible launch boundaries', async () => {
  const previous=process.env.PROCESS_ROLE;
  process.env.PROCESS_ROLE='worker';
  const browser={isConnected:()=>true,newContext:async()=>({close:async()=>{}}),close:async()=>{},on:()=>{}};
  try {
    getSharedBrowserRuntime({key:'test-config-boundary',launchBrowser:async()=>browser,launchOptions:{args:['--disable-web-security']}});
    assert.throws(
      ()=>getSharedBrowserRuntime({key:'test-config-boundary',launchBrowser:async()=>browser,launchOptions:{args:[]}}),
      /browser-runtime-config-mismatch/
    );
  } finally {
    await closeSharedBrowserRuntimes();
    if(previous===undefined) delete process.env.PROCESS_ROLE; else process.env.PROCESS_ROLE=previous;
  }
});

test('closing the pool rejects queued waiters fail-closed', async () => {
  const browser={isConnected:()=>true,newContext:async()=>({close:async()=>{}}),close:async()=>{},on:()=>{}};
  const pool=new BrowserRuntimePool({launchBrowser:async()=>browser,maxConcurrentContexts:1});
  const first=await pool.acquire();
  const queued=pool.acquire();
  await pool.close();
  await assert.rejects(queued,/browser-runtime-closed/);
  await first.release();
});

test('crawler and worker use the shared runtime lifecycle', async () => {
  const crawler = await readFile(new URL('../src/browser-crawler.mjs', import.meta.url), 'utf8');
  const worker = await readFile(new URL('../worker.mjs', import.meta.url), 'utf8');
  assert.match(crawler, /getSharedBrowserRuntime/);
  assert.match(crawler, /const runtimeLease=await runtime\.acquire/);
  assert.match(crawler, /finally \{ await runtimeLease\.release\(\); \}/);
  assert.doesNotMatch(crawler, /const browser=await chromium\.launch/);
  assert.doesNotMatch(crawler, /await context\.close\(\); await browser\.close\(\)/);
  assert.match(worker, /closeSharedBrowserRuntimes/);
  const closeIndex = worker.indexOf('await closeSharedBrowserRuntimes()');
  const storeCloseIndex = worker.indexOf('await store.close()');
  assert.ok(closeIndex >= 0 && storeCloseIndex > closeIndex, 'worker closes browser runtimes before the store');
});
