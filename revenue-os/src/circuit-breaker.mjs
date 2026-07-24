// A minimal, real circuit breaker (workstream 15's own requirement) -- opens after N consecutive
// failures, refuses calls while open, and half-opens after a cooldown to test recovery with a
// single trial call. Used by scheduler job handlers that call an injected provider (payment
// reconciliation, reply import) so a misbehaving fake/replay provider cannot be hammered forever.
export class CircuitBreakerOpenError extends Error {
  constructor(name) {
    super(`circuit breaker "${name}" is open`);
    this.name = 'CircuitBreakerOpenError';
    this.code = 'circuit-breaker-open';
  }
}

export function createCircuitBreaker({ name = 'default', failureThreshold = 3, cooldownMs = 30000, clock = () => Date.now() } = {}) {
  let state = 'closed'; // closed | open | half-open
  let consecutiveFailures = 0;
  let openedAt = null;

  return {
    get state() { return state; },
    async call(fn) {
      if (state === 'open') {
        if (clock() - openedAt < cooldownMs) throw new CircuitBreakerOpenError(name);
        state = 'half-open';
      }
      try {
        const result = await fn();
        consecutiveFailures = 0;
        state = 'closed';
        return result;
      } catch (error) {
        consecutiveFailures += 1;
        if (state === 'half-open' || consecutiveFailures >= failureThreshold) {
          state = 'open';
          openedAt = clock();
        }
        throw error;
      }
    },
    reset() { state = 'closed'; consecutiveFailures = 0; openedAt = null; }
  };
}
