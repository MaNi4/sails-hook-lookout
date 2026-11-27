/**
 * Write side of the PostgreSQL adapter (see adapters/contract.js).
 *
 * @param {(sql: string, params: Array) => Promise<Array<object>>} query
 */
module.exports = function createPostgresStore(query) {
  return {
    getOrCreateSalt: async function (day, candidate) {
      // DO UPDATE (a no-op) instead of DO NOTHING: it waits for a concurrent insert of the
      // same day and returns that row. A SELECT in the same statement would not see it
      // (its snapshot predates the other commit) and return nothing.
      const rows = await query(`
        INSERT INTO lookout_salts (day, salt) VALUES ($1, $2)
        ON CONFLICT (day) DO UPDATE SET salt = lookout_salts.salt
        RETURNING salt`, [day, candidate]);
      return rows[0].salt;
    },

    findOrCreateVisit: async function (visit) {
      // DO UPDATE (a no-op) instead of DO NOTHING, so RETURNING also yields an existing row.
      const rows = await query(`
        INSERT INTO lookout_visits
          (visit_token, landing_page, referring_domain, utm_source, utm_medium, utm_campaign, started_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (visit_token) DO UPDATE SET visit_token = EXCLUDED.visit_token
        RETURNING id`, [
        visit.visitToken, visit.landingPage, visit.referringDomain,
        visit.utmSource, visit.utmMedium, visit.utmCampaign, visit.startedAt
      ]);
      return rows[0].id;
    },

    insertEvent: async function (event, maxPerVisit) {
      // The unique uuid makes a resent event a no-op, also when both arrive at once.
      // The optional cap is checked in the same statement, but not serialized: requests
      // of one visit at the same moment can add a few events beyond it.
      await query(`
        INSERT INTO lookout_events (uuid, visit_id, name, properties, time)
        SELECT $1, $2, $3, $4::jsonb, $5
        WHERE $6::integer IS NULL OR (SELECT count(*) FROM lookout_events WHERE visit_id = $2) < $6
        ON CONFLICT (uuid) DO NOTHING`,
      [event.id, event.visitId, event.name, JSON.stringify(event.properties), event.time, maxPerVisit]);
    },

    deleteSaltsBefore: async function (day) {
      await query('DELETE FROM lookout_salts WHERE day < $1', [day]);
    },

    deleteVisitsBefore: async function (time) {
      // Events go with their visit (ON DELETE CASCADE).
      await query('DELETE FROM lookout_visits WHERE started_at < $1', [time]);
    }
  };
};
