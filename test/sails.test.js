/**
 * Integration test: lifts a real, minimal Sails app (no ORM, no database) with the hook.
 *
 * It covers what the unit tests cannot: that Sails exposes the `lookout` key of an
 * action definition (`action.toJSON()`) and that wrapping `res.view` works in Sails.
 * Neither is documented Sails API, so this test is what catches a Sails upgrade
 * that breaks them.
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const net = require('net');
const path = require('path');
const Sails = require('sails').constructor;
const lookoutHook = require('../index');

const APP_PATH = path.join(__dirname, 'fixtures', 'app');
const BROWSER = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

const viewArticle = {
  exits: { success: { viewTemplatePath: 'pages/article' } },
  lookout: { name: 'article:view', properties: ({ id }) => ({ articleId: id }) },
  fn: async function () {
    return { id: 7, title: 'Hello' };
  }
};

/** Adapter that keeps events in memory; enough for the hook, see adapters/contract.js. */
function memoryAdapter() {
  const visits = [];
  const events = [];
  return {
    events: events,
    getOrCreateSalt: async (_day, salt) => salt,
    findOrCreateVisit: async visit => {
      let found = visits.find(v => v.visitToken === visit.visitToken);
      if (!found) {
        found = Object.assign({ id: visits.length + 1 }, visit);
        visits.push(found);
      }
      return found.id;
    },
    insertEvent: async event => { events.push(event); },
    deleteSaltsBefore: async () => {},
    deleteVisitsBefore: async () => {},
    missingTables: async () => [],
    countVisits: async () => visits.length,
    countEvents: async ({ name }) => {
      const matching = events.filter(e => e.name === name);
      return { visitors: new Set(matching.map(e => e.visitId)).size, events: matching.length };
    },
    topEvents: async () => []
  };
}

/** A free port from the OS; Sails treats `port: 0` as unset and falls back to 1337. */
function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer().listen(0, () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    }).on('error', reject);
  });
}

async function lift(actions, adapter, lookout = {}) {
  const port = await freePort();
  const app = new Sails();
  // Without sails-hook-orm there is no datastore; the memory adapter does not need one.
  app.getDatastore = () => ({});
  return new Promise((resolve, reject) => {
    app.lift({
      appPath: APP_PATH,
      port: port,
      environment: 'test',
      log: { level: 'error' },
      hooks: { lookout: lookoutHook, orm: false, pubsub: false, sockets: false, grunt: false, session: false, i18n: false },
      security: { csrf: false },
      views: { layout: false },
      controllers: { moduleDefinitions: actions },
      routes: Object.fromEntries(Object.keys(actions).map(id => [`GET /${id.replace('view-', '')}`, id])),
      lookout: Object.assign({ secret: 'test-secret', adapter: () => adapter }, lookout)
    }, err => (err ? reject(err) : resolve(app)));
  });
}

function lower(app) {
  return new Promise(resolve => app.lower(() => resolve()));
}

let app;
let adapter;
let baseUrl;

before(async () => {
  adapter = memoryAdapter();
  app = await lift({
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

  const res = await fetch(`${baseUrl}/lookout/events`, {
    method: 'POST',
    headers: { 'user-agent': BROWSER, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ event }).toString()
  });
  assert.equal(res.status, 204);
  assert.equal(adapter.events.length, 1);
  assert.equal(adapter.events[0].name, 'article:view');
  assert.deepEqual(adapter.events[0].properties, { articleId: 7 });
  assert.deepEqual(await app.hooks.lookout.count({ name: 'article:view', days: 1 }), { visitors: 1, events: 1 });
});

test('pages without a declaration and bots get no script', async () => {
  assert.equal((await signedEventFrom('/plain')).event, null);
  assert.equal((await signedEventFrom('/article', 'Googlebot/2.1 (+http://www.google.com/bot.html)')).event, null);
});

test('a forged event is rejected', async () => {
  const res = await fetch(`${baseUrl}/lookout/events`, {
    method: 'POST',
    headers: { 'user-agent': BROWSER, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ event: 'forged.token' }).toString()
  });
  assert.equal(res.status, 400);
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
    await lower(await lift({ 'view-article': broken }, memoryAdapter()));
  }, /Action "view-article"/);
});

test('an exclude that is not a function stops the lift', async () => {
  await assert.rejects(async () => {
    await lower(await lift({ 'view-article': viewArticle }, memoryAdapter(), { exclude: true }));
  }, /`exclude` must be a function/);
});
