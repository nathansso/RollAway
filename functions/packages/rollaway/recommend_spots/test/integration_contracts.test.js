'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { menuCompetition, normalizedMenu, competitorRows } = require('../menu_competition');
const { attachWhyLines } = require('../index');

test('normalizes frontend menu objects for the direct Menu RAG endpoint', () => {
  assert.deepEqual(normalizedMenu([{ name: 'Taco', price: 5 }]), {
    items: [{ name: 'Taco', price: 5 }],
  });
  assert.deepEqual(competitorRows([{ name: 'Nearby', fooditems_raw: 'Tacos: Burritos' }]), [
    { name: 'Nearby', items: ['Tacos', 'Burritos'], price_points: [] },
  ]);
});

test('adapts the direct Menu RAG response to deterministic scoring input', async () => {
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => {
      const body = JSON.parse(raw);
      assert.equal(body.menu.items[0].name, 'Taco');
      assert.equal(body.competitors[0].items[0], 'Tacos');
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({
        summary: { max_overlap: 0.7 },
        competitors: [{
          name: 'Nearby', overlap_score: 0.7,
          overlapping_items: [{ my_item: 'Taco', competitor_item: 'Tacos' }],
          price_summary: 'similar prices',
        }],
      }));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const previous = process.env.MENU_RAG_URL;
  process.env.MENU_RAG_URL = `http://127.0.0.1:${server.address().port}/menu_overlap`;
  try {
    const result = await menuCompetition(
      [{ name: 'Taco', price: 5 }],
      [{ name: 'Nearby', fooditems_raw: 'Tacos: Burritos' }],
      {},
    );
    assert.equal(result.overlap_score, 0.7);
    assert.equal(result.overlapping[0].name, 'Nearby');
  } finally {
    if (previous === undefined) delete process.env.MENU_RAG_URL;
    else process.env.MENU_RAG_URL = previous;
    await new Promise((resolve) => server.close(resolve));
  }
});


test('extracts why lines from the direct Spot Scout agent envelope', async () => {
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => {
      const request = JSON.parse(raw);
      assert.equal(request.candidates[0].event_opportunity.event_name, 'Market Night');
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({
        agent: 'spot_scout',
        reply_markdown: 'Top pick.',
        citations: [],
        checklist: null,
        map_actions: [{ id: 'spot-1', reasons: ['Live agent explanation.'], outreach_draft: { subject: 'Vendor inquiry', body: 'Hello event team.' } }],
      }));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const previous = process.env.SPOT_SCOUT_URL;
  process.env.SPOT_SCOUT_URL = `http://127.0.0.1:${server.address().port}/spot_scout`;
  const spot = {
    id: 'spot-1', point: { lat: 37.78, lng: -122.4 }, block_label: 'Test block',
    score: 0.8, verdict: 'good', eliminated: false, violations: [],
    event_opportunity: { event_name: 'Market Night', venue: 'Civic Plaza', start: '2026-07-18T18:00:00', expected_attendance: 5000, event_url: 'https://www.ticketmaster.com/event/123', promoter_name: null },
    score_breakdown: {
      foot_traffic: 0.8,
      competition: { penalty: 0.1, overlapping: [] },
      legality: { pass: true, rule: 'clear', checks: [] },
      closures: { blocked: false }, events: { nearest: null }, travel_minutes: 5,
    },
  };
  try {
    await attachWhyLines([spot], {
      when: { day: 'fri' }, user_profile: { vendor_type: 'truck' },
      dayFull: 'Friday', mealLabel: 'lunch',
    });
    assert.equal(spot.why_one_line, 'Live agent explanation.');
    assert.deepEqual(spot.outreach_draft, { subject: 'Vendor inquiry', body: 'Hello event team.' });
  } finally {
    if (previous === undefined) delete process.env.SPOT_SCOUT_URL;
    else process.env.SPOT_SCOUT_URL = previous;
    await new Promise((resolve) => server.close(resolve));
  }
});
