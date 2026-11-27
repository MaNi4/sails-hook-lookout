/**
 * Read side of the PostgreSQL adapter (see adapters/contract.js).
 *
 * Visitors are counted per UTC day (the identity changes daily), so a reader
 * who comes back on another day counts again.
 *
 * @param {(sql: string, params: Array) => Promise<Array<object>>} query
 */
module.exports = function createReports(query) {
  return {
    countVisits: async function ({ since }) {
      const rows = await query('SELECT count(*) AS count FROM lookout_visits WHERE started_at >= $1', [since]);
      return Number(rows[0].count);
    },

    countEvents: async function ({ name, since }) {
      const rows = await query(`
        SELECT count(DISTINCT visit_id) AS visitors, count(*) AS events
        FROM lookout_events
        WHERE name = $1 AND time >= $2`, [name, since]);
      return { visitors: Number(rows[0].visitors), events: Number(rows[0].events) };
    },

    /**
     * Most frequent values of one property of an event, e.g. blogId of 'blog:view'.
     *
     * @returns {Promise<Array<{ value: string, visitors: number, events: number }>>}
     */
    topEvents: async function ({ name, property, since, limit }) {
      const rows = await query(`
        SELECT properties ->> $2 AS value,
               count(DISTINCT visit_id) AS visitors,
               count(*) AS events
        FROM lookout_events
        WHERE name = $1 AND time >= $3 AND properties ->> $2 IS NOT NULL
        GROUP BY 1
        ORDER BY visitors DESC, events DESC
        LIMIT $4`, [name, property, since, limit]);
      return rows.map(row => ({ value: row.value, visitors: Number(row.visitors), events: Number(row.events) }));
    }
  };
};
