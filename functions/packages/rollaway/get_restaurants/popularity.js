/**
 * Pure popularity/opening-hours math for get_restaurants. No I/O, no deps —
 * unit-tested offline (test/restaurants.test.js).
 *
 * Popular-times data is not exposed by any Google API, so venue "busyness" is
 * approximated from review mass (userRatingCount) and rating, and "open during
 * the vendor's setup window" is computed locally from regularOpeningHours
 * periods (cache-safe, works for future windows — unlike a live openNow flag).
 */

'use strict';

const MIN_PER_DAY = 24 * 60;
const MIN_PER_WEEK = 7 * MIN_PER_DAY;

// Google periods use 0=Sunday..6=Saturday; our day args are 'mon'..'sun'.
const GOOGLE_DAY = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

// saturation thresholds: popularity-weighted venues per km^2 of the searched
// circle. Weights are calibrated so a typical venue (~300 reviews, 4.0★) ≈ 1,
// keeping these on the same scale as the raw-count thresholds they replace
// (a dense corridor like Valencia runs >60/km^2; a quiet block <10).
const SATURATION = { medium: 15, high: 40 };

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * Busyness proxy weight for one venue. 1.0 ≈ a typical established venue
 * (~300 reviews, 4.0★); a handful-of-reviews storefront bottoms out at 0.15
 * (0.25 × 0.6); a landmark tops out at 3.75 (3 × 1.25).
 */
function venueWeight({ rating, user_rating_count } = {}) {
  const count = Number(user_rating_count) || 0;
  const mass = clamp(Math.log10(1 + count) / Math.log10(301), 0.25, 3);
  const quality = rating ? clamp(Number(rating) / 4, 0.6, 1.25) : 1;
  return mass * quality;
}

/**
 * Convert Google regularOpeningHours periods into a list of half-open
 * [start, end) intervals in minutes-since-Sunday-00:00. A period that closes
 * on/before it opens wraps past the end of the week and is split in two.
 * Returns null when the venue is always open (a single open with no close).
 */
function periodIntervals(periods) {
  const intervals = [];
  for (const p of periods) {
    if (!p || !p.open) continue;
    if (!p.close) return null; // Google's "always open" encoding
    const start = p.open.day * MIN_PER_DAY + (p.open.hour || 0) * 60 + (p.open.minute || 0);
    const end = p.close.day * MIN_PER_DAY + (p.close.hour || 0) * 60 + (p.close.minute || 0);
    if (end > start) {
      intervals.push([start, end]);
    } else {
      intervals.push([start, MIN_PER_WEEK], [0, end]);
    }
  }
  return intervals;
}

function overlapLen(aStart, aEnd, bStart, bEnd) {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

/**
 * Fraction (0..1) of the requested setup window during which the venue is
 * open. `day` is 'mon'..'sun'; from/to are minutes-since-midnight (to <= from
 * means the window runs overnight into the next day). Venues with no usable
 * hours data count as fully open — conservative when measuring competition.
 */
function windowOverlap(periods, day, fromMin, toMin) {
  if (!Array.isArray(periods) || periods.length === 0) return 1;
  const intervals = periodIntervals(periods);
  if (intervals === null) return 1; // 24/7
  if (intervals.length === 0) return 1; // periods present but unparseable

  const start = GOOGLE_DAY[day] * MIN_PER_DAY + fromMin;
  const duration = toMin > fromMin ? toMin - fromMin : toMin + MIN_PER_DAY - fromMin;
  // Request window as intervals within [0, week), split if it wraps the week.
  const windows = start + duration <= MIN_PER_WEEK
    ? [[start, start + duration]]
    : [[start, MIN_PER_WEEK], [0, (start + duration) % MIN_PER_WEEK]];

  let open = 0;
  for (const [ws, we] of windows) {
    for (const [ps, pe] of intervals) open += overlapLen(ws, we, ps, pe);
  }
  return clamp(open / duration, 0, 1);
}

/** Map a popularity-weighted venue count to the §B saturation enum. */
function saturationVerdict(weightedCount, radius_m) {
  const density = weightedCount / (Math.PI * (radius_m / 1000) ** 2);
  return density >= SATURATION.high ? 'high' : density >= SATURATION.medium ? 'medium' : 'low';
}

module.exports = { venueWeight, windowOverlap, saturationVerdict, SATURATION };
