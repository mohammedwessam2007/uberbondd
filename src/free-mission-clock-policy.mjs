export const FREE_MISSION_CLOCK_VERSION = 'uberbond.free-mission-clock.v1';
export const MIN_INTERVAL_MS = 1000;
export const MAX_ACTIVE_WINDOW_MS = 8 * 60 * 60 * 1000;
export const MAX_TICKS_PER_WINDOW = MAX_ACTIVE_WINDOW_MS / MIN_INTERVAL_MS;

const finite = value => Number.isFinite(Number(value)) ? Number(value) : null;

export function compileFreeMissionClock({ intervalMs = MIN_INTERVAL_MS, durationMs = MAX_ACTIVE_WINDOW_MS } = {}) {
  const interval = finite(intervalMs);
  const duration = finite(durationMs);
  const reasons = [];

  if (interval === null || interval < MIN_INTERVAL_MS) reasons.push('interval-below-free-runtime-floor');
  if (duration === null || duration <= 0 || duration > MAX_ACTIVE_WINDOW_MS) reasons.push('duration-outside-bounded-window');

  const safeInterval = interval === null ? MIN_INTERVAL_MS : Math.max(MIN_INTERVAL_MS, Math.floor(interval));
  const safeDuration = duration === null ? MAX_ACTIVE_WINDOW_MS : Math.min(MAX_ACTIVE_WINDOW_MS, Math.max(1, Math.floor(duration)));
  const maximumTicks = Math.ceil(safeDuration / safeInterval);
  if (maximumTicks > MAX_TICKS_PER_WINDOW) reasons.push('tick-budget-exceeded');

  return {
    ok: reasons.length === 0,
    version: FREE_MISSION_CLOCK_VERSION,
    intervalMs: safeInterval,
    durationMs: safeDuration,
    maximumTicks,
    externalEffectAuthority: 'NONE',
    reasons,
    truthBoundary: 'MISSION_CLOCK_PROVES_ONLY_BOUNDED_RUNTIME_SCHEDULING_AND_LIVENESS; IT_DOES_NOT_AUTHORIZE_OR_PROVE_ANY_EXTERNAL_EFFECT'
  };
}
