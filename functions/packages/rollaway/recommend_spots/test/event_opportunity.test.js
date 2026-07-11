'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { pickEventOpportunity } = require('../score');

test('selects nearest attendance-backed event within candidate radius', () => {
  const opportunity = pickEventOpportunity(
    { lat: 37.78, lng: -122.4 },
    { events: [
      { name: 'Unknown crowd', venue: 'Nearby', point: { lat: 37.7801, lng: -122.4 }, expected_attendance: null },
      { name: 'Market Night', venue: 'Civic Plaza', point: { lat: 37.781, lng: -122.4 }, start: '2026-07-18T18:00:00', expected_attendance: 5000, event_url: 'https://www.ticketmaster.com/event/123', promoter_name: null },
    ] },
    500,
  );
  assert.deepEqual(opportunity, {
    event_name: 'Market Night', venue: 'Civic Plaza', start: '2026-07-18T18:00:00',
    expected_attendance: 5000, event_url: 'https://www.ticketmaster.com/event/123', promoter_name: null,
  });
});

test('returns null for events without attendance or outside radius', () => {
  assert.equal(pickEventOpportunity(
    { lat: 37.78, lng: -122.4 },
    { events: [{ name: 'Far show', venue: 'Far', point: { lat: 37.8, lng: -122.4 }, expected_attendance: 1000 }] },
    100,
  ), null);
});
