# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

Changes to the database tables are listed under **Schema** with the SQL to run.

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

[0.3.0]: https://github.com/MaNi4/sails-hook-lookout/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/MaNi4/sails-hook-lookout/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/MaNi4/sails-hook-lookout/releases/tag/v0.1.0
