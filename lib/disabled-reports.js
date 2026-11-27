/**
 * Reports while Lookout is disabled (`enabled: false`): no database access,
 * so the app's dashboards keep working without Lookout tables.
 */
module.exports = {
  countVisits: async () => 0,
  countEvents: async () => ({ visitors: 0, events: 0 }),
  topEvents: async () => []
};
