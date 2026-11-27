/**
 * Runs the adapter contract against a real PostgreSQL database.
 * Skipped unless LOOKOUT_TEST_POSTGRES_URL points to an empty, disposable database:
 *
 *   LOOKOUT_TEST_POSTGRES_URL=postgresql://user:pass@localhost:5432/lookout_test npm test
 */
const fs = require('fs');
const path = require('path');
const { test } = require('node:test');

const url = process.env.LOOKOUT_TEST_POSTGRES_URL;

if (!url) {
  test('postgresql adapter contract (set LOOKOUT_TEST_POSTGRES_URL to run)', { skip: true }, () => {});
} else {
  const { Pool } = require('pg');
  const createPostgresqlAdapter = require('../adapters/postgresql');
  const runAdapterContract = require('./adapter-contract');

  const pool = new Pool({ connectionString: url });
  const schema = fs.readFileSync(path.join(__dirname, '..', 'adapters', 'postgresql', 'schema.sql'), 'utf8');
  let ready = null;

  // Same shape as a Sails datastore, so the adapter is tested exactly as the hook uses it.
  const datastore = { sendNativeQuery: (sql, params) => pool.query(sql, params) };

  runAdapterContract('postgresql', {
    createAdapter: () => createPostgresqlAdapter(datastore),
    reset: async () => {
      ready = ready || pool.query(schema);
      await ready;
      await pool.query('TRUNCATE lookout_events, lookout_visits, lookout_salts');
    },
    close: () => pool.end()
  });
}
