/**
 * Runs the adapter contract and the migration tests against a real PostgreSQL database.
 * Skipped unless LOOKOUT_TEST_POSTGRES_URL points to an empty, disposable database
 * (the tests drop and create Lookout's tables):
 *
 *   LOOKOUT_TEST_POSTGRES_URL=postgresql://user:pass@localhost:5432/lookout_test npm test
 */
const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const url = process.env.LOOKOUT_TEST_POSTGRES_URL;

if (!url) {
  test('postgresql adapter (set LOOKOUT_TEST_POSTGRES_URL to run)', { skip: true }, () => {});
} else {
  const { Pool } = require('pg');
  const createPostgresqlAdapter = require('../adapters/postgresql');
  const createMigrations = require('../adapters/postgresql/migrations');
  const runAdapterContract = require('../adapters/contract-tests');

  const pool = new Pool({ connectionString: url });

  // The parts of a Sails datastore the adapter uses, so it is tested as the hook uses it.
  // leaseConnection behaves like Sails (sails-hook-orm, do-with-connection.js): it waits
  // for `during` only when that is an AsyncFunction, and otherwise releases at once.
  const sailsDatastore = pool => ({
    sendNativeQuery: (sql, params) => {
      const run = client => client.query(sql, params);
      return { usingConnection: run, then: (resolve, reject) => run(pool).then(resolve, reject) };
    },
    leaseConnection: async during => {
      const client = await pool.connect();
      if (during.constructor.name !== 'AsyncFunction') {
        const result = during(client);
        client.release();
        return result;
      }
      try {
        return await during(client);
      } finally {
        client.release();
      }
    }
  });
  const datastore = sailsDatastore(pool);

  const dropAll = () => pool.query('DROP TABLE IF EXISTS lookout_events, lookout_visits, lookout_salts, lookout_migrations');

  // Migrations of the test's own, on the same connections as the adapter.
  const testMigrations = migrations => createMigrations({
    query: async (sql, params) => (await pool.query(sql, params)).rows,
    withConnection: during => datastore.leaseConnection(async client => during(async (sql, params) => (await client.query(sql, params)).rows)),
    migrations: migrations
  });

  let migrated = null;

  runAdapterContract('postgresql', {
    createAdapter: () => createPostgresqlAdapter(datastore),
    reset: async () => {
      migrated = migrated || dropAll().then(() => createPostgresqlAdapter(datastore).migrate());
      await migrated;
      await pool.query('TRUNCATE lookout_events, lookout_visits, lookout_salts');
    }
  });

  describe('postgresql migrations', () => {
    const adapter = createPostgresqlAdapter(datastore);

    before(dropAll);
    after(async () => {
      await dropAll();
      await pool.end();
    });

    test('an empty database: everything pending, then applied once by concurrent instances', async () => {
      await dropAll();
      assert.deepEqual(await adapter.pendingMigrations(), ['001-initial', '002-event-uuid']);

      const results = await Promise.all([1, 2, 3].map(() => createPostgresqlAdapter(datastore).migrate()));
      assert.deepEqual(results.flat().sort(), ['001-initial', '002-event-uuid']);
      assert.deepEqual(await adapter.pendingMigrations(), []);
    });

    test('the lock holds when instances get the same connection one after another', async () => {
      // With one connection, every instance reuses it. Should a lease end before its
      // migration does, the next instance would take the lock again on that same
      // connection (advisory locks are per connection) and migrate at the same time.
      await dropAll();
      const single = new Pool({ connectionString: url, max: 1 });
      try {
        const results = await Promise.all([1, 2, 3].map(() => createPostgresqlAdapter(sailsDatastore(single)).migrate()));
        assert.deepEqual(results.flat().sort(), ['001-initial', '002-event-uuid']);
      } finally {
        await single.end();
      }
    });

    test('tables of Lookout 0.1–0.3 (schema.sql) are adopted with their data', async () => {
      await dropAll();
      await pool.query(`
        CREATE TABLE lookout_salts (day date PRIMARY KEY, salt text NOT NULL);
        CREATE TABLE lookout_visits (
          id bigserial PRIMARY KEY, visit_token text NOT NULL UNIQUE, landing_page text, referring_domain text,
          utm_source text, utm_medium text, utm_campaign text, started_at timestamptz NOT NULL DEFAULT now()
        );
        CREATE TABLE lookout_events (
          id bigserial PRIMARY KEY, visit_id bigint NOT NULL REFERENCES lookout_visits (id) ON DELETE CASCADE,
          name text NOT NULL, properties jsonb NOT NULL DEFAULT '{}', time timestamptz NOT NULL DEFAULT now()
        );
        INSERT INTO lookout_visits (visit_token) VALUES ('old');
        INSERT INTO lookout_events (visit_id, name) SELECT id, 'blog:view' FROM lookout_visits;`);

      assert.deepEqual(await adapter.migrate(), ['001-initial', '002-event-uuid']);
      const { rows } = await pool.query('SELECT name, uuid FROM lookout_events');
      assert.deepEqual(rows, [{ name: 'blog:view', uuid: null }]);
    });

    test('a migration applied again by hand fails at once and changes nothing', async () => {
      await dropAll();
      await adapter.migrate();
      const fs = require('fs');
      const path = require('path');
      const sql = fs.readFileSync(path.join(__dirname, '..', 'adapters', 'postgresql', 'migrations', '002-event-uuid.sql'), 'utf8');
      // Statement by statement and without a transaction, as psql runs a file without
      // --single-transaction: the very first statement must fail, before any change.
      const statements = sql.split('\n').filter(line => !line.trim().startsWith('--')).join('\n')
        .split(';').map(statement => statement.trim()).filter(Boolean);
      await assert.rejects(pool.query(statements[0]), /duplicate key value violates unique constraint "lookout_migrations_pkey"/);
      assert.deepEqual((await pool.query('SELECT name FROM lookout_migrations ORDER BY name')).rows.map(row => row.name), ['001-initial', '002-event-uuid']);
    });

    test('a failing migration leaves nothing of it behind, and later ones wait', async () => {
      await dropAll();
      const migrations = testMigrations([
        { name: '001-a', sql: "CREATE TABLE lookout_migrations (name text PRIMARY KEY); INSERT INTO lookout_migrations VALUES ('001-a');" },
        { name: '002-b', sql: "CREATE TABLE lookout_salts (day date); SELECT 1/0; INSERT INTO lookout_migrations VALUES ('002-b');" },
        { name: '003-c', sql: "INSERT INTO lookout_migrations VALUES ('003-c');" }
      ]);

      await assert.rejects(migrations.migrate(), /migration 002-b failed, nothing of it was applied: division by zero/);
      assert.deepEqual(await migrations.pendingMigrations(), ['002-b', '003-c']);
      assert.equal((await pool.query("SELECT to_regclass('lookout_salts') AS name")).rows[0].name, null);
    });

    test('a migration that does not record itself is rejected', async () => {
      await dropAll();
      const migrations = testMigrations([{ name: '001-a', sql: 'CREATE TABLE lookout_migrations (name text PRIMARY KEY);' }]);
      await assert.rejects(migrations.migrate(), /does not record itself/);
      assert.deepEqual(await migrations.pendingMigrations(), ['001-a']);
    });
  });
}
