/**
 * Pages rendered with Inertia.js (an exit with `responseType: 'inertia'`, as in
 * The Boring JavaScript Stack): the page of a declared action carries its signed
 * event in the `lookout` prop, on the first load and on every client-side visit.
 * The client script reads it from Inertia's `inertia:navigate` browser event.
 *
 * It relies only on the Inertia response contract, `res.inertia({ page, props })`,
 * not on the internals of inertia-sails.
 */

const PROP = 'lookout';
// Partial reloads refresh some props of the page already shown: not a page view.
const PARTIAL_RELOAD = 'x-inertia-partial-data';

/**
 * @param {object} deps
 * @param {(actionIdentity: string) => ({ name, properties?, renderer })|undefined} deps.findDeclaration
 * @param {(req, declaration, action, props) => string|null} deps.pageEvent
 * @param {(message: string) => void} deps.warn
 */
module.exports = function createInertiaTracking({ findDeclaration, pageEvent, warn }) {
  /**
   * Replaces res.inertia for one request; the action is read when it responds.
   */
  return function wrapInertia(req, res) {
    const inertia = res.inertia;
    if (typeof inertia !== 'function') {
      return;
    }

    res.inertia = function (data) {
      const action = req.options && req.options.action;
      const declaration = data && typeof data === 'object' && res.statusCode < 300 && !req.get(PARTIAL_RELOAD)
        ? findDeclaration(action)
        : undefined;
      if (declaration && declaration.renderer === 'inertia' && data.props && PROP in data.props) {
        warn(`Lookout: "${action}" returns a \`${PROP}\` prop, which Lookout reserves for its event; the page is not tracked.`);
        return inertia.apply(res, arguments);
      }
      const event = declaration && declaration.renderer === 'inertia'
        ? pageEvent(req, declaration, action, data.props)
        : null;

      if (!event) {
        return inertia.apply(res, arguments);
      }

      const lookout = res.locals && res.locals._csrf ? { event: event, csrf: res.locals._csrf } : { event: event };
      const props = Object.assign({}, data.props, { [PROP]: lookout });
      return inertia.call(res, Object.assign({}, data, { props: props }));
    };
  };
};
