/**
 * Lifts a real, minimal Sails app (no ORM, no database) with Lookout, for the
 * integration tests. Events are kept in memory by a test adapter.
 */
const net = require('net');
const Sails = require('sails').constructor;
const lookoutHook = require('../../index');

const BROWSER = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

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

/**
 * @param {object} options
 * @param {string} options.appPath fixture app (views, responses)
 * @param {Object<string, object>} options.actions action definitions by identity, routed as `GET /<identity without view->`
 * @param {object} options.adapter Lookout adapter
 * @param {object} [options.lookout] Lookout options
 * @param {object} [options.hooks] extra hooks, e.g. { inertia: require('inertia-sails') }
 */
async function lift({ appPath, actions, adapter, lookout = {}, hooks = {} }) {
  const port = await freePort();
  const app = new Sails();
  // Without sails-hook-orm there is no datastore; the memory adapter does not need one.
  app.getDatastore = () => ({});
  return new Promise((resolve, reject) => {
    app.lift({
      appPath: appPath,
      port: port,
      environment: 'test',
      log: { level: 'error' },
      hooks: Object.assign({
        lookout: lookoutHook, orm: false, pubsub: false, sockets: false, grunt: false, session: false, i18n: false
      }, hooks),
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

function postEvent(app, event) {
  return fetch(`http://localhost:${app.config.port}/lookout/events`, {
    method: 'POST',
    headers: { 'user-agent': BROWSER, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ event }).toString()
  });
}

module.exports = { BROWSER, memoryAdapter, lift, lower, postEvent };
