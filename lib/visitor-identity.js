const crypto = require('crypto');
const { utcDay } = require('./utc-day');

/**
 * Identifies a visitor without cookies: HMAC of IP and user agent, keyed with
 * a random salt of the current UTC day. The salt changes daily and old salts
 * are deleted, so a token cannot be recomputed later, even with the IP in hand.
 *
 * @param {{ getOrCreateSalt(day: string, candidate: string): Promise<string> }} saltStore
 */
module.exports = function createVisitorIdentity(saltStore) {
  let cached = { day: null, salt: null };

  async function saltFor(day) {
    if (cached.day !== day) {
      const candidate = crypto.randomBytes(32).toString('hex');
      cached = { day: day, salt: await saltStore.getOrCreateSalt(day, candidate) };
    }
    return cached.salt;
  }

  return {
    visitToken: async function (context, time) {
      const salt = await saltFor(utcDay(time));
      return crypto.createHmac('sha256', salt)
        .update(`${context.ip}|${context.userAgent}`)
        .digest('hex');
    }
  };
};
