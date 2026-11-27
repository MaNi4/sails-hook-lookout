const { test } = require('node:test');
const assert = require('node:assert/strict');
const injectScriptTag = require('../lib/script-tag');

test('adds the script before the closing body tag', () => {
  const html = injectScriptTag('<html><body><p>Hi</p></body></html>', { src: '/lookout.js', event: 'abc.def', csrf: 'tok' });
  assert.equal(html, '<html><body><p>Hi</p><script src="/lookout.js" defer data-event="abc.def" data-csrf="tok"></script></body></html>');
});

test('uses the last closing body tag (a </body> inside the content is not the end)', () => {
  const html = injectScriptTag('<body><pre>&lt;/body&gt;</body></body>', { src: '/l.js', event: 'e' });
  assert.ok(html.endsWith('<script src="/l.js" defer data-event="e"></script></body>'));
});

test('escapes attribute values', () => {
  const html = injectScriptTag('<body></body>', { src: '/l.js', event: '"><script>alert(1)</script>', csrf: '\'&' });
  assert.ok(!html.includes('<script>alert'));
  assert.ok(html.includes('data-event="&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;"'));
  assert.ok(html.includes('data-csrf="&#39;&amp;"'));
});

test('leaves a page without body untouched', () => {
  assert.equal(injectScriptTag('{"json":true}', { src: '/l.js', event: 'e' }), '{"json":true}');
});
