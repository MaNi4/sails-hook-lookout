const { test } = require('node:test');
const assert = require('node:assert/strict');
const createViewTracking = require('../lib/view-tracking');

const PAGE = '<html><body>page</body></html>';

function setup({ declaration = { name: 'blog:view', properties: ({ blog }) => ({ blogId: blog.id }) }, track = true } = {}) {
  const warnings = [];
  const wrapView = createViewTracking({
    findDeclaration: identity => (identity === 'blogs/view-one-blog' ? declaration : undefined),
    contextFor: () => ({ pageUrl: 'https://example.com/sk/blog/a', referrer: 'https://www.google.com/search?q=x' }),
    shouldTrack: () => track,
    signer: { sign: payload => `signed:${JSON.stringify(payload)}` },
    scriptSrc: '/lookout.js',
    warn: message => warnings.push(message)
  });

  function render(action, args, statusCode = 200) {
    const res = {
      statusCode: statusCode,
      locals: { _csrf: 'tok' },
      sent: null,
      passedThrough: null,
      send: function (html) { this.sent = html; },
      serverError: function (err) { this.sent = `error:${err.message}`; },
      view: function () {
        const cb = arguments[2];
        if (typeof cb === 'function') {
          return cb(null, PAGE);
        }
        this.passedThrough = Array.from(arguments);
      }
    };
    wrapView({ options: { action: action } }, res);
    res.view.apply(res, args);
    return res;
  }

  return { render, warnings };
}

test('adds the declared event, signed, to pages of declaring actions', () => {
  const res = setup().render('blogs/view-one-blog', ['pages/one-blog', { blog: { id: 2 } }]);
  const event = res.sent.match(/data-event="signed:([^"]*)"/)[1].replace(/&quot;/g, '"');
  assert.deepEqual(JSON.parse(event), {
    name: 'blog:view',
    properties: { blogId: 2 },
    visit: { landingPage: '/sk/blog/a', referringDomain: 'google.com', utmSource: null, utmMedium: null, utmCampaign: null }
  });
  assert.ok(res.sent.includes('data-csrf="tok"'));
});

test('without `properties` the event has none', () => {
  const res = setup({ declaration: { name: 'blog:view' } }).render('blogs/view-one-blog', ['pages/one-blog']);
  assert.ok(res.sent.includes('&quot;properties&quot;:{}'));
});

test('leaves other pages, error pages and untracked requests alone', () => {
  assert.ok(setup().render('blogs/view-blogs', ['pages/blogs', {}]).passedThrough);
  assert.ok(setup().render('blogs/view-one-blog', ['404', {}], 404).passedThrough);
  assert.ok(setup({ track: false }).render('blogs/view-one-blog', ['pages/one-blog', { blog: { id: 2 } }]).passedThrough);
});

test('a failing or invalid declaration renders the page without tracking and warns', () => {
  const failing = setup({ declaration: { name: 'blog:view', properties: () => { throw new Error('boom'); } } });
  assert.ok(failing.render('blogs/view-one-blog', ['pages/one-blog', {}]).passedThrough);
  assert.match(failing.warnings[0], /boom/);

  const invalid = setup({ declaration: { name: 'blog:view', properties: () => ({ nested: { a: 1 } }) } });
  assert.ok(invalid.render('blogs/view-one-blog', ['pages/one-blog', {}]).passedThrough);
  assert.equal(invalid.warnings.length, 1);
});
