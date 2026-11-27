const { test } = require('node:test');
const assert = require('node:assert/strict');
const createMaintenance = require('../lib/maintenance');

test('deletes past salts and data older than the retention period', async () => {
  const calls = {};
  const store = {
    deleteSaltsBefore: async day => { calls.saltsBefore = day; },
    deleteVisitsBefore: async time => { calls.visitsBefore = time; }
  };
  const now = new Date('2026-11-27T10:00:00Z');
  await createMaintenance({ store: store, retentionDays: 395, now: () => now }).run();

  assert.equal(calls.saltsBefore, '2026-11-27');
  assert.equal(calls.visitsBefore.toISOString(), '2025-10-28T10:00:00.000Z');
});
