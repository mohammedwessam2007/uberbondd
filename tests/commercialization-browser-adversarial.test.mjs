// Hostile-route matrix for the production browser witness's request interceptor.
// The fake browser's only network action is the captured route callback; it
// never starts Chromium or touches a website. Production guard is NOT mocked.
import test from 'node:test';
import assert from 'node:assert/strict';
import { witnessRuntimeTelLinks, MAX_WITNESS_REQUESTS, MAX_WITNESS_INFLIGHT_REQUESTS, MAX_WITNESS_RESPONSE_BYTES } from '../src/inquiry-path-runtime-witness.mjs';

function fakeWitnessHarness() {
  const record = { launchCount: 0, closeCount: 0, contextOptions: null, webSocketHandler: null, routeHandler: null, pageCount: 0 };
  const browser = {
    newContext: async options => {
      record.contextOptions = options;
      return {
        routeWebSocket: async (_pattern, handler) => { record.webSocketHandler = handler; },
        route: async (_pattern, handler) => { record.routeHandler = handler; },
        newPage: async () => { record.pageCount++; throw Error('UNEXPECTED_PAGE_CREATION'); },
        close: async () => {}
      };
    },
    close: async () => { record.closeCount++; }
  };
  const launch = async () => { record.launchCount++; return browser; };
  const makeRoute = ({url, method='GET', type='document'}) => {
    const state = { aborted: 0, fulfilled: 0, abortReasons: [] };
    return {
      state,
      request: () => ({url: () => url, method: () => method, resourceType: () => type}),
      abort: async reason => {state.aborted++;state.abortReasons.push(reason);},
      fulfill: async () => {state.fulfilled++;}
    };
  };
  return { record, launch, makeRoute };
}

test('read-only browser shields WebSocket, service worker, download and all click/form authority', async () => {
  const h = fakeWitnessHarness();
  const result = await witnessRuntimeTelLinks({ urls: [], launch: h.launch, maxWitnessMs: 1500 });
  assert.equal(h.record.launchCount,1);
  assert.equal(h.record.closeCount,1);
  assert.equal(h.record.pageCount,0);
  assert.equal(h.record.contextOptions.serviceWorkers,'block');
  assert.equal(h.record.contextOptions.acceptDownloads,false);
  const socket = { closed: 0, close(){this.closed++;} };
  h.record.webSocketHandler(socket);
  assert.equal(socket.closed,1);
  assert.equal(result.ledger.blockedRequests,1);
  assert.equal(result.ledger.clicks,0);
  assert.equal(result.ledger.formSubmissions,0);
  assert.equal(result.ledger.messages,0);
});

test('twelve forbidden request families never trigger a browser-network fulfill', async () => {
  const h = fakeWitnessHarness();
  const result = await witnessRuntimeTelLinks({ urls: [], launch:h.launch, maxWitnessMs: 5000 });
  const vectors = [
    {label:'POST form',url:'https://example.com/contact',method:'POST'},
    {label:'PUT mutation',url:'https://example.com/',method:'PUT'},
    {label:'DELETE mutation',url:'https://example.com/',method:'DELETE'},
    {label:'file scheme',url:'file:///etc/passwd'},
    {label:'data scheme',url:'data:text/html,hostile'},
    {label:'javascript scheme',url:'javascript:alert(1)'},
    {label:'ftp scheme',url:'ftp://example.com/private'},
    {label:'ws scheme',url:'ws://example.com/socket'},
    {label:'image beacon',url:'https://example.com/pixel',type:'image'},
    {label:'font loader',url:'https://example.com/font',type:'font'},
    {label:'media stream',url:'https://example.com/media',type:'media'},
    {label:'misc resource',url:'https://example.com/res',type:'other'}
  ];
  for (const vector of vectors) {
    const route = h.makeRoute(vector);
    await h.record.routeHandler(route);
    assert.equal(route.state.fulfilled,0, `${vector.label} must not reach fetch/fulfill`);
    assert.equal(route.state.aborted,1, `${vector.label} must fail closed`);
    assert.deepEqual(route.state.abortReasons,['blockedbyclient']);
  }
  assert.equal(result.ledger.blockedRequests,12);
  assert.equal(result.ledger.clicks,0);
  assert.equal(result.ledger.formSubmissions,0);
});

test('private and loopback destinations are rejected by the real public-address guard', async () => {
  const h=fakeWitnessHarness();
  const result=await witnessRuntimeTelLinks({urls:[],launch:h.launch,maxWitnessMs:3000});
  for(const url of ['http://127.0.0.1/internal','http://10.0.0.2/secret','http://169.254.169.254/latest/meta-data/','http://[::1]/admin']) {
    const route=h.makeRoute({url});
    await h.record.routeHandler(route);
    assert.equal(route.state.aborted,1,`${url} must be blocked`);
    assert.equal(route.state.fulfilled,0,`${url} must never be fulfilled`);
  }
  assert.equal(result.ledger.blockedRequests,4);
});

test('all unapproved navigation schemes and page-limit overflow refuse before browser launch', async () => {
  for (const url of ['javascript:alert(1)','file:///etc/passwd','data:text/plain,test','ftp://example.org/a','about:blank']) {
    let launches=0;
    await assert.rejects(() => witnessRuntimeTelLinks({urls:[url],launch:async()=>{launches++;}}),/UNSAFE_BROWSER_NAVIGATION_SCHEME/);
    assert.equal(launches,0);
  }
  let launches=0;
  await assert.rejects(()=>witnessRuntimeTelLinks({urls:Array(9).fill('https://example.com/'),launch:async()=>{launches++;}}),/BROWSER_PAGE_LIMIT_EXCEEDED/);
  assert.equal(launches,0);
});


test('hostile request storm is capped before route guard or network fetch', async () => {
  const h=fakeWitnessHarness();
  const result=await witnessRuntimeTelLinks({urls:[],launch:h.launch,maxWitnessMs:3000});
  assert.ok(MAX_WITNESS_REQUESTS>0 && MAX_WITNESS_REQUESTS<=128);
  for(let n=0;n<MAX_WITNESS_REQUESTS+5;n++) {
    const route=h.makeRoute({url:'https://example.com/resource',method:'POST'});
    await h.record.routeHandler(route);
    assert.equal(route.state.fulfilled,0);
    assert.equal(route.state.aborted,1);
  }
  assert.equal(result.ledger.routeRequests,MAX_WITNESS_REQUESTS+5);
  assert.equal(result.ledger.blockedRequests,MAX_WITNESS_REQUESTS+5);
  assert.equal(result.ledger.requestBudgetExceeded,true);
  assert.equal(result.ledger.formSubmissions,0);
});


test('public GET stampede saturates bounded concurrency without reaching a ninth socket', async () => {
  const h = fakeWitnessHarness();
  const pending = [];
  let fetchStarts = 0;
  const fetchPinned = () => {fetchStarts++;return new Promise(resolve => pending.push(resolve));};
  const result = await witnessRuntimeTelLinks({ urls: [], launch:h.launch, fetchPinned, maxWitnessMs: 5000 });
  const routes = Array.from({length:MAX_WITNESS_INFLIGHT_REQUESTS}, () => h.makeRoute({url:'https://1.1.1.1/resource'}));
  const workers = routes.map(route => h.record.routeHandler(route));
  for(let i=0;i<100&&pending.length<MAX_WITNESS_INFLIGHT_REQUESTS;i++) await new Promise(resolve=>setImmediate(resolve));
  assert.equal(fetchStarts,MAX_WITNESS_INFLIGHT_REQUESTS);
  const ninth = h.makeRoute({url:'https://1.1.1.1/overflow'});
  await h.record.routeHandler(ninth);
  assert.equal(ninth.state.fulfilled,0);
  assert.equal(ninth.state.aborted,1);
  assert.equal(result.ledger.requestBudgetExceeded,true);
  assert.equal(result.ledger.peakInflightRequests,MAX_WITNESS_INFLIGHT_REQUESTS);
  for(const resolve of pending) resolve({ status:200, headers:{get:()=>null}, text:async()=>'' });
  await Promise.all(workers);
  assert.equal(result.ledger.inflightRequests,0);
  assert.equal(result.ledger.formSubmissions,0);
});

test('repeated individually capped public responses cannot evade cumulative 24MB body ceiling', async () => {
  const h = fakeWitnessHarness();
  const body = 'a'.repeat(2_000_000);
  let fetches = 0;
  const result = await witnessRuntimeTelLinks({ urls:[], launch:h.launch, maxWitnessMs:5000,
    fetchPinned:async()=>{fetches++;return{status:200,headers:{get:()=>null},text:async()=>body};} });
  assert.equal(MAX_WITNESS_RESPONSE_BYTES,24_000_000);
  for(let i=0;i<15;i++) {
    const route=h.makeRoute({url:'https://1.1.1.1/resource'});
    await h.record.routeHandler(route);
    if(i<12)assert.equal(route.state.fulfilled,1);
    else {assert.equal(route.state.fulfilled,0);assert.equal(route.state.aborted,1);}
  }
  assert.equal(fetches,13,'no additional GET after cumulative budget was exceeded');
  assert.equal(result.ledger.responseBytes,26_000_000);
  assert.equal(result.ledger.requestBudgetExceeded,true);
  assert.equal(result.ledger.inflightRequests,0);
  assert.equal(result.ledger.messages,0);
});
