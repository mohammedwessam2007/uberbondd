import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { inspectBlindTunnelConfig, connectTlsThroughBlindWebSocketTunnel } from '../src/fixed-host-blind-tunnel.mjs';

test('blind tunnel refuses non-wss, wrong host, and non-465 target',()=>{
  const r=inspectBlindTunnelConfig({url:'https://relay.invalid',token:'x',allowedHost:'inbound.mywinnr.com',targetHost:'other.example',targetPort:587});
  assert.equal(r.ok,false);
  assert.deepEqual(new Set(r.reasonCodes),new Set(['wss-tunnel-url-required','target-host-not-authorized','target-port-not-authorized']));
});

test('blind tunnel wraps websocket carrier in end-to-end TLS for authorized fixed host',async()=>{
  let observed=null;
  class FakeWebSocket extends EventTarget {
    static OPEN=1;
    constructor(url,protocols){
      super();this.url=url;this.protocols=protocols;this.readyState=0;
      queueMicrotask(()=>{this.readyState=1;this.dispatchEvent(new Event('open'));});
    }
    send(){}
    close(){this.readyState=3;this.dispatchEvent(new Event('close'));}
  }
  const fakeTlsConnect=options=>{
    observed=options;
    const socket=new EventEmitter();
    socket.destroy=()=>{};
    queueMicrotask(()=>socket.emit('secureConnect'));
    return socket;
  };
  const socket=await connectTlsThroughBlindWebSocketTunnel({
    url:'wss://example.supabase.co/functions/v1/winnr-blind-tunnel',
    token:'test-only-token',
    allowedHost:'inbound.mywinnr.com',
    targetHost:'inbound.mywinnr.com',
    targetPort:465,
    connectTimeoutMs:1000,
    WebSocketCtor:FakeWebSocket,
    tlsConnect:fakeTlsConnect
  });
  assert.ok(socket);
  assert.equal(observed.servername,'inbound.mywinnr.com');
  assert.equal(observed.rejectUnauthorized,true);
  assert.ok(observed.socket);
});

test('blind tunnel never authorizes a host by URL alone',()=>{
  const r=inspectBlindTunnelConfig({url:'wss://inbound.mywinnr.com/',token:'x',allowedHost:'inbound.mywinnr.com',targetHost:'evil.example',targetPort:465});
  assert.equal(r.ok,false);
  assert.ok(r.reasonCodes.includes('target-host-not-authorized'));
});
