const { test } = require('node:test');
const assert = require('node:assert/strict');
const requestContext = require('../lib/request-context');

function fakeRequest(headers, extra) {
  return Object.assign({
    ip: '1.2.3.4',
    protocol: 'https',
    originalUrl: '/sk/blog/a?utm_source=x',
    get: name => (name === 'host' ? 'example.com' : headers[name])
  }, extra);
}

test('reads IP, user agent, page, referrer and privacy signals', () => {
  const context = requestContext(fakeRequest({
    'user-agent': 'Firefox', referer: 'https://google.com/', 'sec-gpc': '1', dnt: '1'
  }), () => false);
  assert.deepEqual(context, {
    ip: '1.2.3.4',
    userAgent: 'Firefox',
    pageUrl: 'https://example.com/sk/blog/a?utm_source=x',
    referrer: 'https://google.com/',
    globalPrivacyControl: true,
    doNotTrack: true,
    excluded: false
  });
});

test('missing headers mean no signal', () => {
  const context = requestContext(fakeRequest({}), () => false);
  assert.equal(context.userAgent, '');
  assert.equal(context.referrer, '');
  assert.equal(context.globalPrivacyControl, false);
  assert.equal(context.doNotTrack, false);
});

test('excludes nobody without an exclude option', () => {
  const context = requestContext(fakeRequest({}, { me: { id: 1 } }), null);
  assert.equal(context.excluded, false);
});

test('applies the exclude option to the request', () => {
  const context = requestContext(fakeRequest({}, { me: { id: 1 } }), req => Boolean(req.me));
  assert.equal(context.excluded, true);
});
