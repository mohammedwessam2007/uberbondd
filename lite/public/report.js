/* Cash Engine Lite — private report viewer. All dynamic text rendered via
   textContent (crawled-site excerpts are untrusted). */
(function () {
  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function tokenFromLocation() {
    var match = location.pathname.match(/\/r\/([A-Za-z0-9_-]{24,100})/);
    if (match) return match[1];
    var qs = new URLSearchParams(location.search).get('token') || '';
    return /^[A-Za-z0-9_-]{24,100}$/.test(qs) ? qs : '';
  }

  var token = tokenFromLocation();
  var stateCard = document.getElementById('state');
  var stateTitle = document.getElementById('state-title');
  var stateText = document.getElementById('state-text');
  var reportEl = document.getElementById('report');
  var polls = 0;

  function setState(title, text) {
    stateCard.hidden = false;
    reportEl.hidden = true;
    stateTitle.textContent = title;
    stateText.textContent = text || '';
  }

  function renderReport(report) {
    stateCard.hidden = true;
    reportEl.hidden = false;
    document.getElementById('score').textContent = String(report.score);
    document.getElementById('domain').textContent = report.domain;
    var summary = report.summary || {};
    document.getElementById('grade').textContent = summary.grade || '';
    document.getElementById('meta').textContent =
      (summary.pagesVisited || 0) + ' public pages analyzed · ' +
      (summary.findingCount || (report.findings || []).length) + ' findings · generated ' +
      (summary.generatedAt ? new Date(summary.generatedAt).toLocaleString() : '');

    var wrap = document.getElementById('findings');
    wrap.textContent = '';
    var findings = report.findings || [];
    if (!findings.length) {
      var clean = el('div', 'finding');
      clean.appendChild(el('h3', null, 'No high-confidence issues detected'));
      clean.appendChild(el('p', null, 'The public pages we analyzed passed all twelve automated checks. A human strategy review can still surface positioning and conversion upside.'));
      wrap.appendChild(clean);
      return;
    }
    findings.forEach(function (f) {
      var card = el('div', 'finding');
      var top = el('div', 'top');
      top.appendChild(el('span', 'sev s' + Math.min(5, Math.max(1, f.severity || 1)), 'Severity ' + (f.severity || 1) + '/5'));
      top.appendChild(el('span', 'catg', (f.category || 'General') + ' · confidence ' + Math.round((f.confidence || 0) * 100) + '%'));
      card.appendChild(top);
      card.appendChild(el('h3', null, f.title || 'Finding'));
      if (f.implication) card.appendChild(el('p', null, f.implication));
      var ev = el('div', 'evidence');
      if (f.evidenceExcerpt) ev.appendChild(el('div', null, '“' + f.evidenceExcerpt + '”'));
      if (f.evidenceUrl) {
        var a = el('a', null, f.evidenceUrl);
        a.href = f.evidenceUrl; a.rel = 'noopener noreferrer nofollow'; a.target = '_blank';
        ev.appendChild(a);
      }
      if (ev.childNodes.length) card.appendChild(ev);
      if (f.service) card.appendChild(el('p', 'fineprint', 'UberBond fix: ' + f.service));
      wrap.appendChild(card);
    });
  }

  function poll() {
    if (!token) return setState('Invalid link', 'This report link is malformed. Please re-check the address you saved.');
    fetch('/api/report?token=' + encodeURIComponent(token))
      .then(function (res) { return res.json().then(function (data) { return { res: res, data: data }; }); })
      .then(function (result) {
        var data = result.data || {};
        if (result.res.status === 404) return setState('Report not found', 'Check the link and try again, or run a fresh audit from the home page.');
        if (!result.res.ok || !data.ok) throw new Error(data.error || 'load failed');
        if (data.status === 'done') return renderReport(data.report);
        if (data.status === 'failed') return setState('Audit could not complete', data.message || 'The site may block automated crawlers or be temporarily unreachable.');
        setState(
          data.status === 'running' ? 'Audit in progress…' : 'Audit queued',
          'This page refreshes itself. Audits run on a schedule — your report is usually ready within the hour.'
        );
        polls++;
        if (polls < 90) setTimeout(poll, 25000);
        else setState('Still working', 'This is taking longer than usual. Keep this link — the report will appear here once ready.');
      })
      .catch(function () {
        setState('Connection issue', 'We could not load the report right now. This page will retry.');
        polls++;
        if (polls < 90) setTimeout(poll, 25000);
      });
  }

  // Lead form
  var leadSubmit = document.getElementById('lead-submit');
  var leadError = document.getElementById('lead-error');
  leadSubmit.addEventListener('click', function () {
    leadError.hidden = true;
    leadSubmit.disabled = true;
    fetch('/api/interest', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        token: token,
        name: document.getElementById('lead-name').value,
        email: document.getElementById('lead-email').value,
        message: document.getElementById('lead-message').value
      })
    })
      .then(function (res) { return res.json().then(function (data) { return { res: res, data: data }; }); })
      .then(function (result) {
        if (!result.res.ok || !result.data.ok) throw new Error(result.data && result.data.error ? result.data.error : 'Please try again.');
        document.getElementById('cta').hidden = true;
        document.getElementById('cta-done').hidden = false;
      })
      .catch(function (err) {
        leadError.textContent = err.message || 'Please try again.';
        leadError.hidden = false;
      })
      .finally(function () { leadSubmit.disabled = false; });
  });

  poll();
})();
