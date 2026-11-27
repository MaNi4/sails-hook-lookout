const { isbot } = require('isbot');

/**
 * Wraps the bot list so the rest of Lookout does not depend on the library.
 * A request without a user agent is treated as a bot: browsers always send one.
 */
module.exports = function isBot(userAgent) {
  return !userAgent || isbot(userAgent);
};
