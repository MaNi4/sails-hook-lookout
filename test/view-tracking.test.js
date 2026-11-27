const { test } = require('node:test');
const assert = require('node:assert/strict');
const createViewTracking = require('../lib/view-tracking');

const PAGE = '<html><body>page</body></html>';
const DECLARATIONS = {
  'blogs/view-one-blog': { name: 'blog:view', renderer: 'view' },
  'home/view-home': { name: 'home:view', renderer: 'inertia' }
};

function setup({ event = 'signed-event' } = {}) {
  const calls = [];
  const wrapView = createViewTracking({
    findDeclaration: identity => DECLARATIONS[identity],
    pageEvent: (req, declaration, action, locals) => {
      calls.push({ declaration, action, locals });
      return event;
    },
    scriptSrc: '/lookout.js'
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

  return { render, calls };
}

test('adds the script with the event and CSRF token to pages of declaring actions', () => {
  const { render, calls } = setup();
  const res = render('blogs/view-one-blog', ['pages/one-blog', { blog: { id: 2 } }]);
  assert.equal(res.sent, '<html><body>page<script src="/lookout.js" defer data-event="signed-event" data-csrf="tok"></script></body></html>');
  assert.deepEqual(calls[0].locals, { blog: { id: 2 } });
  assert.equal(calls[0].action, 'blogs/view-one-blog');
});

test('leaves other pages and error pages alone', () => {
  assert.ok(setup().render('blogs/view-blogs', ['pages/blogs', {}]).passedThrough);
  assert.ok(setup().render('blogs/view-one-blog', ['404', {}], 404).passedThrough);
});

test('leaves the root view of Inertia actions alone: their event is a page prop', () => {
  const { render, calls } = setup();
  assert.ok(render('home/view-home', ['app', { page: {} }]).passedThrough);
  assert.equal(calls.length, 0);
});

test('renders the page unchanged when there is no event', () => {
  assert.ok(setup({ event: null }).render('blogs/view-one-blog', ['pages/one-blog', {}]).passedThrough);
});

test('passes other res.view call forms through', () => {
  const { render, calls } = setup();
  assert.ok(render('blogs/view-one-blog', ['pages/one-blog', {}, () => {}]));
  assert.equal(calls.length, 0);
});
