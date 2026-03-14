import { describe, it, expect } from "vitest";
import { computeMatchScore } from "../src/core/scoring.js";
import type { SearchFilters } from "../src/types/index.js";

const baseFilters: SearchFilters = {
  operation: "buy",
  propertyType: "flat",
  city: "Poznań",
  priceMin: 400_000,
  priceMax: 700_000,
  areaMin: 40,
  rooms: 3,
};

describe("computeMatchScore", () => {
  it("returns 1.0 for a perfect match", () => {
    const score = computeMatchScore(
      { price: 550_000, rooms: 3, areaM2: 65, city: "Poznań" },
      baseFilters
    );
    expect(score).toBe(1.0);
  });

  it("returns 1.0 when no filters are active", () => {
    const score = computeMatchScore(
      { price: 999_999, rooms: 10 },
      { operation: "buy", propertyType: "flat" }
    );
    expect(score).toBe(1.0);
  });

  it("penalises price slightly above max by 10% (score 0.5 for that criterion)", () => {
    // priceMax = 700k; 10% above = 770k → score for price = 0.5
    const score = computeMatchScore(
      { price: 765_000, rooms: 3, areaM2: 65, city: "Poznań" },
      baseFilters
    );
    // price=0.5, rooms=1.0, area=1.0, city=1.0 → avg = 3.5/4 = 0.875
    expect(score).toBeCloseTo(0.875, 3);
  });

  it("returns 0 contribution for price far above max", () => {
    const score = computeMatchScore(
      { price: 1_000_000, rooms: 3, areaM2: 65, city: "Poznań" },
      baseFilters
    );
    // price=0, rooms=1, area=1, city=1 → avg = 3/4 = 0.75
    expect(score).toBeCloseTo(0.75, 3);
  });

  it("penalises rooms off by 1 (score 0.5 for that criterion)", () => {
    const score = computeMatchScore(
      { price: 550_000, rooms: 2, areaM2: 65, city: "Poznań" },
      baseFilters
    );
    // price=1, rooms=0.5, area=1, city=1 → avg = 3.5/4 = 0.875
    expect(score).toBeCloseTo(0.875, 3);
  });

  it("scores rooms 0 when far off", () => {
    const score = computeMatchScore(
      { price: 550_000, rooms: 5, areaM2: 65, city: "Poznań" },
      baseFilters
    );
    // price=1, rooms=0, area=1, city=1 → avg = 3/4 = 0.75
    expect(score).toBeCloseTo(0.75, 3);
  });

  it("scores city 0 for different city", () => {
    const score = computeMatchScore(
      { price: 550_000, rooms: 3, areaM2: 65, city: "Warszawa" },
      baseFilters
    );
    // price=1, rooms=1, area=1, city=0 → avg = 3/4 = 0.75
    expect(score).toBeCloseTo(0.75, 3);
  });

  it("scores city 0.5 for unknown (null) city", () => {
    const score = computeMatchScore(
      { price: 550_000, rooms: 3, areaM2: 65, city: null },
      baseFilters
    );
    // price=1, rooms=1, area=1, city=0.5 → avg = 3.5/4 = 0.875
    expect(score).toBeCloseTo(0.875, 3);
  });

  it("ignores diacritics in city comparison", () => {
    // "Poznan" vs filter "Poznań"
    const score = computeMatchScore(
      { price: 550_000, rooms: 3, areaM2: 65, city: "Poznan" },
      baseFilters
    );
    expect(score).toBe(1.0);
  });

  it("is case-insensitive for city", () => {
    const score = computeMatchScore(
      { price: 550_000, rooms: 3, areaM2: 65, city: "POZNAŃ" },
      baseFilters
    );
    expect(score).toBe(1.0);
  });

  it("scores unknown price as 0.5 (benefit of the doubt)", () => {
    const score = computeMatchScore(
      { price: null, rooms: 3, areaM2: 65, city: "Poznań" },
      baseFilters
    );
    // price=0.5, rooms=1, area=1, city=1 → avg = 3.5/4 = 0.875
    expect(score).toBeCloseTo(0.875, 3);
  });

  it("returns value between 0 and 1 inclusive for any input", () => {
    const extremes = [
      { price: 0, rooms: 0, areaM2: 0, city: "Kraków" },
      { price: 1_000_000, rooms: 10, areaM2: 200, city: null },
    ];
    for (const listing of extremes) {
      const s = computeMatchScore(listing, baseFilters);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(1);
    }
  });

  it("rounds to 4 decimal places", () => {
    const score = computeMatchScore(
      { price: 765_000, rooms: 3, areaM2: 65, city: "Poznań" },
      baseFilters
    );
    const decimals = score.toString().split(".")[1]?.length ?? 0;
    expect(decimals).toBeLessThanOrEqual(4);
  });
});
