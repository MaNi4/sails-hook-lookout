/**
 * Integration test: pages rendered with res.view, in a real, minimal Sails app.
 *
 * It covers what the unit tests cannot: that Sails exposes the `lookout` key of an
 * action definition (`action.toJSON()`) and that wrapping `res.view` works in Sails.
 * Neither is documented Sails API, so this test is what catches a Sails upgrade
 * that breaks them.
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { BROWSER, memoryAdapter, lift, lower, postEvent } = require('./support/sails-app');

const APP_PATH = path.join(__dirname, 'fixtures', 'app');

const viewArticle = {
  exits: { success: { viewTemplatePath: 'pages/article' } },
  lookout: { name: 'article:view', properties: ({ id }) => ({ articleId: id }) },
  fn: async function () {
    return { id: 7, title: 'Hello' };
  }
};

function liftApp(actions, adapter, lookout) {
  return lift({ appPath: APP_PATH, actions: actions, adapter: adapter, lookout: lookout });
}

let app;
let adapter;
let baseUrl;

before(async () => {
  adapter = memoryAdapter();
  app = await liftApp({
    'view-article': viewArticle,
    'view-plain': { exits: { success: { viewTemplatePath: 'pages/article' } }, fn: async () => ({ title: 'Plain' }) }
  }, adapter);
  baseUrl = `http://localhost:${app.config.port}`;
});

after(() => lower(app));

async function signedEventFrom(pathname, userAgent = BROWSER) {
  const html = await (await fetch(baseUrl + pathname, { headers: { 'user-agent': userAgent } })).text();
  const match = html.match(/<script src="\/lookout\.js" defer data-event="([^"]+)"/);
  return { html, event: match && match[1] };
}

test('a declared action page gets the script and its event is recorded', async () => {
  const { html, event } = await signedEventFrom('/article');
  assert.match(html, /<h1>Hello<\/h1>/);
  assert.ok(event, 'script tag with a signed event');

  const res = await postEvent(app, event);
  assert.equal(res.status, 204);
  assert.equal(adapter.events.length, 1);
  assert.equal(adapter.events[0].name, 'article:view');
  assert.deepEqual(adapter.events[0].properties, { articleId: 7 });
  assert.deepEqual(await app.hooks.lookout.count({ name: 'article:view', days: 1 }), { visitors: 1, events: 1 });
});

test('an event sent twice is recorded once', async () => {
  const before = adapter.events.length;
  const { event } = await signedEventFrom('/article');
  assert.equal((await postEvent(app, event)).status, 204);
  assert.equal((await postEvent(app, event)).status, 204);
  assert.equal(adapter.events.length, before + 1);
});

test('pages without a declaration and bots get no script', async () => {
  assert.equal((await signedEventFrom('/plain')).event, null);
  assert.equal((await signedEventFrom('/article', 'Googlebot/2.1 (+http://www.google.com/bot.html)')).event, null);
});

test('a forged event is rejected', async () => {
  assert.equal((await postEvent(app, 'forged.token')).status, 400);
});

test('the client script is served', async () => {
  const res = await fetch(`${baseUrl}/lookout.js`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /javascript/);
});

test('an invalid declaration stops the lift', async () => {
  const broken = Object.assign({}, viewArticle, { lookout: { properties: () => ({}) } });
  await assert.rejects(async () => {
    // Lower it should it lift after all, so a regression fails instead of hanging.
    await lower(await liftApp({ 'view-article': broken }, memoryAdapter()));
  }, /Action "view-article"/);
});

test('an invalid maxEventsPerVisit stops the lift', async () => {
  for (const maxEventsPerVisit of [0, 2.5, '100']) {
    await assert.rejects(async () => {
      await lower(await liftApp({ 'view-article': viewArticle }, memoryAdapter(), { maxEventsPerVisit }));
    }, /`maxEventsPerVisit` must be a positive integer or null/);
  }
});

test('migrations run at lift; with migrate: false and some pending, nothing is tracked', async () => {
  const migrating = Object.assign(memoryAdapter(), { migrate: async () => { migrating.migrated = true; return []; } });
  const migratingApp = await liftApp({ 'view-article': viewArticle }, migrating);
  try {
    assert.equal(migrating.migrated, true);
  } finally {
    await lower(migratingApp);
  }

  const behind = Object.assign(memoryAdapter(), {
    migrate: async () => { throw new Error('must not migrate'); },
    pendingMigrations: async () => ['002-event-uuid']
  });
  const behindApp = await liftApp({ 'view-article': viewArticle }, behind, { migrate: false });
  try {
    const html = await (await fetch(`http://localhost:${behindApp.config.port}/article`, { headers: { 'user-agent': BROWSER } })).text();
    assert.match(html, /<h1>Hello<\/h1>/);
    assert.doesNotMatch(html, /data-event/);
  } finally {
    await lower(behindApp);
  }
});

test('a migrate that is not a boolean stops the lift', async () => {
  await assert.rejects(async () => {
    await lower(await liftApp({ 'view-article': viewArticle }, memoryAdapter(), { migrate: 'yes' }));
  }, /`migrate` must be true or false/);
});

test('an exclude that is not a function stops the lift', async () => {
  await assert.rejects(async () => {
    await lower(await liftApp({ 'view-article': viewArticle }, memoryAdapter(), { exclude: true }));
  }, /`exclude` must be a function/);
});
