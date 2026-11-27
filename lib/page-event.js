const isValidEventProperties = require('./event-properties');
const visitProperties = require('./visit-properties');

/**
 * Creates the signed event for one page view of a declared action, shared by
 * every way a page is rendered (see view-tracking.js and inertia-tracking.js).
 *
 * Returns null when the request is not tracked (bots, opt-outs, excluded users)
 * or the declaration's `properties` fails; the page itself always renders.
 *
 * @param {object} deps
 * @param {(req) => object} deps.contextFor
 * @param {(context) => boolean} deps.shouldTrack
 * @param {{ sign(payload): string }} deps.signer
 * @param {(message: string) => void} deps.warn
 * @returns {(req, declaration: { name, properties? }, action: string, data: object) => string|null}
 */
module.exports = function createPageEvent({ contextFor, shouldTrack, signer, warn }) {
  return function pageEvent(req, declaration, action, data) {
    const context = contextFor(req);
    if (!shouldTrack(context)) {
      return null;
    }

    let properties;
    try {
      properties = declaration.properties ? declaration.properties(data || {}) : {};
    } catch (err) {
      warn(`Lookout: lookout.properties of "${action}" failed: ${err.message}`);
      return null;
    }
    if (!isValidEventProperties(properties)) {
      warn(`Lookout: lookout.properties of "${action}" must return a flat object of at most 10 strings, numbers or booleans.`);
      return null;
    }
    return signer.sign({ name: declaration.name, properties: properties, visit: visitProperties(context) });
  };
};
