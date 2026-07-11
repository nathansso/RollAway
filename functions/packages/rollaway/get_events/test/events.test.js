'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { mapTicketmasterEvent, fixtureEvents } = require('../index');

test('maps only Ticketmaster-provided public contact fields', () => {
  const event = mapTicketmasterEvent({
    name: 'Market Night',
    url: 'https://www.ticketmaster.com/event/123',
    promoters: [{ name: 'SF Events LLC' }],
    dates: { start: { localDate: '2026-07-18', localTime: '18:00:00' } },
    _embedded: { venues: [{
      name: 'Oracle Park', city: { name: 'San Francisco' },
      location: { latitude: '37.7786', longitude: '-122.3893' },
    }] },
  }, '2026-07-18', '2026-07-18');

  assert.equal(event.event_url, 'https://www.ticketmaster.com/event/123');
  assert.equal(event.promoter_name, 'SF Events LLC');
  assert.equal(event.expected_attendance, 40000);
});

test('keeps promoter and event URL null when Ticketmaster omits them', () => {
  const event = mapTicketmasterEvent({
    name: 'Unknown Promoter Show',
    dates: { start: { localDate: '2026-07-18' } },
    _embedded: { venues: [{
      name: 'Small SF Venue', city: { name: 'San Francisco' },
      location: { latitude: '37.78', longitude: '-122.4' },
    }] },
  }, '2026-07-18', '2026-07-18');

  assert.equal(event.event_url, null);
  assert.equal(event.promoter_name, null);
  assert.equal(event.expected_attendance, null);
});

test('fixture output always contains nullable contact fields', () => {
  const events = fixtureEvents(37.78, -122.4, 3000, '2026-07-18');
  assert.ok(events.length > 0);
  for (const event of events) {
    assert.ok(Object.hasOwn(event, 'event_url'));
    assert.ok(Object.hasOwn(event, 'promoter_name'));
    assert.equal(event.promoter_name, null);
  }
});
