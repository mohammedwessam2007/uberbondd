/* Cash Engine Lite — landing form. Same-origin API only; no keys in the browser. */
(function () {
  var website = document.getElementById('website');
  var email = document.getElementById('email');
  var submit = document.getElementById('submit');
  var errorEl = document.getElementById('error');
  var formCard = document.getElementById('form-card');
  var successCard = document.getElementById('success-card');
  var linkEl = document.getElementById('report-link');
  var copyBtn = document.getElementById('copy');

  function showError(message) {
    errorEl.textContent = message;
    errorEl.hidden = false;
  }

  submit.addEventListener('click', function () {
    errorEl.hidden = true;
    submit.disabled = true;
    submit.textContent = 'Queuing your audit…';
    fetch('/api/request-audit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ website: website.value, email: email.value })
    })
      .then(function (res) { return res.json().then(function (data) { return { res: res, data: data }; }); })
      .then(function (result) {
        if (!result.res.ok || !result.data.ok) {
          throw new Error(result.data && result.data.error ? result.data.error : 'Something went wrong. Please try again.');
        }
        var url = location.origin + result.data.reportPath;
        linkEl.textContent = url;
        linkEl.href = result.data.reportPath;
        formCard.hidden = true;
        successCard.hidden = false;
        successCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
      })
      .catch(function (err) {
        showError(err.message || 'Something went wrong. Please try again.');
      })
      .finally(function () {
        submit.disabled = false;
        submit.textContent = 'Run my free audit';
      });
  });

  copyBtn.addEventListener('click', function () {
    var text = linkEl.textContent;
    (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject())
      .then(function () { copyBtn.textContent = 'Copied ✓'; })
      .catch(function () { copyBtn.textContent = 'Copy manually'; });
    setTimeout(function () { copyBtn.textContent = 'Copy link'; }, 2500);
  });
})();
