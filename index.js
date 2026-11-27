/**
 * sails-hook-lookout: privacy-friendly page view tracking for Sails, inspired by the Ahoy gem.
 * See README.md.
 *
 * This file is the composition root: it reads the config, picks the database
 * adapter (adapters/), wires the modules in lib/ and binds them to Sails.
 * The modules themselves do not know Sails or the database.
 */

const fs = require('fs');
const path = require('path');

const requestContext = require('./lib/request-context');
const isBot = require('./lib/bot-detector');
const createSignedToken = require('./lib/signed-token');
const createPageEvent = require('./lib/page-event');
const createViewTracking = require('./lib/view-tracking');
const createInertiaTracking = require('./lib/inertia-tracking');
const createVisitorIdentity = require('./lib/visitor-identity');
const createTracker = require('./lib/tracker');
const createMaintenance = require('./lib/maintenance');
const readDeclarations = require('./lib/declarations');
const disabledReports = require('./lib/disabled-reports');
const { DAY_MS } = require('./lib/utc-day');
const resolveAdapter = require('./adapters');
const { assertAdapter } = require('./adapters/contract');

const SCRIPT_SRC = '/lookout.js';
const TOKEN_MAX_AGE = DAY_MS;
const MAINTENANCE_INTERVAL = 60 * 60 * 1000;

module.exports = function defineLookoutHook(sails) {
  const clientScript = fs.readFileSync(path.join(__dirname, 'client', 'lookout.js'), 'utf8');
  let declarations = {};
  let adapterFactory = null;
  let services = null;
  let maintenanceTimer = null;
  // True once the database is migrated; until then no page gets an event and none is written.
  let ready = false;

  function config() {
    return sails.config.lookout;
  }

  // Own key, or the app's session secret.
  function secret() {
    return config().secret || (sails.config.session && sails.config.session.secret);
  }

  function enabled() {
    return config().enabled !== false;
  }

  function reports() {
    return enabled() ? getServices().adapter : disabledReports;
  }

  function contextFor(req) {
    return requestContext(req, config().exclude);
  }

  /**
   * Validates the `lookout` key of every action. Runs when the router (re)loads,
   * i.e. after the actions are loaded; an invalid declaration stops the app from lifting.
   */
  function loadDeclarations() {
    const definitions = {};
    for (const [identity, action] of Object.entries(sails.getActions())) {
      definitions[identity] = typeof action.toJSON === 'function' ? action.toJSON() : null;
    }
    declarations = readDeclarations(definitions);
  }

  function findDeclaration(identity) {
    return Object.prototype.hasOwnProperty.call(declarations, identity) ? declarations[identity] : undefined;
  }

  function getServices() {
    if (!services) {
      const adapter = assertAdapter(adapterFactory.create(sails.getDatastore(config().datastore)), adapterFactory.name);
      const tracker = createTracker({
        store: adapter,
        identity: createVisitorIdentity(adapter),
        isBot: isBot,
        maxEventsPerVisit: config().maxEventsPerVisit
      });
      const signer = createSignedToken({
        secret: secret(),
        maxAgeMs: TOKEN_MAX_AGE
      });

      const warn = message => sails.log.warn(message);
      const pageEvent = createPageEvent({
        contextFor: contextFor,
        shouldTrack: tracker.shouldTrack,
        signer: signer,
        warn: warn
      });

      services = {
        adapter: adapter,
        tracker: tracker,
        signer: signer,
        maintenance: createMaintenance({ store: adapter, retentionDays: config().retentionDays }),
        // One per way a page is rendered; each acts only on actions declared for it.
        renderers: [
          createViewTracking({ findDeclaration: findDeclaration, pageEvent: pageEvent, scriptSrc: SCRIPT_SRC }),
          createInertiaTracking({ findDeclaration: findDeclaration, pageEvent: pageEvent, warn: warn })
        ]
      };
    }
    return services;
  }

  async function runMaintenance() {
    try {
      await getServices().maintenance.run();
    } catch (err) {
      sails.log.warn('Lookout: maintenance failed:', err.message);
    }
  }

  async function start() {
    const adapter = getServices().adapter;
    if (config().migrate) {
      const applied = await adapter.migrate();
      if (applied.length) {
        sails.log.info(`Lookout: applied database migrations ${applied.join(', ')}.`);
      }
    }
    const pending = await adapter.pendingMigrations();
    if (pending.length) {
      const how = typeof adapter.migrationCommand === 'function'
        ? `Apply them, then restart the app:\n\n  ${adapter.migrationCommand(pending)}\n`
        : `Apply them with the migrations of the ${adapterFactory.name} adapter, then restart the app.`;
      sails.log.warn(`Lookout: database migrations ${pending.join(', ')} are pending and \`migrate\` is false, so nothing is tracked. ${how}`);
      return;
    }
    ready = true;
    await runMaintenance();
    maintenanceTimer = setInterval(runMaintenance, MAINTENANCE_INTERVAL);
    maintenanceTimer.unref();
  }

  function tracking() {
    return enabled() && ready;
  }

  function prepareView(req, res, next) {
    if (tracking()) {
      getServices().renderers.forEach(wrap => wrap(req, res));
    }
    return next();
  }

  async function receiveEvent(req, res) {
    if (!tracking()) {
      return res.sendStatus(204);
    }
    const event = getServices().signer.verify(req.body && req.body.event);
    if (!event) {
      return res.sendStatus(400);
    }
    try {
      await getServices().tracker.track(contextFor(req), event);
    } catch (err) {
      sails.log.warn('Lookout: event was not tracked:', err.message);
    }
    // Same answer whether or not the event was recorded.
    return res.sendStatus(204);
  }

  function serveClientScript(req, res) {
    res.set('Content-Type', 'application/javascript; charset=utf-8');
    res.set('Cache-Control', 'public, max-age=86400');
    return res.send(clientScript);
  }

  function since(days) {
    return new Date(Date.now() - days * DAY_MS);
  }

  return {
    defaults: {
      lookout: {
        // false: no script, no writes, no database access; reports return zeros.
        enabled: true,
        datastore: 'default',
        retentionDays: 395,
        // Signing key; falls back to sails.config.session.secret.
        secret: null,
        // Own database adapter, (datastore) => adapter (see adapters/contract.js).
        // By default chosen from the datastore's Sails adapter.
        adapter: null,
        // (req) => boolean: requests the app never wants tracked, e.g. its own admins.
        // Null tracks everyone; Lookout makes no assumption about how users log in.
        exclude: null,
        // false: the hook does not migrate its tables at lift; apply the adapter's
        // migrations yourself (README, Migrations). Nothing is tracked while any is pending.
        migrate: true,
        // Most events one visit (visitor-day) records; null: no limit. A limit caps
        // what a script loading pages over and over can write, but also cuts off real
        // readers who share an IP address and browser.
        maxEventsPerVisit: null
      }
    },

    initialize: async function () {
      // Declarations are checked even when disabled, so mistakes show up in development.
      sails.on('router:before', loadDeclarations);
      if (config().exclude !== null && typeof config().exclude !== 'function') {
        throw new Error('Lookout: `exclude` must be a function (req) => boolean or null.');
      }
      if (typeof config().migrate !== 'boolean') {
        throw new Error('Lookout: `migrate` must be true or false.');
      }
      const max = config().maxEventsPerVisit;
      if (max !== null && !(Number.isInteger(max) && max > 0)) {
        throw new Error('Lookout: `maxEventsPerVisit` must be a positive integer or null (no limit).');
      }
      if (!enabled()) {
        sails.log.verbose('Lookout: disabled (sails.config.lookout.enabled = false).');
        return;
      }
      if (!secret()) {
        throw new Error('Lookout needs a secret: set sails.config.lookout.secret or sails.config.session.secret.');
      }
      const datastoreConfig = (sails.config.datastores || {})[config().datastore] || {};
      adapterFactory = resolveAdapter({ custom: config().adapter, datastoreAdapter: datastoreConfig.adapter });
      sails.on('lifted', () => start().catch(err => sails.log.warn('Lookout: start failed:', err.message)));
      sails.on('lower', () => clearInterval(maintenanceTimer));
    },

    routes: {
      before: {
        'GET /*': prepareView
      },
      after: {
        'POST /lookout/events': receiveEvent,
        [`GET ${SCRIPT_SRC}`]: serveClientScript
      }
    },

    /**
     * Visits (visitor-days) in the last `days` days, across all events.
     */
    countVisits: function ({ days }) {
      return reports().countVisits({ since: since(days) });
    },

    /**
     * Visitors and events of one event name, e.g. `{ name: 'blog:view', days: 30 }`.
     */
    count: function ({ name, days }) {
      return reports().countEvents({ name: name, since: since(days) });
    },

    /**
     * Most frequent values of an event property, e.g. `{ name: 'blog:view', property: 'blogId', days: 30, limit: 10 }`.
     */
    top: function ({ name, property, days, limit }) {
      return reports().topEvents({ name: name, property: property, since: since(days), limit: limit });
    }
  };
};
