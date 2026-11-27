const { test } = require('node:test');
const assert = require('node:assert/strict');
const createPageEvent = require('../lib/page-event');

const declaration = { name: 'blog:view', properties: ({ blog }) => ({ blogId: blog.id }) };

function setup({ track = true } = {}) {
  const warnings = [];
  const pageEvent = createPageEvent({
    contextFor: () => ({ pageUrl: 'https://example.com/sk/blog/a?q=1', referrer: 'https://www.google.com/search?q=x' }),
    shouldTrack: () => track,
    signer: { sign: payload => payload },
    warn: message => warnings.push(message)
  });
  return { pageEvent, warnings };
}

test('signs the declared name, its properties and the visit', () => {
  assert.deepEqual(setup().pageEvent({}, declaration, 'blogs/view-one-blog', { blog: { id: 2 } }), {
    name: 'blog:view',
    properties: { blogId: 2 },
    visit: { landingPage: '/sk/blog/a', referringDomain: 'google.com', utmSource: null, utmMedium: null, utmCampaign: null }
  });
});

test('without `properties` the event has none', () => {
  assert.deepEqual(setup().pageEvent({}, { name: 'faq:view' }, 'faq/view-faq', undefined).properties, {});
});

test('untracked requests get no event', () => {
  assert.equal(setup({ track: false }).pageEvent({}, declaration, 'blogs/view-one-blog', { blog: { id: 2 } }), null);
});

test('a failing or invalid `properties` gives no event and warns', () => {
  const { pageEvent, warnings } = setup();
  const failing = { name: 'blog:view', properties: () => { throw new Error('boom'); } };
  assert.equal(pageEvent({}, failing, 'blogs/view-one-blog', {}), null);
  assert.match(warnings[0], /"blogs\/view-one-blog" failed: boom/);

  const nested = { name: 'blog:view', properties: () => ({ nested: { a: 1 } }) };
  assert.equal(pageEvent({}, nested, 'blogs/view-one-blog', {}), null);
  assert.match(warnings[1], /flat object/);
});
