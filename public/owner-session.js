// Persistent owner session client. The admin token is never stored in the browser:
// after one successful bearer-authenticated /api call the server issues an HttpOnly
// cookie, and later page loads re-connect through that cookie.
(() => {
  const CSRF = 'x-uberbond-owner-csrf';
  const SENTINEL = 'owner-session-cookie';
  const nativeFetch = window.fetch.bind(window);
  let established = false;
  const sameOriginApi = input => {
    try { const u = new URL(typeof input === 'string' ? input : input.url, location.href); return u.origin === location.origin && u.pathname.startsWith('/api/'); }
    catch { return false; }
  };
  const bearerOf = init => {
    const h = init && init.headers; if (!h) return '';
    const raw = typeof h.get === 'function' ? h.get('authorization') : (h.authorization || h.Authorization || '');
    return String(raw || '').startsWith('Bearer ') ? String(raw).slice(7) : '';
  };
  window.fetch = async (input, init = {}) => {
    if (!sameOriginApi(input)) return nativeFetch(input, init);
    const next = { ...init, credentials: 'same-origin', headers: { ...(init.headers && typeof init.headers.forEach === 'function' ? Object.fromEntries(init.headers.entries()) : init.headers || {}), [CSRF]: '1' } };
    const bearer = bearerOf(next);
    const res = await nativeFetch(input, next);
    if (res.ok && bearer && bearer !== SENTINEL && !established) {
      established = true;
      nativeFetch('/api/owner-session/login', { method: 'POST', credentials: 'same-origin', headers: { authorization: `Bearer ${bearer}`, [CSRF]: '1' }, body: '{}' })
        .then(r => { if (r.ok) badge(true); else established = false; }).catch(() => { established = false; });
    }
    return res;
  };
  const badge = active => {
    let el = document.getElementById('owner-session-badge');
    if (!active) { if (el) el.remove(); return; }
    if (!el) {
      el = document.createElement('button');
      el.id = 'owner-session-badge'; el.type = 'button';
      el.style.cssText = 'position:fixed;right:10px;bottom:10px;z-index:99999;font:600 11px system-ui;padding:8px 10px;border-radius:999px;border:1px solid #2a3350;background:#0a0e19;color:#9fe3b0;opacity:.85';
      el.addEventListener('click', async () => {
        await nativeFetch('/api/owner-session/logout', { method: 'POST', credentials: 'same-origin', headers: { [CSRF]: '1' }, body: '{}' });
        established = false; badge(false); location.reload();
      });
      document.body.appendChild(el);
    }
    el.textContent = 'OWNER SESSION ACTIVE · tap to forget this device';
  };
  const connectors = [
    { input: '#owner-token', go: f => f.closest('form')?.requestSubmit() },
    { input: '#tokenInput', go: () => document.getElementById('connectButton')?.click() },
    { input: '#token', go: () => document.getElementById('save-token')?.click() }
  ];
  const autoConnect = () => {
    for (const c of connectors) {
      const field = document.querySelector(c.input);
      if (!field) continue;
      field.value = SENTINEL; c.go(field); established = true; badge(true);
      return;
    }
  };
  window.addEventListener('DOMContentLoaded', async () => {
    try {
      const res = await nativeFetch('/api/owner-session/status', { credentials: 'same-origin', cache: 'no-store' });
      const body = await res.json();
      if (body && body.active) setTimeout(autoConnect, 60);
    } catch { /* offline or no session: manual token entry still works */ }
  });
})();
