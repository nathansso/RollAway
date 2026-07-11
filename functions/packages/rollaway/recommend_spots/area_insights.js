'use strict';

const HYDRANT_RULE = /hydrant/i;

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function permitChecks(clearance) {
  const checks = clearance && Array.isArray(clearance.checks) ? clearance.checks : [];
  return checks
    .filter((check) => check && !HYDRANT_RULE.test(String(check.rule || '')))
    .map((check) => ({
      rule: String(check.rule || 'placement requirement'),
      pass: check.pass === true,
      required_ft: finiteNumber(check.required_ft),
      actual_ft: finiteNumber(check.actual_ft),
      cite: typeof check.cite === 'string' ? check.cite : null,
    }));
}

function localCuisine(restaurants, competition) {
  const source = restaurants && restaurants.window && restaurants.window.open_by_cuisine
    ? restaurants.window.open_by_cuisine
    : restaurants && restaurants.by_cuisine;
  const nearby = Object.entries(source || {})
    .map(([cuisine, count]) => ({ cuisine, count: Math.max(0, Number(count) || 0) }))
    .filter((row) => row.count > 0)
    .sort((a, b) => b.count - a.count || a.cuisine.localeCompare(b.cuisine))
    .slice(0, 5);
  const overlapping = competition && Array.isArray(competition.overlapping)
    ? competition.overlapping
    : [];
  const menuOverlapCount = overlapping.length;
  return {
    nearby,
    menu_overlap_count: menuOverlapCount,
    opportunity: menuOverlapCount === 0
      ? 'low_direct_overlap'
      : menuOverlapCount <= 2 ? 'some_direct_overlap' : 'high_direct_overlap',
  };
}

function buildAreaInsights({ point, signals, competition, eliminated, travel, travelMode }) {
  const clearance = signals.clearance || {};
  const checks = permitChecks(clearance);
  const failedChecks = checks.filter((check) => !check.pass);
  const closureBlocked = Boolean(signals.closures && signals.closures.count > 0 && eliminated);
  const suitability = eliminated || failedChecks.length > 0
    ? 'avoid'
    : clearance.allowed === undefined ? 'verify' : 'recommended';

  return {
    parking: {
      point,
      suitability,
      permit_checks: checks,
      note: closureBlocked
        ? 'An active closure or placement restriction affects this target.'
        : suitability === 'recommended'
          ? 'Non-hydrant placement checks pass at this point. Verify posted curb and parking signs before stopping or operating.'
          : 'Clearance data is incomplete. Verify posted curb signs and placement requirements before stopping or operating.',
    },
    local_cuisine: localCuisine(signals.restaurants, competition),
    navigation: {
      destination: point,
      mode: travelMode || 'driving',
      minutes: travel && Number.isFinite(travel.minutes) ? travel.minutes : null,
      estimated: !travel || travel.estimated !== false,
    },
  };
}

module.exports = { buildAreaInsights, permitChecks, localCuisine };
