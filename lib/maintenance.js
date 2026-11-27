const { DAY_MS, utcDay } = require('./utc-day');

/**
 * Daily housekeeping required for privacy: deletes salts of past days
 * (anonymises stored tokens) and data older than the retention period.
 * Safe to run often and from several app instances at once.
 */
module.exports = function createMaintenance({ store, retentionDays, now = () => new Date() }) {
  return {
    run: async function () {
      const time = now();
      await store.deleteSaltsBefore(utcDay(time));
      await store.deleteVisitsBefore(new Date(time.getTime() - retentionDays * DAY_MS));
    }
  };
};
