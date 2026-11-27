const { test } = require('node:test');
const assert = require('node:assert/strict');
const visitProperties = require('../lib/visit-properties');

test('keeps the path and utm parameters, drops the rest of the query string', () => {
  const visit = visitProperties({
    pageUrl: 'https://example.com/sk/blog/a?email=jan@example.com&utm_source=newsletter&utm_medium=email&utm_campaign=nov',
    referrer: ''
  });
  assert.deepEqual(visit, {
    landingPage: '/sk/blog/a',
    referringDomain: null,
    utmSource: 'newsletter',
    utmMedium: 'email',
    utmCampaign: 'nov'
  });
});

test('stores only the domain of an external referrer', () => {
  const visit = visitProperties({
    pageUrl: 'https://example.com/sk/blog/a',
    referrer: 'https://www.google.com/search?q=private+question'
  });
  assert.equal(visit.referringDomain, 'google.com');
  assert.ok(!JSON.stringify(visit).includes('search'));
});

test('internal referrer is ignored', () => {
  const visit = visitProperties({ pageUrl: 'https://example.com/sk/blog/a', referrer: 'https://example.com/sk/blog' });
  assert.equal(visit.referringDomain, null);
});

test('invalid or non-http URLs are ignored', () => {
  const visit = visitProperties({ pageUrl: 'javascript:alert(1)', referrer: 'not a url' });
  assert.equal(visit.landingPage, null);
  assert.equal(visit.referringDomain, null);
});
