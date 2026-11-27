const { test } = require('node:test');
const assert = require('node:assert/strict');
const createVisitorIdentity = require('../lib/visitor-identity');

function fakeSaltStore() {
  const salts = {};
  return {
    calls: 0,
    getOrCreateSalt: async function (day, candidate) {
      this.calls++;
      salts[day] = salts[day] || candidate;
      return salts[day];
    }
  };
}

const visitor = { ip: '203.0.113.7', userAgent: 'Mozilla/5.0 Firefox/130.0' };
const morning = new Date('2026-11-27T08:00:00Z');
const evening = new Date('2026-11-27T22:00:00Z');
const nextDay = new Date('2026-11-28T08:00:00Z');

test('same visitor on the same day gets the same token', async () => {
  const identity = createVisitorIdentity(fakeSaltStore());
  assert.equal(await identity.visitToken(visitor, morning), await identity.visitToken(visitor, evening));
});

test('token changes with the day, the IP and the user agent', async () => {
  const identity = createVisitorIdentity(fakeSaltStore());
  const token = await identity.visitToken(visitor, morning);
  assert.notEqual(await identity.visitToken(visitor, nextDay), token);
  assert.notEqual(await identity.visitToken(Object.assign({}, visitor, { ip: '203.0.113.8' }), morning), token);
  assert.notEqual(await identity.visitToken(Object.assign({}, visitor, { userAgent: 'Other' }), morning), token);
});

test('token does not contain the IP', async () => {
  const identity = createVisitorIdentity(fakeSaltStore());
  const token = await identity.visitToken(visitor, morning);
  assert.match(token, /^[0-9a-f]{64}$/);
  assert.ok(!token.includes(visitor.ip));
});

test('salt is loaded once per day', async () => {
  const store = fakeSaltStore();
  const identity = createVisitorIdentity(store);
  await identity.visitToken(visitor, morning);
  await identity.visitToken(visitor, evening);
  assert.equal(store.calls, 1);
  await identity.visitToken(visitor, nextDay);
  assert.equal(store.calls, 2);
});
