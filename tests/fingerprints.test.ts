import { describe, it, expect } from "vitest";
import { computeFingerprint } from "../src/core/fingerprints.js";
import type { ListingDetails } from "../src/types/index.js";

const base: Partial<ListingDetails> = {
  price: 599_000,
  areaM2: 53,
  rooms: 3,
  city: "Poznań",
  neighborhood: "Wilda",
  agencyName: null,
  addressText: "ul. Przykładowa 10",
  description: "Piękne mieszkanie w sercu Poznania. Trzy pokoje.",
};

describe("computeFingerprint", () => {
  it("returns a 64-char hex string", () => {
    const fp = computeFingerprint(base);
    expect(fp).toHaveLength(64);
    expect(fp).toMatch(/^[0-9a-f]+$/);
  });

  it("is deterministic for the same input", () => {
    expect(computeFingerprint(base)).toBe(computeFingerprint(base));
  });

  it("is stable across minor price edits (within 5000 PLN rounding)", () => {
    const slightlyHigher = { ...base, price: 601_000 }; // rounds to 600 000
    const original = { ...base, price: 599_000 };        // rounds to 600 000
    expect(computeFingerprint(slightlyHigher)).toBe(computeFingerprint(original));
  });

  it("differs for significantly different prices", () => {
    const cheap = { ...base, price: 400_000 };
    const expensive = { ...base, price: 700_000 };
    expect(computeFingerprint(cheap)).not.toBe(computeFingerprint(expensive));
  });

  it("differs for different areas", () => {
    const small = { ...base, areaM2: 40 };
    const large = { ...base, areaM2: 90 };
    expect(computeFingerprint(small)).not.toBe(computeFingerprint(large));
  });

  it("is stable across diacritics differences in location", () => {
    // "Poznan" vs "Poznań" – diacritics stripped before hashing
    const a = { ...base, city: "Poznan" };
    const b = { ...base, city: "Poznań" };
    expect(computeFingerprint(a)).toBe(computeFingerprint(b));
  });

  it("handles missing optional fields gracefully", () => {
    const sparse: Partial<ListingDetails> = { price: 500_000, areaM2: 60, rooms: 3 };
    const fp = computeFingerprint(sparse);
    expect(fp).toHaveLength(64);
  });
});
