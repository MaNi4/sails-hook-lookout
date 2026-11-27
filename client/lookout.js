/**
 * Lookout client. Delivers the signed event of a page view once the page is
 * visible. Stores nothing in the browser.
 *
 * Events come from the server, in one of two ways:
 * - pages rendered with res.view: in `data-event` of this script tag, which the
 *   server adds to those pages;
 * - Inertia.js apps: in the `lookout` prop of each page, read from Inertia's
 *   `inertia:navigate` event (first load and every client-side visit). The app
 *   loads this script itself, in its root view, right before the app's own
 *   scripts and without `defer`: it must listen before Inertia shows the first page.
 */
(function () {
  'use strict';

  var script = document.currentScript;
  if (!script) {
    return;
  }

  // Automated browsers and visitors who opted out send nothing.
  if (navigator.webdriver === true ||
      navigator.globalPrivacyControl === true ||
      navigator.doNotTrack === '1' ||
      window.doNotTrack === '1') {
    return;
  }

  // Each event is sent once, so going back to a page Inertia restores from history
  // does not count it again: a page view is one page the server rendered.
  var sent = {};

  function send(event, csrf) {
    var body = new URLSearchParams({ event: event, _csrf: csrf || '' });
    if (navigator.sendBeacon && navigator.sendBeacon('/lookout/events', body)) {
      return;
    }
    fetch('/lookout/events', { method: 'POST', body: body, credentials: 'same-origin', keepalive: true })
      .catch(function () {});
  }

  function deliver(event, csrf) {
    if (!event || sent[event]) {
      return;
    }
    sent[event] = true;

    if (document.visibilityState === 'visible') {
      send(event, csrf);
      return;
    }
    document.addEventListener('visibilitychange', function onChange() {
      if (document.visibilityState === 'visible') {
        document.removeEventListener('visibilitychange', onChange);
        send(event, csrf);
      }
    });
  }

  deliver(script.dataset.event, script.dataset.csrf);

  document.addEventListener('inertia:navigate', function (e) {
    var page = e.detail && e.detail.page;
    var lookout = page && page.props && page.props.lookout;
    if (lookout && typeof lookout === 'object') {
      deliver(lookout.event, lookout.csrf);
    }
  });
})();
