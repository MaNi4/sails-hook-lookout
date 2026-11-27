const injectScriptTag = require('./script-tag');

/**
 * Pages rendered with `res.view` (an exit with `viewTemplatePath`): the page of
 * a declared action gets the Lookout script with its signed event.
 *
 * @param {object} deps
 * @param {(actionIdentity: string) => ({ name, properties?, renderer })|undefined} deps.findDeclaration
 * @param {(req, declaration, action, locals) => string|null} deps.pageEvent
 * @param {string} deps.scriptSrc
 */
module.exports = function createViewTracking({ findDeclaration, pageEvent, scriptSrc }) {
  /**
   * Replaces res.view for one request. Only the plain `res.view(path[, locals])`
   * form used by actions is handled; any other call is passed through untouched.
   * The action is read when the view renders: before that, routing has not picked it.
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
        : undefined;
      // An Inertia action renders its root view too; its event travels in the page props instead.
      const event = declaration && declaration.renderer === 'view'
        ? pageEvent(req, declaration, action, locals)
        : null;

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
