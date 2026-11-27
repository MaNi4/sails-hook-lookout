const { test } = require('node:test');
const assert = require('node:assert/strict');
const createTracker = require('../lib/tracker');

function setup({ maxEventsPerVisit = null } = {}) {
  const visits = [];
  const events = [];
  const store = {
    findOrCreateVisit: async function (visit) {
      let index = visits.findIndex(v => v.visitToken === visit.visitToken);
      if (index === -1) {
        index = visits.push(visit) - 1;
      }
      return index + 1;
    },
    insertEvent: async function (event, maxPerVisit) {
      const duplicate = event.id !== null && events.some(e => e.id === event.id);
      const full = maxPerVisit !== null && events.filter(e => e.visitId === event.visitId).length >= maxPerVisit;
      if (!duplicate && !full) {
        events.push(event);
      }
    }
  };
  const identity = { visitToken: async context => `token-${context.ip}` };
  const isBot = userAgent => /bot/i.test(userAgent);
  const time = new Date('2026-11-27T10:00:00Z');
  const tracker = createTracker({ store: store, identity: identity, isBot: isBot, maxEventsPerVisit: maxEventsPerVisit, now: () => time });
  return { tracker, visits, events, time };
}

const person = { ip: '1.2.3.4', userAgent: 'Mozilla/5.0 Firefox', globalPrivacyControl: false, doNotTrack: false, excluded: false };
const visit = { landingPage: '/sk/blog/a', referringDomain: null };
const view = { id: 'event-1', name: '$view', properties: { blogId: 12 }, visit: visit };
let nextId = 0;
const newView = () => Object.assign({}, view, { id: `event-${++nextId}` });

test('records the event and creates the visit on first event', async () => {
  const { tracker, visits, events, time } = setup();
  assert.equal(await tracker.track(person, view), true);
  assert.deepEqual(visits, [{ landingPage: '/sk/blog/a', referringDomain: null, visitToken: 'token-1.2.3.4', startedAt: time }]);
  assert.deepEqual(events, [{ id: 'event-1', visitId: 1, name: '$view', properties: { blogId: 12 }, time: time }]);
});

test('later events of the same visitor reuse the visit', async () => {
  const { tracker, visits, events } = setup();
  await tracker.track(person, newView());
  await tracker.track(person, newView());
  assert.equal(visits.length, 1);
  assert.equal(events.length, 2);
});

test('an event sent again is recorded once', async () => {
  const { tracker, events } = setup();
  await tracker.track(person, view);
  await tracker.track(person, view);
  assert.equal(events.length, 1);
});

test('events of tokens without an id (before 0.4.0) are recorded', async () => {
  const { tracker, events } = setup();
  const old = { name: '$view', properties: {}, visit: visit };
  await tracker.track(person, old);
  await tracker.track(person, old);
  assert.equal(events.length, 2);
  assert.equal(events[0].id, null);
});

test('no limit per visit by default', async () => {
  const { tracker, events } = setup();
  for (let i = 0; i < 150; i++) {
    await tracker.track(person, newView());
  }
  assert.equal(events.length, 150);
});

test('maxEventsPerVisit limits a visit', async () => {
  const { tracker, events } = setup({ maxEventsPerVisit: 5 });
  for (let i = 0; i < 8; i++) {
    await tracker.track(person, newView());
  }
  assert.equal(events.length, 5);
});

for (const [reason, context] of [
  ['bots', Object.assign({}, person, { userAgent: 'Googlebot/2.1' })],
  ['Global Privacy Control', Object.assign({}, person, { globalPrivacyControl: true })],
  ['Do Not Track', Object.assign({}, person, { doNotTrack: true })],
  ['excluded requests', Object.assign({}, person, { excluded: true })]
]) {
  test(`writes nothing for ${reason}`, async () => {
    const { tracker, visits, events } = setup();
    assert.equal(await tracker.track(context, view), false);
    assert.equal(visits.length, 0);
    assert.equal(events.length, 0);
  });
}
