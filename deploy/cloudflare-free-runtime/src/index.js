import { DurableObject } from 'cloudflare:workers';
import { compileFreeMissionClock } from './policy.js';

const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8' }
});

export class RuntimeClock extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx = ctx;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();

    if (method === 'GET' && url.pathname === '/status') {
      const state = await this.ctx.storage.get(['startedAt', 'activeUntil', 'intervalMs', 'ticks', 'lastTickAt']);
      const now = Date.now();
      return json({
        schema: 'uberbond.cloudflare-runtime-status.v1',
        now,
        active: Number(state.get('activeUntil') || 0) > now,
        startedAt: state.get('startedAt') || null,
        activeUntil: state.get('activeUntil') || null,
        intervalMs: state.get('intervalMs') || null,
        ticks: Number(state.get('ticks') || 0),
        lastTickAt: state.get('lastTickAt') || null,
        externalEffectAuthority: 'NONE'
      });
    }

    if (method === 'POST' && url.pathname === '/start') {
      const body = await request.json().catch(() => ({}));
      const policy = compileFreeMissionClock({
        intervalMs: body.intervalMs,
        durationMs: body.durationMs
      });
      if (!policy.ok) return json({ ok: false, policy }, 400);

      const now = Date.now();
      const activeUntil = now + policy.durationMs;
      await this.ctx.storage.put({
        startedAt: now,
        activeUntil,
        intervalMs: policy.intervalMs,
        ticks: 0,
        lastTickAt: null
      });
      await this.ctx.storage.setAlarm(now + policy.intervalMs);
      return json({ ok: true, policy, startedAt: now, activeUntil, externalEffectAuthority: 'NONE' });
    }

    if (method === 'POST' && url.pathname === '/stop') {
      await this.ctx.storage.put('activeUntil', 0);
      await this.ctx.storage.deleteAlarm();
      return json({ ok: true, stoppedAt: Date.now(), externalEffectAuthority: 'NONE' });
    }

    return json({ error: 'not-found' }, 404);
  }

  async alarm() {
    const now = Date.now();
    const state = await this.ctx.storage.get(['activeUntil', 'intervalMs', 'ticks']);
    const activeUntil = Number(state.get('activeUntil') || 0);
    const intervalMs = Math.max(1000, Number(state.get('intervalMs') || 1000));
    const ticks = Number(state.get('ticks') || 0) + 1;

    await this.ctx.storage.put({ ticks, lastTickAt: now });

    if (now + intervalMs <= activeUntil) {
      await this.ctx.storage.setAlarm(now + intervalMs);
    }
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/health') {
      return json({
        ok: true,
        schema: 'uberbond.cloudflare-free-runtime.v1',
        runtime: 'CLOUDFLARE_WORKERS_FREE_COMPATIBLE',
        externalEffectAuthority: 'NONE',
        truthBoundary: 'HEALTH_PROVES_RUNTIME_REACHABILITY_ONLY'
      });
    }

    const stub = env.RUNTIME_CLOCK.getByName('uberbond-runtime-clock');
    return stub.fetch(request);
  }
};
