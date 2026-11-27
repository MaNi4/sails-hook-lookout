/**
 * Decides whether a request may be tracked and records the event,
 * creating the visit on its first event.
 *
 * @param {object} deps
 * @param {{ findOrCreateVisit(visit): Promise<number>, insertEvent(event, maxPerVisit): Promise<void> }} deps.store
 * @param {{ visitToken(context, time): Promise<string> }} deps.identity
 * @param {(userAgent: string) => boolean} deps.isBot
 * @param {() => Date} [deps.now]
 */

// One visitor-day hardly reads more; the cap keeps a replaying client from filling the table.
const MAX_EVENTS_PER_VISIT = 100;

module.exports = function createTracker({ store, identity, isBot, now = () => new Date() }) {
  function shouldTrack(context) {
    return !context.excluded &&
      !context.globalPrivacyControl &&
      !context.doNotTrack &&
      !isBot(context.userAgent);
  }

  return {
    shouldTrack: shouldTrack,

    /**
     * @param {object} context from request-context
     * @param {{ name: string, properties: object, visit: object }} event from a verified token
     * @returns {Promise<boolean>} whether the request was eligible for tracking
     */
    track: async function (context, event) {
      if (!shouldTrack(context)) {
        return false;
      }

      const time = now();
      const visitToken = await identity.visitToken(context, time);
      const visitId = await store.findOrCreateVisit(
        Object.assign({}, event.visit, { visitToken: visitToken, startedAt: time })
      );
      await store.insertEvent(
        { visitId: visitId, name: event.name, properties: event.properties, time: time },
        MAX_EVENTS_PER_VISIT
      );
      return true;
    }
  };
};
