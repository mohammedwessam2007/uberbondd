import { DurableObject } from 'cloudflare:workers';

const ACTIVE_MS = 1000;
const IDLE_MS = 60000;
const ACTIVE_DAILY_CAP = 88000;

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {'content-type':'application/json; charset=utf-8'}
});

const randomNonce = () => crypto.randomUUID();
const utcDay = now => new Date(now).toISOString().slice(0,10);

export class UberBondFreeCoordinator extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx = ctx;
    this.env = env;
  }

  async state() {
    return (await this.ctx.storage.get('state')) || {
      pendingJobs: 0,
      inflight: false,
      callbackNonce: null,
      callbackUrl: null,
      dispatchAt: null,
      lastCompletionAt: null,
      lastCompletionStatus: null,
      tickDay: utcDay(Date.now()),
      ticksToday: 0
    };
  }

  async save(state) {
    await this.ctx.storage.put('state', state);
  }

  authorized(request) {
    const configured = String(this.env.MESH_TOKEN || '');
    if (!configured) return false;
    const auth = request.headers.get('authorization') || '';
    return auth === `Bearer ${configured}`;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/health') {
      const state = await this.state();
      return json({
        ok: true,
        mode: state.inflight || state.pendingJobs > 0 ? 'ACTIVE' : 'HIBERNATING',
        pendingJobs: state.pendingJobs,
        inflight: state.inflight,
        lastCompletionAt: state.lastCompletionAt,
        lastCompletionStatus: state.lastCompletionStatus,
        ticksToday: state.ticksToday,
        externalEffectAuthority: 'NONE',
        truthBoundary: 'FREE_COORDINATOR_HEALTH_IS_RUNTIME_LIVENESS_NOT_REVENUE'
      });
    }

    if (url.pathname === '/wake' && request.method === 'POST') {
      if (!this.authorized(request)) return json({ok:false,error:'unauthorized'},401);
      const payload = await request.json().catch(()=>({}));
      const state = await this.state();
      state.pendingJobs = Math.min(1000, Math.max(1, state.pendingJobs + Number(payload.requestedJobs || 1)));
      if (payload.callbackUrl) state.callbackUrl = String(payload.callbackUrl).slice(0,500);
      await this.save(state);
      await this.ctx.storage.setAlarm(Date.now() + ACTIVE_MS);
      return json({ok:true,pendingJobs:state.pendingJobs,externalEffectAuthority:'NONE'});
    }

    if (url.pathname === '/complete' && request.method === 'POST') {
      const state = await this.state();
      const nonce = request.headers.get('x-uberbond-callback-nonce') || '';
      if (!state.callbackNonce || nonce !== state.callbackNonce) return json({ok:false,error:'invalid-callback-nonce'},401);
      const payload = await request.json().catch(()=>({}));
      state.inflight = false;
      state.callbackNonce = null;
      state.lastCompletionAt = new Date().toISOString();
      state.lastCompletionStatus = String(payload.status || 'unknown').slice(0,80);
      await this.save(state);
      await this.ctx.storage.setAlarm(Date.now() + (state.pendingJobs > 0 ? ACTIVE_MS : IDLE_MS));
      return json({ok:true,pendingJobs:state.pendingJobs});
    }

    return json({ok:false,error:'not-found'},404);
  }

  async dispatchBurst(state) {
    if (!this.env.GITHUB_DISPATCH_TOKEN || !this.env.GITHUB_REPOSITORY) return {ok:false,status:'MISSING_GITHUB_DISPATCH_CONFIG'};
    if (!state.callbackUrl) return {ok:false,status:'MISSING_CALLBACK_URL'};
    const nonce = randomNonce();
    const requestedJobs = Math.max(1, Math.min(100, state.pendingJobs));
    const response = await fetch(`https://api.github.com/repos/${this.env.GITHUB_REPOSITORY}/actions/workflows/free-runtime-burst.yml/dispatches`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.env.GITHUB_DISPATCH_TOKEN}`,
        accept: 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28',
        'user-agent': 'UberBond-Free-Runtime-Mesh'
      },
      body: JSON.stringify({
        ref: 'main',
        inputs: {
          reason: 'cloudflare-free-runtime-mesh',
          requestedJobs: String(requestedJobs),
          callbackUrl: state.callbackUrl,
          callbackNonce: nonce
        }
      })
    });
    if (!response.ok) return {ok:false,status:`GITHUB_DISPATCH_${response.status}`};
    state.pendingJobs = Math.max(0, state.pendingJobs - requestedJobs);
    state.inflight = true;
    state.callbackNonce = nonce;
    state.dispatchAt = new Date().toISOString();
    return {ok:true,status:'DISPATCHED'};
  }

  async alarm() {
    const now = Date.now();
    const state = await this.state();
    const day = utcDay(now);
    if (state.tickDay !== day) {
      state.tickDay = day;
      state.ticksToday = 0;
    }
    state.ticksToday += 1;

    if (!state.inflight && state.pendingJobs > 0 && state.ticksToday < ACTIVE_DAILY_CAP) {
      const dispatch = await this.dispatchBurst(state);
      state.lastDispatchStatus = dispatch.status;
    }

    await this.save(state);
    const active = state.inflight || state.pendingJobs > 0;
    const cadence = active && state.ticksToday < ACTIVE_DAILY_CAP ? ACTIVE_MS : IDLE_MS;
    await this.ctx.storage.setAlarm(now + cadence);
  }
}

export default {
  async fetch(request, env) {
    const id = env.UBERBOND_COORDINATOR.idFromName('primary');
    const stub = env.UBERBOND_COORDINATOR.get(id);
    return stub.fetch(request);
  }
};
