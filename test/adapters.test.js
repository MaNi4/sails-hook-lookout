const { test } = require('node:test');
const assert = require('node:assert/strict');
const resolveAdapter = require('../adapters');
const { assertAdapter, METHODS } = require('../adapters/contract');

test('picks the built-in adapter of the datastore', () => {
  const adapter = resolveAdapter({ custom: null, datastoreAdapter: 'sails-postgresql' });
  assert.equal(adapter.name, 'sails-postgresql');
  assert.equal(typeof adapter.create, 'function');
});

test('a custom adapter takes precedence', () => {
  const custom = () => ({});
  assert.deepEqual(resolveAdapter({ custom: custom, datastoreAdapter: 'sails-mysql' }), { name: 'custom', create: custom });
  assert.throws(() => resolveAdapter({ custom: {}, datastoreAdapter: 'sails-postgresql' }), /must be a function/);
});

test('an unsupported database fails with the supported list', () => {
  assert.throws(() => resolveAdapter({ custom: null, datastoreAdapter: 'sails-mysql' }), /"sails-mysql" is not supported\. Built in: sails-postgresql/);
  assert.throws(() => resolveAdapter({ custom: null, datastoreAdapter: undefined }), /not supported/);
});

test('the built-in postgresql adapter implements the contract', () => {
  const adapter = resolveAdapter({ custom: null, datastoreAdapter: 'sails-postgresql' }).create({ sendNativeQuery: async () => ({ rows: [] }) });
  assert.equal(assertAdapter(adapter, 'sails-postgresql'), adapter);
});

test('an incomplete adapter is rejected with the missing methods', () => {
  const partial = {};
  METHODS.slice(1).forEach(method => { partial[method] = () => {}; });
  assert.throws(() => assertAdapter(partial, 'mine'), /adapter "mine" is missing getOrCreateSalt/);
});
