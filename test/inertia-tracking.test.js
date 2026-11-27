const { test } = require('node:test');
const assert = require('node:assert/strict');
const createInertiaTracking = require('../lib/inertia-tracking');

const DECLARATIONS = {
  'blog/view-post': { name: 'blog:view', renderer: 'inertia' },
  'blogs/view-one-blog': { name: 'blog:view', renderer: 'view' }
};

function setup({ event = 'signed-event' } = {}) {
  const calls = [];
  const warnings = [];
  const wrapInertia = createInertiaTracking({
    findDeclaration: identity => DECLARATIONS[identity],
    pageEvent: (req, declaration, action, props) => {
      calls.push({ declaration, action, props });
      return event;
    },
    warn: message => warnings.push(message)
  });

  function respond(action, data, { headers = {}, statusCode = 200, csrf = 'tok' } = {}) {
    const res = {
      statusCode: statusCode,
      locals: csrf ? { _csrf: csrf } : {},
      received: null,
      inertia: function (d) { this.received = d; }
    };
    wrapInertia({ options: { action: action }, get: name => headers[name] }, res);
    res.inertia(data);
    return res;
  }

  return { respond, calls, warnings };
}

test('adds the event and CSRF token as the `lookout` prop of declared pages', () => {
  const { respond, calls } = setup();
  const res = respond('blog/view-post', { page: 'blog/post', props: { post: { id: 3 } } });
  assert.deepEqual(res.received, {
    page: 'blog/post',
    props: { post: { id: 3 }, lookout: { event: 'signed-event', csrf: 'tok' } }
  });
  assert.deepEqual(calls[0].props, { post: { id: 3 } });
});

test('works for pages without props and apps without CSRF', () => {
  const res = setup().respond('blog/view-post', { page: 'blog/post' }, { csrf: null });
  assert.deepEqual(res.received.props, { lookout: { event: 'signed-event' } });
});

test('does not change the data the action returned', () => {
  const data = { page: 'blog/post', props: { post: { id: 3 } } };
  setup().respond('blog/view-post', data);
  assert.deepEqual(data, { page: 'blog/post', props: { post: { id: 3 } } });
});

test('never overwrites a `lookout` prop of the app: warns and does not track', () => {
  const { respond, calls, warnings } = setup();
  const data = { page: 'blog/post', props: { lookout: 'own' } };
  assert.equal(respond('blog/view-post', data).received, data);
  assert.equal(calls.length, 0);
  assert.match(warnings[0], /"blog\/view-post" returns a `lookout` prop/);
});

test('partial reloads are not page views', () => {
  const { respond, calls } = setup();
  const data = { page: 'blog/post', props: {} };
  assert.equal(respond('blog/view-post', data, { headers: { 'x-inertia-partial-data': 'comments' } }).received, data);
  assert.equal(calls.length, 0);
});

test('leaves undeclared actions, res.view actions, errors and untracked requests alone', () => {
  const data = { page: 'x', props: {} };
  assert.equal(setup().respond('home/view-home', data).received, data);
  assert.equal(setup().respond('blogs/view-one-blog', data).received, data);
  assert.equal(setup().respond('blog/view-post', data, { statusCode: 404 }).received, data);
  assert.equal(setup({ event: null }).respond('blog/view-post', data).received, data);
});

test('does nothing when the app has no Inertia response', () => {
  const res = {};
  createInertiaTracking({ findDeclaration: () => undefined, pageEvent: () => null, warn: () => {} })({}, res);
  assert.equal(res.inertia, undefined);
});
