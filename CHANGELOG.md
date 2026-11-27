# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

Changes to the database tables are listed under **Schema**; the hook applies them at lift.

## [0.4.0] - 2026-11-27

First release on npm: `npm install sails-hook-lookout`.

The hook now creates and updates its tables itself, see **Schema**.

### Changed

- **Each page view is recorded once.** Events carry a random id, and an event sent
  again, also many times at the same moment, is ignored. Before, a valid event could be
  replayed for 24 hours and each time counted, up to 100 times per visit.
- **No limit of 100 events per visit any more by default.** The fixed limit cut off real
  readers sharing an IP address and browser (an office, a class), so page views were
  undercounted. Set `maxEventsPerVisit` to keep a limit.
- Adapter contract: `missingTables()` is replaced by `migrate()` and
  `pendingMigrations()`; `insertEvent(event, maxPerVisit)` skips an event whose `id` is
  stored already, and `maxPerVisit` may be `null` (no limit). Custom adapters need these
  changes; `adapters/contract-tests.js` checks them.
- The warning for invalid `lookout.properties` names the actual limits.

### Fixed

- **PostgreSQL: concurrent first requests of a UTC day failed.** When several requests
  created the day's salt at once (at midnight UTC, or with several app instances), most
  of them got no salt back and their events were lost with `Lookout: event was not
  tracked`. The salt is now created and read in one atomic statement. No schema change.

### Added

- **Migrations.** The hook applies versioned migrations of its own at lift
  (`adapters/postgresql/migrations/`), each once, in a transaction and under a database
  lock, so several instances can lift at once. `migrate: false` turns it off: the hook
  then logs the pending migrations with the `psql` command that applies them, and
  tracks nothing until then. A migration records itself as its first statement, so
  applying it twice by mistake stops before it changes anything.
- `maxEventsPerVisit` option: most events one visit records, `null` (default) for no limit.
  Anything else than a positive integer or `null` stops the lift.
- The adapter contract suite ships with the package as `adapters/contract-tests.js`, so
  your own adapter can run the tests the built-in ones pass (see README, Databases).
- README: [`trustProxy`](README.md#behind-a-proxy-set-trustproxy) behind a reverse proxy.
  Without it every visitor has the proxy's IP and visits are badly undercounted.
- README: how accurate the visitor counts are without cookies (shared IP addresses,
  changing IP addresses), and rate limiting `POST /lookout/events` in the proxy.

### Schema

- `schema.sql` is gone; nothing to run by hand. At the first lift the hook takes over
  the existing tables as they are (`001-initial`, data kept) and applies:
  - `002-event-uuid`: new column `lookout_events.uuid` (unique). Events recorded before
    keep a null `uuid`.
- With `migrate: false`, run the `psql` command the hook logs at lift.

## [0.3.0] - 2026-11-27

### Added

- **The Boring JavaScript Stack (Inertia.js).** Actions with `responseType: 'inertia'`
  can declare `lookout` like `res.view` actions. The event travels in the `lookout` page
  prop and the script reads it from Inertia's `inertia:navigate` event, so client-side
  visits count too. Partial reloads and pages restored from history are not counted.
  Setup: `<script src="/lookout.js"></script>` in the root view, before the app's scripts
  (see README).

### Changed

- An action without a page now fails with "an exit with viewTemplatePath or
  responseType: 'inertia'".

## [0.2.0] - 2026-11-27

### Changed

- **`exclude` defaults to `null`: everyone is tracked**, logged-in users too. 0.1.0 left out
  every request with `req.me`, which assumed the Sails Web App template and also left out
  readers with an account. To keep the old behaviour, set
  `exclude: req => Boolean(req.me)` in `config/lookout.js`.
- An `exclude` that is neither a function nor `null` stops the lift.

## [0.1.0] - 2026-11-27

### Added

- `lookout` declaration on actions (`name`, optional `properties`), validated at lift.
- Signed page view events sent by a small browser script, no cookies.
- Bot filtering: no JavaScript, `navigator.webdriver`, hidden pages, isbot, empty user agent.
- Respect for Global Privacy Control and Do Not Track; `exclude(req)` (logged-in users by default).
- Cookieless visitor identity with a daily salt that is deleted afterwards.
- Stored visit data limited to landing page, referring domain and utm parameters.
- Automatic retention (`retentionDays`, default 395).
- At most 100 events per visit.
- Reports: `countVisits`, `count`, `top`.
- `enabled` option; reports return zeros while disabled.
- PostgreSQL adapter and an adapter contract for other databases.

### Schema

- Initial tables: `adapters/postgresql/schema.sql`.

[0.4.0]: https://github.com/MaNi4/sails-hook-lookout/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/MaNi4/sails-hook-lookout/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/MaNi4/sails-hook-lookout/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/MaNi4/sails-hook-lookout/releases/tag/v0.1.0
