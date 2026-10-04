// One-button G-SPOT ignition for Revenue Constellation.
// It intentionally stops at AWAITING_OWNER_AUTHORIZATION. This controller has
// no authorization call and no dispatch call, so one-click convenience cannot
// silently become consequence authority.
(() => {
  'use strict';
  const button = document.getElementById('gs-plan');
  const note = document.getElementById('gs-note');
  const live = document.getElementById('live');
  if (!button || !note) return;

  const say = text => { note.textContent = String(text || ''); };
  const post = async (path, body = {}) => {
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store'
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || payload.state || response.statusText || `HTTP ${response.status}`);
    return payload;
  };

  button.onclick = async () => {
    if (button.disabled) return;
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    try {
      say('G-SPOT is compiling the governed Money Queue, advancing every evidence-satisfied stage, and freezing the strongest safe batch…');
      const planned = await post('/api/revenue/gspot/plan', {});
      const runId = String(planned?.runId || planned?.run?.runId || '');
      if (!runId) throw new Error('G-SPOT plan returned no durable run id');

      const prepared = await post('/api/revenue/gspot/prepare-batch', { runId });
      const count = Array.isArray(prepared?.batch?.items) ? prepared.batch.items.length : 0;
      if (count > 0) {
        say(`G-SPOT prepared ${count} prospect${count === 1 ? '' : 's'}. Review the frozen batch and authorize its exact digest when you are ready. No message has been sent.`);
      } else {
        say('G-SPOT completed the safe pipeline, but nothing currently satisfies every gate. No quota was filled with weaker prospects and nothing was sent.');
      }
      live?.click();
    } catch (error) {
      say(`G-SPOT stopped safely: ${String(error?.message || error).slice(0, 240)}`);
    } finally {
      button.disabled = false;
      button.removeAttribute('aria-busy');
    }
  };
})();
