const createStore = require('./store');
const createReports = require('./reports');

/**
 * Lookout adapter for sails-postgresql. Tables: ./schema.sql
 *
 * @param {{ sendNativeQuery(sql: string, params: Array): Promise<{ rows: Array<object> }> }} datastore
 * @returns {import('../contract').Adapter}
 */
module.exports = function createPostgresqlAdapter(datastore) {
  const query = async (sql, params) => (await datastore.sendNativeQuery(sql, params)).rows;
  return Object.assign({}, createStore(query), createReports(query));
};
