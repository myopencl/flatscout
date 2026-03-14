import type { SearchFilters } from "../types/index.js";

/**
 * Compute a match score (0.0 – 1.0) indicating how well a listing satisfies
 * the saved-search filters.
 *
 * Even though portals already filter results by the search criteria, in
 * practice they sometimes return near-misses (e.g. price slightly over max,
 * wrong number of rooms due to parsing differences, etc.).
 *
 * The score is written to SearchListingMatch.currentMatchScore at crawl time
 * and can be manually overridden via the PATCH /api/v1/listings/:id/score
 * endpoint.
 *
 * Scoring breakdown (equal weight per active filter):
 *  - price:   1.0 if within [priceMin, priceMax]
 *             0.5 if within 10 % outside the range
 *             0.0 otherwise (or if price is unknown)
 *  - area:    same logic as price against [areaMin, areaMax]
 *  - rooms:   1.0 if exact match OR within a declared rooms range
 *             0.0 otherwise (or if rooms unknown)
 *  - city:    1.0 if city matches (case-insensitive)
 *             0.5 if city is unknown
 *             0.0 if different city
 *
 * Only filters that are actually set on the search contribute to the score.
 * If no filter is active the score defaults to 1.0.
 */
export interface ScoredListing {
  price?: number | null;
  rooms?: number | null;
  areaM2?: number | null;
  city?: string | null;
}

export function computeMatchScore(
  listing: ScoredListing,
  filters: SearchFilters
): number {
  const criteria: number[] = [];

  // --- Price ---
  const hasPrice = filters.priceMin != null || filters.priceMax != null;
  if (hasPrice) {
    criteria.push(scoreRange(listing.price, filters.priceMin, filters.priceMax));
  }

  // --- Area ---
  const hasArea = filters.areaMin != null || filters.areaMax != null;
  if (hasArea) {
    criteria.push(scoreRange(listing.areaM2, filters.areaMin, filters.areaMax));
  }

  // --- Rooms ---
  if (filters.rooms != null) {
    criteria.push(scoreRooms(listing.rooms, filters.rooms));
  }

  // --- City ---
  if (filters.city != null) {
    criteria.push(scoreCity(listing.city, filters.city));
  }

  if (criteria.length === 0) return 1.0;

  const avg = criteria.reduce((a, b) => a + b, 0) / criteria.length;
  // Round to 4 decimal places
  return Math.round(avg * 10_000) / 10_000;
}

// ---------------------------------------------------------------------------
// Individual field scorers
// ---------------------------------------------------------------------------

/**
 * Score a numeric value against an optional [min, max] range.
 * Returns 1.0 inside range, 0.5 within 10% outside, 0.0 beyond that.
 */
function scoreRange(
  value: number | null | undefined,
  min: number | null | undefined,
  max: number | null | undefined
): number {
  if (value == null) return 0.5; // unknown – give benefit of the doubt

  if (min != null && value < min) {
    const tolerance = min * 0.1;
    return min - value <= tolerance ? 0.5 : 0.0;
  }

  if (max != null && value > max) {
    const tolerance = max * 0.1;
    return value - max <= tolerance ? 0.5 : 0.0;
  }

  return 1.0;
}

/**
 * Score rooms: exact match = 1.0, off by 1 = 0.5, further = 0.0.
 */
function scoreRooms(
  rooms: number | null | undefined,
  target: number
): number {
  if (rooms == null) return 0.5;
  if (rooms === target) return 1.0;
  if (Math.abs(rooms - target) === 1) return 0.5;
  return 0.0;
}

/**
 * Score city match (case- and diacritic-insensitive comparison).
 */
function scoreCity(
  city: string | null | undefined,
  target: string
): number {
  if (!city) return 0.5;
  return normalize(city) === normalize(target) ? 1.0 : 0.0;
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}
