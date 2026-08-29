export const BROWSER_RUNTIME_POOL_POLICY_VERSION = 'uberbond.browser-runtime-pool.v1';

const boundedInt = (value, fallback, min, max) => {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
};

export class BrowserRuntimePool {
  constructor({ launchBrowser, launchOptions = {}, maxConcurrentContexts = 2, recycleAfterContexts = 40, autoCloseWhenIdle = false } = {}) {
    if (typeof launchBrowser !== 'function') throw new Error('launch-browser-required');
    this.launchBrowser = launchBrowser;
    this.launchOptions = { ...launchOptions };
    this.maxConcurrentContexts = boundedInt(maxConcurrentContexts, 2, 1, 8);
    this.recycleAfterContexts = boundedInt(recycleAfterContexts, 40, 1, 500);
    this.autoCloseWhenIdle = Boolean(autoCloseWhenIdle);
    this.browser = null;
    this.browserPromise = null;
    this.active = 0;
    this.served = 0;
    this.waiters = [];
    this.closed = false;
  }

  async ensureBrowser() {
    if (this.closed) throw new Error('browser-runtime-closed');
    if (this.browser?.isConnected?.() !== false && this.browser) return this.browser;
    if (!this.browserPromise) {
      this.browserPromise = Promise.resolve(this.launchBrowser(this.launchOptions)).then(browser => {
        if (!browser || typeof browser.newContext !== 'function') throw new Error('invalid-browser-runtime');
        this.browser = browser;
        this.served = 0;
        if (typeof browser.on === 'function') browser.on('disconnected', () => { if (this.browser === browser) this.browser = null; });
        return browser;
      }).finally(() => { this.browserPromise = null; });
    }
    return this.browserPromise;
  }

  async acquireSlot() {
    if (this.closed) throw new Error('browser-runtime-closed');
    if (this.active < this.maxConcurrentContexts && this.waiters.length === 0) { this.active += 1; return; }
    await new Promise((resolve, reject) => this.waiters.push({ resolve, reject }));
  }

  wakeNext() {
    if (this.active >= this.maxConcurrentContexts) return;
    const next = this.waiters.shift();
    if (next) { this.active += 1; next.resolve(); }
  }

  async acquire({ contextOptions = {} } = {}) {
    await this.acquireSlot();
    if (this.closed) { this.active = Math.max(0, this.active - 1); throw new Error('browser-runtime-closed'); }
    let context;
    try {
      const browser = await this.ensureBrowser();
      context = await browser.newContext({ ...contextOptions });
    } catch (error) {
      this.active -= 1;
      this.wakeNext();
      throw error;
    }
    let released = false;
    return {
      policyVersion: BROWSER_RUNTIME_POOL_POLICY_VERSION,
      context,
      release: async () => {
        if (released) return;
        released = true;
        try { await context.close(); } finally {
          this.active = Math.max(0, this.active - 1);
          this.served += 1;
          if (this.active === 0 && this.waiters.length === 0 && this.autoCloseWhenIdle) await this.close();
          else if (this.active === 0 && this.served >= this.recycleAfterContexts) await this.recycle();
          this.wakeNext();
        }
      }
    };
  }

  async recycle() {
    if (this.active > 0) return false;
    const browser = this.browser;
    this.browser = null;
    this.served = 0;
    if (browser && typeof browser.close === 'function') await browser.close().catch(() => {});
    return true;
  }

  async close() {
    if (this.closed) return;
    this.closed = true;
    const error = new Error('browser-runtime-closed');
    for (const waiter of this.waiters.splice(0)) waiter.reject(error);
    const browser = this.browser;
    this.browser = null;
    if (browser && typeof browser.close === 'function') await browser.close().catch(() => {});
  }
}

const shared = new Map();
export function getSharedBrowserRuntime({ key = 'default', launchBrowser, launchOptions = {}, maxConcurrentContexts = 2, recycleAfterContexts = 40 } = {}) {
  const persistentWorkerRuntime = String(process.env.PROCESS_ROLE || '').toLowerCase() === 'worker';
  if (!persistentWorkerRuntime) {
    return new BrowserRuntimePool({ launchBrowser, launchOptions, maxConcurrentContexts, recycleAfterContexts, autoCloseWhenIdle: true });
  }
  const runtimeKey = String(key || 'default');
  let runtime = shared.get(runtimeKey);
  if (!runtime) {
    runtime = new BrowserRuntimePool({ launchBrowser, launchOptions, maxConcurrentContexts, recycleAfterContexts });
    shared.set(runtimeKey, runtime);
  }
  return runtime;
}

export async function closeSharedBrowserRuntimes() {
  const runtimes = [...shared.values()];
  shared.clear();
  await Promise.all(runtimes.map(runtime => runtime.close()));
}