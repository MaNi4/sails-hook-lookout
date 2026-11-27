/**
 * Built-in adapters by the name of the Sails adapter the datastore uses.
 * Adding a database = adding a folder here and one line below.
 */
const BUILT_IN = {
  'sails-postgresql': require('./postgresql')
};

/**
 * @param {object} options
 * @param {Function|null} options.custom `sails.config.lookout.adapter`, takes precedence
 * @param {string} options.datastoreAdapter e.g. 'sails-postgresql'
 * @returns {{ name: string, create: (datastore) => object }}
 * @throws {Error} when the database is not supported
 */
module.exports = function resolveAdapter({ custom, datastoreAdapter }) {
  if (custom !== undefined && custom !== null) {
    if (typeof custom !== 'function') {
      throw new Error('Lookout: `adapter` must be a function (datastore) => adapter.');
    }
    return { name: 'custom', create: custom };
  }
  if (Object.prototype.hasOwnProperty.call(BUILT_IN, datastoreAdapter)) {
    return { name: datastoreAdapter, create: BUILT_IN[datastoreAdapter] };
  }
  throw new Error(
    `Lookout: datastore adapter "${datastoreAdapter}" is not supported. ` +
    `Built in: ${Object.keys(BUILT_IN).join(', ')}. Set \`adapter\` in config/lookout.js to use your own (see adapters/contract.js).`
  );
};
