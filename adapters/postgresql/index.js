const createStore = require('./store');
const createReports = require('./reports');
const createMigrations = require('./migrations');

/**
 * Lookout adapter for sails-postgresql. Tables: ./migrations
 *
 * @param {{
 *   sendNativeQuery(sql: string, params: Array): Promise<{ rows: Array<object> }> & { usingConnection(db): Promise<{ rows: Array<object> }> },
 *   leaseConnection(during: (db) => Promise<any>): Promise<any>
 * }} datastore a Sails datastore
 * @returns {import('../contract').Adapter}
 */
module.exports = function createPostgresqlAdapter(datastore) {
  const query = async (sql, params) => (await datastore.sendNativeQuery(sql, params)).rows;
  // `async` is required: Sails waits for `during` only when it is an AsyncFunction.
  // A plain function returning a promise gets its connection released at once, while
  // still in use, and the migration lock (held by the connection) would not hold.
  const withConnection = during => datastore.leaseConnection(async db =>
    during(async (sql, params) => (await datastore.sendNativeQuery(sql, params).usingConnection(db)).rows)
  );
  return Object.assign({}, createStore(query), createReports(query), createMigrations({ query, withConnection }));
};
