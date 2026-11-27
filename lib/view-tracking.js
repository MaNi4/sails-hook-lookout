const injectScriptTag = require('./script-tag');
const isValidEventProperties = require('./event-properties');
const visitProperties = require('./visit-properties');

/**
 * Pages of actions that declare `lookout: { name }` get the Lookout script
 * with a signed event. Nothing is added for other actions, non-2xx
 * responses, or requests that would not be tracked anyway (bots, opt-outs,
 * excluded users).
 *
 * @param {object} deps
 * @param {(actionIdentity: string) => ({ name, properties? })|undefined} deps.findDeclaration
 * @param {(req) => object} deps.contextFor
 * @param {(context) => boolean} deps.shouldTrack
 * @param {{ sign(payload): string }} deps.signer
 * @param {string} deps.scriptSrc
 * @param {(message: string) => void} deps.warn
 */
module.exports = function createViewTracking({ findDeclaration, contextFor, shouldTrack, signer, scriptSrc, warn }) {
  function signedEvent(declaration, locals, context, action) {
    let properties;
    try {
      properties = declaration.properties ? declaration.properties(locals) : {};
    } catch (err) {
      warn(`Lookout: lookout.properties of "${action}" failed: ${err.message}`);
      return null;
    }
    if (!isValidEventProperties(properties)) {
      warn(`Lookout: lookout.properties of "${action}" must return a flat object of at most 10 strings, numbers or booleans.`);
      return null;
    }
    return signer.sign({ name: declaration.name, properties: properties, visit: visitProperties(context) });
  }

  /**
   * Replaces res.view for one request. Only the plain `res.view(path[, locals])`
   * form used by actions is handled; any other call is passed through untouched.
   */
  return function wrapView(req, res) {
    const view = res.view;
    if (typeof view !== 'function') {
      return;
    }

    res.view = function (path, locals) {
      const action = req.options && req.options.action;
      const declaration = typeof path === 'string' && arguments.length <= 2 && res.statusCode < 300
        ? findDeclaration(action)
        : null;
      const context = declaration ? contextFor(req) : null;
      const event = context && shouldTrack(context) ? signedEvent(declaration, locals || {}, context, action) : null;

      if (!event) {
        return view.apply(res, arguments);
      }

      return view.call(res, path, locals || {}, (err, html) => {
        if (err) {
          return res.serverError(err);
        }
        return res.send(injectScriptTag(html, { src: scriptSrc, event: event, csrf: res.locals._csrf }));
      });
    };
  };
};
