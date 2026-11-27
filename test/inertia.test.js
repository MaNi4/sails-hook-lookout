/**
 * Integration test: Inertia.js pages (The Boring JavaScript Stack), with the real
 * inertia-sails hook in a minimal Sails app. The event travels in the `lookout`
 * page prop, on the first load and on client-side (XHR) visits.
 *
 * Skipped where inertia-sails is not installed (a dev dependency of this package).
 */
const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { BROWSER, memoryAdapter, lift, lower, postEvent } = require('./support/sails-app');

let inertiaSails = null;
try {
  inertiaSails = require('inertia-sails');
} catch (_err) {
  // optional, see above
}

const viewPost = {
  exits: { success: { responseType: 'inertia' } },
  lookout: { name: 'post:view', properties: ({ post }) => ({ postId: post.id }) },
  fn: async function () {
    return { page: 'post', props: { post: { id: 3, title: 'Hello' } } };
  }
};

describe('Inertia pages', { skip: !inertiaSails && 'inertia-sails is not installed' }, () => {
  let app;
  let adapter;
  let baseUrl;
  let version;

  before(async () => {
    adapter = memoryAdapter();
    app = await lift({
      appPath: path.join(__dirname, 'fixtures', 'inertia-app'),
      actions: {
        'view-post': viewPost,
        'view-home': { exits: { success: { responseType: 'inertia' } }, fn: async () => ({ page: 'home' }) }
      },
      adapter: adapter,
      hooks: { inertia: inertiaSails }
    });
    baseUrl = `http://localhost:${app.config.port}`;
    version = (await firstLoad('/post')).version;
  });

  after(() => lower(app));

  async function firstLoad(pathname, userAgent = BROWSER) {
    const html = await (await fetch(baseUrl + pathname, { headers: { 'user-agent': userAgent } })).text();
    return JSON.parse(html.match(/data-page="app">(.*?)<\/script>/)[1]);
  }

  async function visit(pathname, headers = {}) {
    const res = await fetch(baseUrl + pathname, {
      headers: Object.assign({ 'user-agent': BROWSER, 'x-inertia': 'true', 'x-inertia-version': String(version) }, headers)
    });
    assert.equal(res.status, 200);
    return res.json();
  }

  test('the first load of a declared page carries its event as the `lookout` prop', async () => {
    const page = await firstLoad('/post');
    assert.equal(page.component, 'post');
    assert.deepEqual(page.props.post, { id: 3, title: 'Hello' });
    assert.equal(typeof page.props.lookout.event, 'string');
  });

  test('a client-side visit carries it too, and the event is recorded', async () => {
    const page = await visit('/post');
    const before = adapter.events.length;
    assert.equal((await postEvent(app, page.props.lookout.event)).status, 204);
    assert.equal(adapter.events.length, before + 1);
    assert.equal(adapter.events[before].name, 'post:view');
    assert.deepEqual(adapter.events[before].properties, { postId: 3 });
  });

  test('partial reloads, undeclared pages and bots get no event', async () => {
    assert.equal((await visit('/post', { 'x-inertia-partial-data': 'post', 'x-inertia-partial-component': 'post' })).props.lookout, undefined);
    assert.equal((await visit('/home')).props.lookout, undefined);
    assert.equal((await firstLoad('/post', 'Googlebot/2.1 (+http://www.google.com/bot.html)')).props.lookout, undefined);
  });

  test('the root view gets no script tag of its own: the app loads the script', async () => {
    const html = await (await fetch(`${baseUrl}/post`, { headers: { 'user-agent': BROWSER } })).text();
    assert.equal((html.match(/lookout\.js/g) || []).length, 1);
    assert.doesNotMatch(html, /data-event=/);
  });
});
