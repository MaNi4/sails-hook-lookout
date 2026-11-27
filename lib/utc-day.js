/**
 * Lookout's notion of a day: the UTC calendar day. The visitor salt, its deletion
 * and the visit (one visitor during one day) all depend on it, so it is defined once.
 */
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * @param {Date} time
 * @returns {string} the UTC day of `time`, 'YYYY-MM-DD'
 */
function utcDay(time) {
  return time.toISOString().slice(0, 10);
}

module.exports = { DAY_MS, utcDay };
