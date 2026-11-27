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
const createViewTracking = require('./lib/view-tracking');
const createVisitorIdentity = require('./lib/visitor-identity');
const createTracker = require('./lib/tracker');
const createMaintenance = require('./lib/maintenance');
const readDeclarations = require('./lib/declarations');
const disabledReports = require('./lib/disabled-reports');
const resolveAdapter = require('./adapters');
const { assertAdapter } = require('./adapters/contract');

const SCRIPT_SRC = '/lookout.js';
const DAY = 24 * 60 * 60 * 1000;
const TOKEN_MAX_AGE = DAY;
const MAINTENANCE_INTERVAL = 60 * 60 * 1000;

module.exports = function defineLookoutHook(sails) {
  const clientScript = fs.readFileSync(path.join(__dirname, 'client', 'lookout.js'), 'utf8');
  let declarations = {};
  let adapterFactory = null;
  let services = null;
  let maintenanceTimer = null;

  function config() {
    return sails.config.lookout;
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
      const tracker = createTracker({ store: adapter, identity: createVisitorIdentity(adapter), isBot: isBot });
      const signer = createSignedToken({
        secret: config().secret || (sails.config.session && sails.config.session.secret),
        maxAgeMs: TOKEN_MAX_AGE
      });

      services = {
        adapter: adapter,
        tracker: tracker,
        signer: signer,
        maintenance: createMaintenance({ store: adapter, retentionDays: config().retentionDays }),
        wrapView: createViewTracking({
          findDeclaration: findDeclaration,
          contextFor: contextFor,
          shouldTrack: tracker.shouldTrack,
          signer: signer,
          scriptSrc: SCRIPT_SRC,
          warn: message => sails.log.warn(message)
        })
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
    const missing = await getServices().adapter.missingTables();
    if (missing.length) {
      sails.log.warn(`Lookout: missing tables ${missing.join(', ')}. Create them with the schema of the ${adapterFactory.name} adapter (adapters/); nothing is tracked until then.`);
      return;
    }
    await runMaintenance();
    maintenanceTimer = setInterval(runMaintenance, MAINTENANCE_INTERVAL);
    maintenanceTimer.unref();
  }

  function prepareView(req, res, next) {
    if (enabled()) {
      getServices().wrapView(req, res);
    }
    return next();
  }

  async function receiveEvent(req, res) {
    if (!enabled()) {
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
    return new Date(Date.now() - days * DAY);
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
        exclude: null
      }
    },

    initialize: async function () {
      // Declarations are checked even when disabled, so mistakes show up in development.
      sails.on('router:before', loadDeclarations);
      if (config().exclude !== null && typeof config().exclude !== 'function') {
        throw new Error('Lookout: `exclude` must be a function (req) => boolean or null.');
      }
      if (!enabled()) {
        sails.log.verbose('Lookout: disabled (sails.config.lookout.enabled = false).');
        return;
      }
      if (!config().secret && !(sails.config.session && sails.config.session.secret)) {
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
