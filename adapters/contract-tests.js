/**
 * Shared tests every database adapter must pass (see contract.js). Shipped with the
 * package, so an adapter outside this repository can run them too. Its test file
 * calls this with a factory for a real database, using node:test:
 *
 *   const runAdapterContract = require('sails-hook-lookout/adapters/contract-tests');
 *   runAdapterContract('mysql', { createAdapter, reset, close });
 */
const { describe, test, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { assertAdapter } = require('./contract');

const DAY = 24 * 60 * 60 * 1000;

function visit(token, startedAt = new Date()) {
  return {
    visitToken: token, startedAt: startedAt, landingPage: '/sk/blog/a', referringDomain: 'google.com',
    utmSource: 'newsletter', utmMedium: null, utmCampaign: null
  };
}

function event(visitId, name, properties, time = new Date(), id = crypto.randomUUID()) {
  return { id: id, visitId: visitId, name: name, properties: properties, time: time };
}

/**
 * @param {string} name
 * @param {object} options
 * @param {() => object} options.createAdapter returns the adapter connected to an empty test database
 * @param {() => Promise<void>} options.reset migrates the database (adapter.migrate()) and deletes all Lookout data
 * @param {() => Promise<void>} [options.close]
 */
module.exports = function runAdapterContract(name, { createAdapter, reset, close }) {
  describe(`${name} adapter contract`, () => {
    const adapter = createAdapter();
    const since = () => new Date(Date.now() - DAY);

    beforeEach(reset);
    if (close) {
      after(close);
    }

    test('implements every method', () => {
      assertAdapter(adapter, name);
    });

    test('nothing is pending after migrating, and migrating again does nothing', async () => {
      assert.deepEqual(await adapter.pendingMigrations(), []);
      assert.deepEqual(await adapter.migrate(), []);
    });

    test('a day keeps its first salt, also under concurrent calls', async () => {
      // Many first calls of many new days at once, as at midnight UTC with several instances.
      for (let day = 1; day <= 20; day++) {
        const candidates = Array.from({ length: 10 }, (_, i) => `candidate-${i}`);
        const salts = await Promise.all(candidates.map(candidate => adapter.getOrCreateSalt(`2026-10-${String(day).padStart(2, '0')}`, candidate)));
        assert.ok(candidates.includes(salts[0]));
        assert.ok(salts.every(salt => salt === salts[0]));
      }
      const salts = await Promise.all(['a', 'b', 'c', 'd'].map(candidate => adapter.getOrCreateSalt('2026-11-27', candidate)));
      assert.ok(salts.every(salt => salt === salts[0]));
      assert.equal(await adapter.getOrCreateSalt('2026-11-27', 'other'), salts[0]);
      assert.equal(await adapter.getOrCreateSalt('2026-11-28', 'next'), 'next');
    });

    test('deletes salts of earlier days only', async () => {
      await adapter.getOrCreateSalt('2026-11-26', 'old');
      await adapter.getOrCreateSalt('2026-11-27', 'today');
      await adapter.deleteSaltsBefore('2026-11-27');
      assert.equal(await adapter.getOrCreateSalt('2026-11-26', 'new'), 'new');
      assert.equal(await adapter.getOrCreateSalt('2026-11-27', 'other'), 'today');
    });

    test('one visit per token, also under concurrent calls', async () => {
      const ids = await Promise.all([1, 2, 3, 4, 5].map(() => adapter.findOrCreateVisit(visit('token-a'))));
      assert.ok(ids.every(id => String(id) === String(ids[0])));
      assert.notEqual(String(await adapter.findOrCreateVisit(visit('token-b'))), String(ids[0]));
      assert.equal(await adapter.countVisits({ since: since() }), 2);
    });

    test('stores events up to the limit per visit', async () => {
      const id = await adapter.findOrCreateVisit(visit('token-a'));
      for (let i = 0; i < 5; i++) {
        await adapter.insertEvent(event(id, 'blog:view', { blogId: 2 }), 3);
      }
      assert.deepEqual(await adapter.countEvents({ name: 'blog:view', since: since() }), { visitors: 1, events: 3 });
    });

    test('no limit per visit when maxPerVisit is null', async () => {
      const id = await adapter.findOrCreateVisit(visit('token-a'));
      for (let i = 0; i < 120; i++) {
        await adapter.insertEvent(event(id, 'blog:view', { blogId: 2 }), null);
      }
      assert.deepEqual(await adapter.countEvents({ name: 'blog:view', since: since() }), { visitors: 1, events: 120 });
    });

    test('an event is stored once, also when sent many times at once', async () => {
      const id = await adapter.findOrCreateVisit(visit('token-a'));
      const once = event(id, 'blog:view', { blogId: 2 });
      await Promise.all(Array.from({ length: 20 }, () => adapter.insertEvent(once, null)));
      await adapter.insertEvent(once, null);
      assert.deepEqual(await adapter.countEvents({ name: 'blog:view', since: since() }), { visitors: 1, events: 1 });
    });

    test('events without an id (tokens from before 0.4.0) are all stored', async () => {
      const id = await adapter.findOrCreateVisit(visit('token-a'));
      await adapter.insertEvent(event(id, 'blog:view', { blogId: 2 }, new Date(), null), null);
      await adapter.insertEvent(event(id, 'blog:view', { blogId: 2 }, new Date(), null), null);
      assert.deepEqual(await adapter.countEvents({ name: 'blog:view', since: since() }), { visitors: 1, events: 2 });
    });

    test('counts and ranks events by name and property', async () => {
      const a = await adapter.findOrCreateVisit(visit('token-a'));
      const b = await adapter.findOrCreateVisit(visit('token-b'));
      await adapter.insertEvent(event(a, 'blog:view', { blogId: 2 }), null);
      await adapter.insertEvent(event(a, 'blog:view', { blogId: 2 }), null);
      await adapter.insertEvent(event(b, 'blog:view', { blogId: 2 }), null);
      await adapter.insertEvent(event(b, 'blog:view', { blogId: 7 }), null);
      await adapter.insertEvent(event(b, 'document:download', { blogId: 7 }), null);
      await adapter.insertEvent(event(b, 'blog:view', { other: 1 }), null);

      assert.deepEqual(await adapter.countEvents({ name: 'blog:view', since: since() }), { visitors: 2, events: 5 });
      assert.deepEqual(await adapter.countEvents({ name: 'document:download', since: since() }), { visitors: 1, events: 1 });
      assert.deepEqual(await adapter.topEvents({ name: 'blog:view', property: 'blogId', since: since(), limit: 10 }), [
        { value: '2', visitors: 2, events: 3 },
        { value: '7', visitors: 1, events: 1 }
      ]);
      assert.deepEqual(await adapter.topEvents({ name: 'blog:view', property: 'blogId', since: since(), limit: 1 }), [
        { value: '2', visitors: 2, events: 3 }
      ]);
    });

    test('reports only the requested period', async () => {
      const old = await adapter.findOrCreateVisit(visit('token-old', new Date(Date.now() - 3 * DAY)));
      await adapter.insertEvent(event(old, 'blog:view', { blogId: 2 }, new Date(Date.now() - 3 * DAY)), null);
      assert.equal(await adapter.countVisits({ since: since() }), 0);
      assert.deepEqual(await adapter.countEvents({ name: 'blog:view', since: since() }), { visitors: 0, events: 0 });
      assert.deepEqual(await adapter.topEvents({ name: 'blog:view', property: 'blogId', since: since(), limit: 10 }), []);
    });

    test('deletes old visits with their events', async () => {
      const old = await adapter.findOrCreateVisit(visit('token-old', new Date(Date.now() - 3 * DAY)));
      const recent = await adapter.findOrCreateVisit(visit('token-new'));
      await adapter.insertEvent(event(old, 'blog:view', { blogId: 2 }), null);
      await adapter.insertEvent(event(recent, 'blog:view', { blogId: 2 }), null);

      await adapter.deleteVisitsBefore(new Date(Date.now() - 2 * DAY));

      assert.equal(await adapter.countVisits({ since: new Date(0) }), 1);
      assert.deepEqual(await adapter.countEvents({ name: 'blog:view', since: new Date(0) }), { visitors: 1, events: 1 });
    });
  });
};
