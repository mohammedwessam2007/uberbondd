/* Cash Engine Lite — private report viewer. All crawled-site content is
   untrusted and is rendered with textContent only. */
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

  var STAGES = {
    waiting_for_audit_worker: ['Waiting for the audit worker', 'Your request is safely queued. This page will refresh when processing begins.'],
    loading_website: ['Loading your website', 'The audit worker is opening the public website now.'],
    testing_desktop_experience: ['Testing the desktop experience', 'The browser is checking the public desktop page and its visible conversion path.'],
    testing_mobile_experience: ['Testing the mobile experience', 'The browser is checking the same public page in a mobile viewport.'],
    checking_links_and_conversion_paths: ['Checking links and conversion paths', 'The audit is verifying discoverable actions, contact paths, and selected internal links.'],
    generating_findings: ['Generating evidence-backed findings', 'Deterministic checks are evaluating the captured page evidence.'],
    preparing_report: ['Preparing your private report', 'The audit is ranking supported priorities and preparing the report.']
  };

  var token = tokenFromLocation();
  var stateCard = document.getElementById('state');
  var stateTitle = document.getElementById('state-title');
  var stateText = document.getElementById('state-text');
  var reportEl = document.getElementById('report');

  function setState(title, text) {
    stateCard.hidden = false;
    reportEl.hidden = true;
    stateTitle.textContent = title;
    stateText.textContent = text || '';
  }

  function evidenceText(finding) {
    var evidence = finding.evidence || {};
    if (evidence.type === 'measurement') {
      return evidence.metric + ': ' + evidence.value + ' ' + evidence.unit + ' (' + evidence.context + ' observation).';
    }
    if (evidence.type === 'page_metadata' || evidence.type === 'url_observation') {
      return evidence.field + ': ' + evidence.observedValue;
    }
    return finding.evidenceExcerpt || evidence.excerpt || '';
  }

  function findingCard(finding, rank) {
    var card = el('div', 'finding');
    if (rank) card.appendChild(el('div', 'priority-rank', 'Priority ' + rank));
    var top = el('div', 'top');
    top.appendChild(el('span', 'sev s' + Math.min(5, Math.max(1, finding.severity || 1)), 'Severity ' + (finding.severity || 1) + '/5'));
    top.appendChild(el('span', 'catg', (finding.category || 'General') + ' · confidence ' + Math.round((finding.confidence || 0) * 100) + '%'));
    card.appendChild(top);
    card.appendChild(el('h3', null, finding.title || 'Finding'));
    if (finding.whyItMatters || finding.implication) card.appendChild(el('p', null, finding.whyItMatters || finding.implication));
    var ev = el('div', 'evidence');
    var observed = evidenceText(finding);
    if (observed) ev.appendChild(el('div', null, observed));
    if (finding.evidenceUrl) {
      var link = el('a', null, finding.evidenceUrl);
      link.href = finding.evidenceUrl;
      link.rel = 'noopener noreferrer nofollow';
      link.target = '_blank';
      ev.appendChild(link);
    }
    if (ev.childNodes.length) card.appendChild(ev);
    if (finding.service) card.appendChild(el('p', 'fineprint', 'Potential UberBond fix: ' + finding.service));
    return card;
  }

  function populateInterestOptions(options) {
    var select = document.getElementById('lead-interest');
    while (select.options.length > 1) select.remove(1);
    var seen = {};
    options.forEach(function (optionData) {
      if (!optionData || !optionData.code || seen[optionData.code]) return;
      seen[optionData.code] = true;
      var option = document.createElement('option');
      option.value = optionData.code;
      option.textContent = optionData.title + (optionData.service ? ' — ' + optionData.service : '');
      select.appendChild(option);
    });
  }

  function renderReport(report) {
    stateCard.hidden = true;
    reportEl.hidden = false;
    document.getElementById('score').textContent = String(report.score);
    document.getElementById('domain').textContent = report.domain;
    var summary = report.summary || {};
    var findings = report.findings || [];
    var priorities = summary.priorities || [];
    var quickWins = summary.quickWins || [];
    var implementationOptions = summary.implementationOptions || [];
    var rankedTitles = (summary.topFixes || []).filter(function (title) { return typeof title === 'string' && title.trim(); }).slice(0, 3);
    document.getElementById('grade').textContent = summary.grade || '';
    document.getElementById('meta').textContent =
      (summary.pagesVisited || 0) + ' public pages analyzed · ' +
      (summary.findingCount || findings.length) + ' evidence-backed findings · generated ' +
      (summary.generatedAt ? new Date(summary.generatedAt).toLocaleString() : 'recently');
    document.getElementById('cta-context').textContent = rankedTitles.length
      ? 'UberBond can scope and implement these ranked priorities: ' + rankedTitles.join('; ') + '.'
      : 'UberBond can scope and implement the evidence-backed improvements in this report for your business.';

    var prioritySection = document.getElementById('priorities-section');
    var priorityWrap = document.getElementById('priorities');
    priorityWrap.textContent = '';
    prioritySection.hidden = priorities.length === 0;
    priorities.forEach(function (finding, index) { priorityWrap.appendChild(findingCard(finding, index + 1)); });

    var quickSection = document.getElementById('quick-wins-section');
    var quickWrap = document.getElementById('quick-wins');
    quickWrap.textContent = '';
    quickSection.hidden = quickWins.length === 0;
    quickWins.forEach(function (finding) {
      var item = el('div', 'quick-win');
      item.appendChild(el('b', null, finding.title));
      item.appendChild(el('span', null, finding.quickWinReason || 'Supported by high-confidence audit evidence.'));
      quickWrap.appendChild(item);
    });

    var priorityCodes = {};
    priorities.forEach(function (finding) { priorityCodes[finding.code] = true; });
    var additional = findings.filter(function (finding) { return !priorityCodes[finding.code]; });
    var findingsSection = document.getElementById('findings-section');
    var findingsTitle = document.getElementById('findings-title');
    var findingsWrap = document.getElementById('findings');
    findingsWrap.textContent = '';
    if (!findings.length) {
      findingsTitle.textContent = 'Audit result';
      var clean = el('div', 'finding');
      clean.appendChild(el('h3', null, 'No high-confidence issues detected'));
      clean.appendChild(el('p', null, 'The public pages analyzed did not produce a supported automated finding. A human review may still identify opportunities outside these deterministic checks.'));
      findingsWrap.appendChild(clean);
      findingsSection.hidden = false;
    } else if (!additional.length) {
      findingsSection.hidden = true;
    } else {
      findingsTitle.textContent = priorities.length ? 'Additional evidence-backed findings' : 'Evidence-backed findings';
      additional.forEach(function (finding) { findingsWrap.appendChild(findingCard(finding)); });
      findingsSection.hidden = false;
    }
    populateInterestOptions(implementationOptions);
  }

  function schedulePoll(status) {
    setTimeout(poll, status === 'running' ? 5000 : 15000);
  }

  function poll() {
    if (!token) return setState('Invalid link', 'This report link is malformed. Please re-check the address you saved.');
    fetch('/api/report?token=' + encodeURIComponent(token))
      .then(function (res) { return res.json().then(function (data) { return { res: res, data: data }; }); })
      .then(function (result) {
        var data = result.data || {};
        if (result.res.status === 404) return setState('Report not found', 'Check the private link and try again, or run a fresh audit from the home page.');
        if (!result.res.ok || !data.ok) throw new Error('load failed');
        if (data.status === 'done') return renderReport(data.report);
        if (data.status === 'failed') return setState('Audit could not complete', data.message || 'The website could not be audited automatically after the available retries.');
        var copy = STAGES[data.processingStage] || STAGES.waiting_for_audit_worker;
        setState(copy[0], copy[1]);
        schedulePoll(data.status);
      })
      .catch(function () {
        setState('Connection issue', 'We could not load the report right now. This page will retry automatically.');
        setTimeout(poll, 15000);
      });
  }

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
        selectedIssueCode: document.getElementById('lead-interest').value,
        name: document.getElementById('lead-name').value,
        email: document.getElementById('lead-email').value,
        message: document.getElementById('lead-message').value
      })
    })
      .then(function (res) { return res.json().then(function (data) { return { res: res, data: data }; }); })
      .then(function (result) {
        if (!result.res.ok || !result.data.ok) throw new Error(result.data && result.data.error ? result.data.error : 'Please try again.');
        document.getElementById('cta').hidden = true;
        document.getElementById('cta-done-text').textContent = result.data.message || 'Your implementation request is stored.';
        document.getElementById('cta-done').hidden = false;
      })
      .catch(function (error) {
        leadError.textContent = error.message || 'Please try again.';
        leadError.hidden = false;
      })
      .finally(function () { leadSubmit.disabled = false; });
  });

  poll();
})();
