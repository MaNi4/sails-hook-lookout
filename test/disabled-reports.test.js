const { test } = require('node:test');
const assert = require('node:assert/strict');
const disabledReports = require('../lib/disabled-reports');
const { METHODS } = require('../adapters/contract');

test('disabled reports answer every report method with empty results', async () => {
  assert.equal(await disabledReports.countVisits({ since: new Date() }), 0);
  assert.deepEqual(await disabledReports.countEvents({ name: 'blog:view', since: new Date() }), { visitors: 0, events: 0 });
  assert.deepEqual(await disabledReports.topEvents({ name: 'blog:view', property: 'blogId', since: new Date(), limit: 10 }), []);
  ['countVisits', 'countEvents', 'topEvents'].forEach(method => assert.ok(METHODS.includes(method)));
});
