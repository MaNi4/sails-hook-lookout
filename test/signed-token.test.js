const { test } = require('node:test');
const assert = require('node:assert/strict');
const createSignedToken = require('../lib/signed-token');

const DAY = 24 * 60 * 60 * 1000;
const payload = { name: '$view', properties: { blogId: 2 }, visit: { landingPage: '/a' } };

function signer(time, secret = 'secret') {
  return createSignedToken({ secret: secret, maxAgeMs: DAY, now: () => time });
}

test('a signed token verifies to its payload', () => {
  assert.deepEqual(signer(1000).verify(signer(1000).sign(payload)), payload);
});

test('a changed payload is rejected', () => {
  const [, signature] = signer(1000).sign(payload).split('.');
  const forged = Buffer.from(JSON.stringify({ payload: Object.assign({}, payload, { properties: { blogId: 9 } }), issuedAt: 1000 })).toString('base64url');
  assert.equal(signer(1000).verify(`${forged}.${signature}`), null);
});

test('a token signed with another secret is rejected', () => {
  assert.equal(signer(1000).verify(signer(1000, 'other').sign(payload)), null);
});

test('an expired or future token is rejected', () => {
  const token = signer(1000).sign(payload);
  assert.deepEqual(signer(1000 + DAY).verify(token), payload);
  assert.equal(signer(1000 + DAY + 1).verify(token), null);
  assert.equal(signer(999).verify(token), null);
});

test('malformed input is rejected', () => {
  const s = signer(1000);
  for (const input of [undefined, null, '', 'abc', 'a.b', '.', 42, {}, 'x'.repeat(5000)]) {
    assert.equal(s.verify(input), null);
  }
});
