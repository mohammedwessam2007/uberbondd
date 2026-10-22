// Bounded, abortable operations used by both the static and browser witnesses.
export function boundedSignal(parent, milliseconds) {
  if (!Number.isFinite(milliseconds) || milliseconds < 1) throw Error('A positive finite deadline is required');
  return parent ? AbortSignal.any([parent, AbortSignal.timeout(milliseconds)]) : AbortSignal.timeout(milliseconds);
}

export function abortable(promise, signal) {
  if (!signal) return Promise.resolve(promise);
  if (signal.aborted) return Promise.reject(signal.reason ?? Error('ABORTED'));
  return new Promise((resolve, reject) => {
    const abort = () => { signal.removeEventListener('abort', abort); reject(signal.reason ?? Error('ABORTED')); };
    signal.addEventListener('abort', abort, { once: true });
    Promise.resolve(promise).then(value => { signal.removeEventListener('abort', abort); resolve(value); }, error => { signal.removeEventListener('abort', abort); reject(error); });
  });
}

export function unobservableProbe(website, reason, elapsedMs = 0) {
  return {
    ok: false,
    website,
    observedAt: new Date().toISOString(),
    pages: [],
    refusals: [{ url: website, reason }],
    analysis: { verdict: 'NOT_OBSERVABLE_FROM_STATIC_HTML', findings: [], questions: [] },
    readOnlyLedger: { httpGetRequests: 0, robotsRequests: 0, dnsLookups: 0, formSubmissions: 0, messages: 0, spendCents: 0 },
    runtimeMetrics: { wallClockMs: elapsedMs, pagesFetched: 0, witnessUsed: false, peakRssBytes: process.memoryUsage().rss, outcome: reason }
  };
}
