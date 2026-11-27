/**
 * Decides whether a request may be tracked and records the event,
 * creating the visit on its first event.
 *
 * @param {object} deps
 * @param {{ findOrCreateVisit(visit): Promise<number>, insertEvent(event, maxPerVisit): Promise<void> }} deps.store
 * @param {{ visitToken(context, time): Promise<string> }} deps.identity
 * @param {(userAgent: string) => boolean} deps.isBot
 * @param {number|null} [deps.maxEventsPerVisit] null: no limit
 * @param {() => Date} [deps.now]
 */
module.exports = function createTracker({ store, identity, isBot, maxEventsPerVisit = null, now = () => new Date() }) {
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
     * @param {{ id?: string, name: string, properties: object, visit: object }} event from a verified token
     *   (no id in tokens signed by Lookout before 0.4.0)
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
        { id: event.id || null, visitId: visitId, name: event.name, properties: event.properties, time: time },
        maxEventsPerVisit
      );
      return true;
    }
  };
};
