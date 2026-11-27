/**
 * Write side of the PostgreSQL adapter (see adapters/contract.js).
 *
 * @param {(sql: string, params: Array) => Promise<Array<object>>} query
 */
module.exports = function createPostgresStore(query) {
  return {
    getOrCreateSalt: async function (day, candidate) {
      // The outer SELECT does not see the row inserted in the same statement,
      // hence the UNION: exactly one of the two branches returns the salt.
      const rows = await query(`
        WITH inserted AS (
          INSERT INTO lookout_salts (day, salt) VALUES ($1, $2)
          ON CONFLICT (day) DO NOTHING
          RETURNING salt
        )
        SELECT salt FROM inserted
        UNION ALL
        SELECT salt FROM lookout_salts WHERE day = $1
        LIMIT 1`, [day, candidate]);
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
      await query(`
        INSERT INTO lookout_events (visit_id, name, properties, time)
        SELECT $1, $2, $3::jsonb, $4
        WHERE (SELECT count(*) FROM lookout_events WHERE visit_id = $1) < $5`,
      [event.visitId, event.name, JSON.stringify(event.properties), event.time, maxPerVisit]);
    },

    deleteSaltsBefore: async function (day) {
      await query('DELETE FROM lookout_salts WHERE day < $1', [day]);
    },

    deleteVisitsBefore: async function (time) {
      // Events go with their visit (ON DELETE CASCADE).
      await query('DELETE FROM lookout_visits WHERE started_at < $1', [time]);
    },

    missingTables: async function () {
      const rows = await query(`
        SELECT name FROM unnest($1::text[]) AS name
        WHERE to_regclass(name) IS NULL`, [['lookout_salts', 'lookout_visits', 'lookout_events']]);
      return rows.map(row => row.name);
    }
  };
};
