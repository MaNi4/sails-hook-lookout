![Lookout: page view tracking for Sails.js. No cookies. No bots. GDPR minded.](.github/logo.png)

# sails-hook-lookout

Privacy-friendly page view tracking for [Sails.js](https://sailsjs.com), inspired by the
[Ahoy](https://github.com/ankane/ahoy) gem for Rails.

- **No cookies, nothing stored in the browser.** No consent banner needed for it.
- **No bots.** Visits are recorded only when a real browser runs the script.
- **GDPR minded.** No IP addresses stored, data minimisation, automatic retention.
- **Declarative.** One key next to `inputs` and `exits`; no template or frontend code.

Works with both ways Sails apps render pages:

| App | Pages rendered with | Setup |
|---|---|---|
| Sails.js (default) | `res.view`: an exit with `viewTemplatePath` | none |
| [The Boring JavaScript Stack](https://github.com/sailscastshq/boring-stack) (Inertia.js) | `responseType: 'inertia'` | one script tag, see [The Boring JavaScript Stack](#the-boring-javascript-stack) |

The declaration is the same in both; Lookout reads from the action's exits how its page
is rendered.

## How it works

1. An action declares the event its page records:

   ```js
   // api/controllers/blogs/view-one-blog.js
   module.exports = {
     inputs: { slug: { type: 'string', required: true } },
     exits: { success: { viewTemplatePath: 'pages/one-blog' } },

     lookout: {
       name: 'blog:view',                               // required
       properties: ({ blog }) => ({ blogId: blog.id })  // optional, receives the page data
     },

     fn: async function ({ slug }) { /* ... */ }
   };
   ```

   - `name` is the key you query by later. It is required, so statistics stay stable when
     an action is renamed or moved. A convention like `object:action` reads well.
   - `properties` receives what the action returns for its page (the view locals, or
     the `props` of an Inertia page) and returns at most 10 flat string, number or
     boolean values.
   - Declarations are checked when the app lifts: an invalid one (missing name, unknown
     key, action without a page) stops the lift with a message naming the action.

2. While the page renders, the hook signs the event (name, properties, page path, referring
   domain, utm parameters) and hands it to the browser: in
   `<script src="/lookout.js" defer data-event="…">`, added before `</body>`, or for
   Inertia in the `lookout` prop of the page.
3. When the page becomes visible, the script posts the signed event to `/lookout/events`.
   The browser cannot change it or invent events of its own.

## What is not recorded

A request leaves no trace when any of these applies:

| Check | Where |
|---|---|
| The client never runs JavaScript (crawlers, `curl`, link previews) | by design |
| `navigator.webdriver` is set (Puppeteer, Playwright, Selenium) | browser |
| The page is never visible (prerender, background tab) | browser |
| Known bot user agent ([isbot](https://github.com/omrilotan/isbot)) or none at all | server |
| `Sec-GPC: 1` (Global Privacy Control) or `DNT: 1` | browser and server |
| `exclude(req)` returns true (your rule, e.g. your own admins; nobody by default) | server |
| Missing or wrong CSRF token, forged or expired (24 h) event | server |

### Privacy signals lower your numbers, on purpose

Visitors who send Global Privacy Control or Do Not Track are never counted. Some
browsers send GPC by default:

- **Brave**: always, in normal and private windows (its user agent looks like Chrome).
- **Firefox**: in private windows; in normal windows when "Tell websites not to sell or
  share my data" is on. Firefox-based browsers (e.g. Zen) may behave the same.
- **Extensions** such as Privacy Badger or DuckDuckGo Privacy Essentials, in any browser.

Expect lower counts than tools that ignore these signals, especially for technical
audiences.

## Privacy

- **Visitor identity**: `HMAC-SHA256(daily salt, IP + user agent)`. The salt is random,
  changes every UTC day and is deleted afterwards, so a stored token cannot be linked
  back to a person, not even with the IP address in hand.
- **Stored**: page path, properties you declare, referring domain (no path, no query),
  `utm_source`, `utm_medium`, `utm_campaign`. Never the IP address, the user agent or
  query strings.
- **Retention**: visits and events older than `retentionDays` (default 395) are deleted
  automatically, as are past salts.

Because the identity changes daily, Lookout counts **visitor-days**: someone who reads on
five different days counts five times. Unique visitors over longer periods cannot be
counted without tracking people across days.

Not legal advice. Mention the tracking in your privacy policy (legal basis is usually
legitimate interest, Art. 6(1)(f) GDPR).

## Install

Requires Sails 1.x, Node.js 22+ and a [supported database](#databases).

```sh
npm install github:MaNi4/sails-hook-lookout#v0.3.0
psql "$DATABASE_URL" -f node_modules/sails-hook-lookout/adapters/postgresql/schema.sql
```

Lookout is not on npm yet, so it installs from GitHub; pin a release tag (`#v0.3.0`)
so an update is always your decision.

The tables are created by the adapter's schema, not by Waterline, so they work with
`migrate: 'safe'`. Until they exist, the hook logs a warning and tracks nothing.

## The Boring JavaScript Stack

Inertia renders the first page on the server and every later one in the browser, from
JSON. Lookout puts the signed event in the `lookout` prop of each declared page, and the
script reads it from Inertia's `inertia:navigate` browser event, so client-side visits
count like full page loads. No code in your Vue, React or Svelte components.

1. **Load the script** in the root view, right before the app's scripts and without
   `defer`, so it listens before Inertia shows the first page:

   ```ejs
   <!-- views/app.ejs -->
       <script src="/lookout.js"></script>
       <%- shipwright.scripts() %>
     </body>
   ```

2. **Declare** pages as above; `properties` receives the page props:

   ```js
   // api/controllers/blog/view-post.js
   module.exports = {
     exits: { success: { responseType: 'inertia' } },

     lookout: {
       name: 'post:view',
       properties: ({ post }) => ({ postId: post.id })
     },

     fn: async function ({ slug }) {
       const post = await Post.findOne({ slug });
       return { page: 'blog/post', props: { post } };
     }
   };
   ```

3. **Use a [supported database](#databases).** The Boring Stack templates use SQLite in
   development: point the datastore at PostgreSQL, or turn Lookout off in development
   (`enabled: false`, no database needed). Their test hook,
   [Sounding](https://github.com/sailscastshq/sounding), replaces the default datastore with
   SQLite unless told otherwise:

   ```js
   // config/local.js (development)
   module.exports = {
     datastores: { default: { adapter: 'sails-postgresql', url: 'postgresql://…' } },
     sounding: { datastore: { mode: 'inherit' } },
   };
   ```

Good to know:

- A page counts once per server response: going back to a page Inertia restores from
  history does not count it again, and partial reloads (`router.reload({ only })`) are
  not page views.
- With CSRF protection on, the token travels in the prop too; nothing to set up.
- The `lookout` prop is reserved on declared pages: a page that returns its own is left
  untracked, with a warning in the log.
- Tested with the Vue template (`create-sails --vue`); React and Svelte use the same
  Inertia browser event.

## Databases

| Sails adapter | Status |
|---|---|
| `sails-postgresql` | built in |
| others (MySQL, SQLite, MongoDB, …) | add an adapter |

The adapter is chosen from the datastore Lookout uses. An unsupported database stops
the lift with a message listing the built-in adapters.

### Why not Waterline?

Waterline would run on every database, but it cannot do three things Lookout relies on:

| Lookout needs | Why | Waterline |
|---|---|---|
| Atomic find-or-create of visits and daily salts | concurrent requests of one reader must not create two visits or two salts | `findOrCreate` is not atomic; concurrent calls create duplicates |
| The 100-events-per-visit cap in one statement | a replayed event must not flood the table | two queries with a race in between; the cap leaks |
| `count(DISTINCT …) … GROUP BY` over a JSON property | `count()` and `top()` | no `GROUP BY`, no `DISTINCT`, no queries into JSON; every event would be loaded and summed in JavaScript |

Registering models from a hook is also experimental in Sails
(`sails.config.orm.moduleDefinitions`). So Lookout uses the datastore only for its
connection (`sails.getDatastore().sendNativeQuery()`) and each database gets a small
adapter with native queries:

```
adapters/
  contract.js        what an adapter implements (store + reports, 9 methods)
  index.js           built-in adapters by Sails adapter name
  postgresql/        index.js, store.js, reports.js, schema.sql
```

To add one, either:

- **contribute it**: add `adapters/<db>/` with its schema, register it in
  `adapters/index.js`, and add `test/<db>.test.js` that runs the shared contract suite
  (`test/adapter-contract.js`) against a real database, like `test/postgresql.test.js`; or
- **plug in your own** without forking:

  ```js
  // config/lookout.js
  module.exports.lookout = {
    adapter: datastore => require('./my-lookout-adapter')(datastore),
  };
  ```

  It is checked for all contract methods when first used.

## Options

All optional, in `config/lookout.js`:

```js
module.exports.lookout = {
  enabled: true,                   // false: no script, no writes, no database access
  datastore: 'default',            // Sails datastore (PostgreSQL)
  retentionDays: 395,              // delete older data
  secret: null,                    // event signing key; falls back to sails.config.session.secret
  exclude: null,                   // (req) => boolean: requests never tracked (see below)
  adapter: null,                   // own database adapter (see Databases)
};
```

### Excluding your own visits

By default everyone is tracked: Lookout does not know how your app logs users in, and
your readers may well have accounts (a members' area, a portal). To leave out your own
visits, tell it who you are with `exclude`, a function of the request:

```js
// config/lookout.js
module.exports.lookout = {
  // Sails "Web App" template: req.me is the logged-in user
  exclude: req => Boolean(req.me && req.me.isSuperAdmin),
};
```

Use whatever identifies those users in your app (`req.me`, `req.user`, `req.session`).
It runs when a declared action renders its view, after your policies, so values they set
on `req` are available. An `exclude` that is neither a function nor `null` stops the lift.

### Per environment

Turn tracking off where visitors are not real readers, e.g. development and staging:

```js
// config/env/development.js, config/env/staging.js
module.exports = {
  lookout: { enabled: false },
};
```

While disabled, no script is added, nothing is written, no database is touched (the
tables need not exist) and reports return zeros, so dashboards keep working. Action
declarations are still validated at lift. Override once with an environment variable:
`sails_lookout__enabled=true`.

Prefer this to `hooks: { lookout: false }`, which removes `sails.hooks.lookout` and
breaks code that reads reports.

## Reading the data

Lookout only collects. How and where you show the numbers (an admin dashboard, a report
e-mail, an API) is up to your app; the hook gives you three methods to read them.

### Methods

All are on `sails.hooks.lookout`, return a promise and look at a rolling window of the
last `days` × 24 hours. While Lookout is disabled they return zeros and empty lists.

**`countVisits({ days })`** → `number`

Visits in the period, across all events. A visit is one visitor during one UTC day.

```js
await sails.hooks.lookout.countVisits({ days: 30 });
// 128
```

**`count({ name, days })`** → `{ visitors, events }`

Totals of one event: `visitors` counts distinct visits, `events` counts every event.

```js
await sails.hooks.lookout.count({ name: 'blog:view', days: 30 });
// { visitors: 97, events: 143 }
```

**`top({ name, property, days, limit })`** → `[{ value, visitors, events }]`

Most frequent values of one property of an event, ordered by `visitors`, then `events`.
Events without the property are left out. `value` is always a string.

```js
await sails.hooks.lookout.top({ name: 'blog:view', property: 'blogId', days: 30, limit: 10 });
// [{ value: '2', visitors: 41, events: 57 }, { value: '7', visitors: 12, events: 15 }]
```

### Example: most read articles in an admin page

Lookout stores the ids you declared, not titles. Join them with your own records:

```js
// api/controllers/admin/view-stats.js
module.exports = {
  exits: { success: { viewTemplatePath: 'pages/admin/stats' } },

  fn: async function () {
    const [visits, top] = await Promise.all([
      sails.hooks.lookout.countVisits({ days: 30 }),
      sails.hooks.lookout.top({ name: 'blog:view', property: 'blogId', days: 30, limit: 10 }),
    ]);

    const blogs = await Blog.find({ id: top.map(row => Number(row.value)) });
    const titles = Object.fromEntries(blogs.map(blog => [blog.id, blog.title]));

    return {
      visits: visits,
      topBlogs: top
        .filter(row => titles[row.value]) // deleted records drop out
        .map(row => ({ title: titles[row.value], readers: row.visitors, views: row.events })),
    };
  }
};
```

```ejs
<!-- views/pages/admin/stats.ejs -->
<p>Visits in the last 30 days: <%= visits %></p>
<table>
  <tr><th>Article</th><th>Readers</th><th>Views</th></tr>
  <% topBlogs.forEach(blog => { %>
    <tr><td><%= blog.title %></td><td><%= blog.readers %></td><td><%= blog.views %></td></tr>
  <% }) %>
</table>
```

Do not declare `lookout` on admin actions: statistics pages are not what you want to
measure, and only declared actions are tracked.

### Anything else: query the tables

For other questions (views per day, referring domains, campaigns), query the tables
directly. With the PostgreSQL adapter (columns in `adapters/postgresql/schema.sql`):

- `lookout_visits`: `id`, `landing_page`, `referring_domain`, `utm_source`, `utm_medium`,
  `utm_campaign`, `started_at`
- `lookout_events`: `id`, `visit_id`, `name`, `properties` (jsonb), `time`

```js
const { rows } = await sails.getDatastore().sendNativeQuery(`
  SELECT date_trunc('day', time) AS day, count(*) AS views
  FROM lookout_events
  WHERE name = $1 AND time >= now() - interval '30 days'
  GROUP BY 1 ORDER BY 1`, ['blog:view']);

const { rows: sources } = await sails.getDatastore().sendNativeQuery(`
  SELECT referring_domain, count(*) AS visits
  FROM lookout_visits
  WHERE referring_domain IS NOT NULL AND started_at >= now() - interval '30 days'
  GROUP BY 1 ORDER BY 2 DESC LIMIT 10`);
```

The tables are Lookout's storage, not its API: the three methods above stay stable
across versions, the columns may change (see the changelog when upgrading).

## Trying it locally

If a visit does not show up:

1. **Is Lookout enabled** in this environment? (`enabled: false` in `config/env/*.js`;
   override with `sails_lookout__enabled=true`)
2. **Does your `exclude` rule match you?** E.g. when it excludes your admin account,
   log out or use a private window.
3. **Does your browser send GPC or DNT?** Run `navigator.globalPrivacyControl` in the
   console. Brave always does, so do Firefox private windows. A clean Chromium works:

   ```sh
   chromium --incognito --disable-extensions --user-data-dir=/tmp/lookout-test http://localhost:1337/
   ```

4. **Is the event on the page?** `document.querySelector('script[data-event]')` is
   `null` when the server decided not to track (checks 1–3) or the action has no
   `lookout` declaration. With Inertia, look for the `lookout` prop of the page instead
   (Vue devtools or the response in the Network tab), and check that
   `<script src="/lookout.js">` comes before the app's scripts.
5. **Does the beacon arrive?** In the Network tab, `POST /lookout/events` should answer
   `204`. A blocked request points to an ad blocker.
6. **Do the tables exist?** Otherwise the hook logs `Lookout: missing tables …` at lift.

## Security notes

- Events are signed with HMAC-SHA256 and expire after 24 hours.
- The endpoint requires the Sails CSRF token when CSRF protection is enabled.
- A visit records at most 100 events, so a replayed event cannot flood the table.
- Properties are limited to 10 flat string, number or boolean values.
- Attribute values in the injected tag are HTML-escaped.

## Tests

```sh
npm run lint
npm test
# also run the adapter contract against an empty, disposable PostgreSQL database:
LOOKOUT_TEST_POSTGRES_URL=postgresql://user:pass@localhost:5432/lookout_test npm test
```

## License

[MIT](LICENSE)
