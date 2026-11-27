const DAY = 24 * 60 * 60 * 1000;

/**
 * Daily housekeeping required for privacy: deletes salts of past days
 * (anonymises stored tokens) and data older than the retention period.
 * Safe to run often and from several app instances at once.
 */
module.exports = function createMaintenance({ store, retentionDays, now = () => new Date() }) {
  return {
    run: async function () {
      const time = now();
      await store.deleteSaltsBefore(time.toISOString().slice(0, 10));
      await store.deleteVisitsBefore(new Date(time.getTime() - retentionDays * DAY));
    }
  };
};
