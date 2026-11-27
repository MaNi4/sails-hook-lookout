const crypto = require('crypto');

/**
 * Events are prepared and signed on the server while the page renders; the
 * browser only delivers them. A client cannot change what is recorded or
 * invent events, and an old token cannot be replayed after `maxAgeMs`.
 *
 * Token: base64url(JSON payload) + "." + base64url(HMAC-SHA256)
 */
module.exports = function createSignedToken({ secret, maxAgeMs, now = () => Date.now() }) {
  const key = crypto.createHmac('sha256', secret).update('sails-hook-lookout').digest();

  function signature(data) {
    return crypto.createHmac('sha256', key).update(data).digest('base64url');
  }

  return {
    sign: function (payload) {
      const data = Buffer.from(JSON.stringify({ payload: payload, issuedAt: now() })).toString('base64url');
      return `${data}.${signature(data)}`;
    },

    /**
     * @returns {object|null} the payload, or null when the token is forged, malformed or expired
     */
    verify: function (token) {
      if (typeof token !== 'string' || token.length > 4000) {
        return null;
      }
      const [data, given] = token.split('.');
      if (!data || !given) {
        return null;
      }

      const expected = Buffer.from(signature(data));
      const actual = Buffer.from(given);
      if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
        return null;
      }

      let decoded;
      try {
        decoded = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
      } catch (unusedErr) {
        return null;
      }
      const age = now() - decoded.issuedAt;
      return age >= 0 && age <= maxAgeMs ? decoded.payload : null;
    }
  };
};
