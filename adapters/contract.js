/**
 * What Lookout needs from a database. An adapter is a factory
 * `(datastore) => Adapter`; the datastore is the Sails datastore Lookout is
 * configured with (`sails.getDatastore(config.datastore)`).
 *
 * Every method must be safe under concurrent calls from several app instances.
 * adapters/contract-tests.js checks an implementation against a real database.
 *
 * @typedef {object} Adapter
 *
 * Write side
 * @property {(day: string, candidate: string) => Promise<string>} getOrCreateSalt
 *   Salt of a UTC day ('YYYY-MM-DD'). Stores `candidate` if the day has none yet,
 *   otherwise returns the stored one. Atomic: concurrent calls get the same salt.
 * @property {(visit: Visit) => Promise<string|number>} findOrCreateVisit
 *   Id of the visit with `visit.visitToken`; creates it from `visit` if missing. Atomic.
 * @property {(event: Event, maxPerVisit: number|null) => Promise<void>} insertEvent
 *   Stores the event, unless an event with the same `id` is stored already (atomic:
 *   concurrent calls store it once) or its visit already has `maxPerVisit` events
 *   (null: no limit). Events with a null `id` are never duplicates.
 * @property {(day: string) => Promise<void>} deleteSaltsBefore
 *   Deletes salts of days before `day`.
 * @property {(time: Date) => Promise<void>} deleteVisitsBefore
 *   Deletes visits started before `time`, together with their events.
 *
 * Schema
 * @property {() => Promise<Array<string>>} migrate
 *   Brings the database up to date and returns the names of the migrations it applied.
 *   Safe when several instances call it at once: each migration is applied once.
 *   Data in the tables is kept.
 * @property {() => Promise<Array<string>>} pendingMigrations
 *   Names of migrations not applied yet; empty when the database is ready.
 * @property {(names: Array<string>) => string} [migrationCommand]
 *   Optional: the shell command that applies these migrations by hand, which the
 *   hook logs when `migrate` is false. Without it the log names them only.
 *
 * Read side
 * @property {({ since: Date }) => Promise<number>} countVisits
 * @property {({ name: string, since: Date }) => Promise<{ visitors: number, events: number }>} countEvents
 * @property {({ name: string, property: string, since: Date, limit: number }) =>
 *   Promise<Array<{ value: string, visitors: number, events: number }>>} topEvents
 *   Most frequent values of one property, ordered by visitors then events.
 *   `visitors` counts distinct visits. Values are strings.
 *
 * @typedef {object} Visit
 * @property {string} visitToken
 * @property {Date} startedAt
 * @property {string|null} landingPage
 * @property {string|null} referringDomain
 * @property {string|null} utmSource
 * @property {string|null} utmMedium
 * @property {string|null} utmCampaign
 *
 * @typedef {object} Event
 * @property {string|null} id random UUID of the event; null in tokens from before 0.4.0
 * @property {string|number} visitId
 * @property {string} name
 * @property {object} properties flat object of strings, numbers and booleans
 * @property {Date} time
 */

const METHODS = [
  'getOrCreateSalt', 'findOrCreateVisit', 'insertEvent', 'deleteSaltsBefore', 'deleteVisitsBefore',
  'countVisits', 'countEvents', 'topEvents',
  'migrate', 'pendingMigrations'
];

/**
 * @throws {Error} naming the methods an adapter lacks
 */
function assertAdapter(adapter, name) {
  const missing = METHODS.filter(method => !adapter || typeof adapter[method] !== 'function');
  if (missing.length) {
    throw new Error(`Lookout: adapter "${name}" is missing ${missing.join(', ')} (see adapters/contract.js).`);
  }
  return adapter;
}

module.exports = { METHODS, assertAdapter };
