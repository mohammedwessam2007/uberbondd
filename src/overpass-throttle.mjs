export const OVERPASS_THROTTLE_POLICY_VERSION = 'uberbond.overpass-throttle.v1';
const RETRYABLE_STATUS = new Set([406, 429, 502, 503, 504]);
const gates = new Map();

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const boundedInt = (value, fallback, min, max) => {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
};

function retryAfterMs(response) {
  const raw = response?.headers?.get?.('retry-after');
  if (!raw) return null;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 120000);
  const date = Date.parse(raw);
  return Number.isFinite(date) ? Math.max(0, Math.min(date - Date.now(), 120000)) : null;
}

function gateFor(endpoint) {
  const key = String(endpoint);
  if (!gates.has(key)) gates.set(key, { tail: Promise.resolve(), nextAllowedAt: 0 });
  return gates.get(key);
}

async function serialized(gate, fn) {
  const prior = gate.tail.catch(() => {});
  let release;
  gate.tail = new Promise(resolve => { release = resolve; });
  await prior;
  try { return await fn(); } finally { release(); }
}

export async function fetchOverpassWithPolicy(fetcher, endpoint, requestInit = {}, options = {}) {
  if (typeof fetcher !== 'function') throw new Error('overpass-fetcher-required');
  const attempts = boundedInt(options.maxAttempts, 3, 1, 5);
  const timeoutMs = boundedInt(options.timeoutMs, 30000, 1000, 120000);
  const minIntervalMs = boundedInt(options.minIntervalMs, 1000, 0, 60000);
  const sleep = options.sleep || wait;
  const now = options.now || (() => Date.now());
  const gate = options.gate || gateFor(endpoint);

  return serialized(gate, async () => {
    const before = Math.max(0, gate.nextAllowedAt - now());
    if (before) await sleep(before);
    let lastError;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let response;
      try {
        response = await fetcher(endpoint, { ...requestInit, signal: controller.signal });
      } catch (error) {
        lastError = error?.name === 'AbortError' ? new Error(`OpenStreetMap discovery timed out after ${timeoutMs}ms`) : error;
        if (attempt >= attempts) throw lastError;
        const delay = Math.min(30000, 5000 * (2 ** (attempt - 1)));
        gate.nextAllowedAt = now() + delay;
        await sleep(delay);
        continue;
      } finally {
        clearTimeout(timer);
      }

      gate.nextAllowedAt = now() + minIntervalMs;
      if (response.ok) return response;
      const status = Number(response.status || 0);
      if (!RETRYABLE_STATUS.has(status) || attempt >= attempts) {
        const error = new Error(`OpenStreetMap discovery failed with HTTP ${status}`);
        error.status = status;
        error.retryable = RETRYABLE_STATUS.has(status);
        throw error;
      }
      const advised = retryAfterMs(response);
      const fallback = (status === 406 || status === 429) ? 30000 : Math.min(30000, 5000 * (2 ** (attempt - 1)));
      const delay = advised ?? fallback;
      gate.nextAllowedAt = now() + delay;
      await sleep(delay);
    }
    throw lastError || new Error('overpass-retries-exhausted');
  });
}

export function resetOverpassThrottleForTests() { gates.clear(); }
