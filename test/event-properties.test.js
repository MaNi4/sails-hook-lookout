const { test } = require('node:test');
const assert = require('node:assert/strict');
const { isValidEventProperties } = require('../lib/event-properties');

test('accepts a small flat object of primitives', () => {
  assert.equal(isValidEventProperties({}), true);
  assert.equal(isValidEventProperties({ blogId: 2, slug: 'a', draft: false }), true);
});

test('rejects anything else', () => {
  assert.equal(isValidEventProperties(null), false);
  assert.equal(isValidEventProperties([1]), false);
  assert.equal(isValidEventProperties('x'), false);
  assert.equal(isValidEventProperties({ nested: { a: 1 } }), false);
  assert.equal(isValidEventProperties({ id: NaN }), false);
  assert.equal(isValidEventProperties({ text: 'x'.repeat(201) }), false);
  assert.equal(isValidEventProperties({ 'bad key': 1 }), false);

  const tooMany = {};
  for (let i = 0; i < 11; i++) { tooMany[`k${i}`] = i; }
  assert.equal(isValidEventProperties(tooMany), false);
});
