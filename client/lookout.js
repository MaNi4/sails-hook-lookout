/**
 * Lookout client. Added by the server to pages that are tracked; delivers
 * the signed event once the page is visible. Stores nothing in the browser.
 */
(function () {
  'use strict';

  var script = document.currentScript;
  if (!script || !script.dataset.event) {
    return;
  }

  // Automated browsers and visitors who opted out send nothing.
  if (navigator.webdriver === true ||
      navigator.globalPrivacyControl === true ||
      navigator.doNotTrack === '1' ||
      window.doNotTrack === '1') {
    return;
  }

  var body = new URLSearchParams({ event: script.dataset.event, _csrf: script.dataset.csrf || '' });

  function send() {
    if (navigator.sendBeacon && navigator.sendBeacon('/lookout/events', body)) {
      return;
    }
    fetch('/lookout/events', { method: 'POST', body: body, credentials: 'same-origin', keepalive: true })
      .catch(() => {});
  }

  if (document.visibilityState === 'visible') {
    send();
  } else {
    document.addEventListener('visibilitychange', function onChange() {
      if (document.visibilityState === 'visible') {
        document.removeEventListener('visibilitychange', onChange);
        send();
      }
    });
  }
})();
