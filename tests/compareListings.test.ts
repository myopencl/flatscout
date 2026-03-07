import { describe, it, expect } from "vitest";
import { compareListings } from "../src/core/compareListings.js";
import type { Listing } from "@prisma/client";
import type { ListingDetails } from "../src/types/index.js";

function makeListing(overrides: Partial<Listing> = {}): Listing {
  return {
    id: "listing-1",
    source: "immohouse",
    externalId: "66001",
    canonicalUrl: "https://immohouse.pl/oferta/66001",
    urlHash: "abc123",
    status: "active",
    title: "Mieszkanie 3 pokoje Wilda",
    description: "Opis mieszkania",
    price: 599_000,
    currency: "PLN",
    rooms: 3,
    bathrooms: 1,
    areaM2: 53,
    floor: "2",
    neighborhood: "Wilda",
    city: "Poznań",
    region: "Wielkopolskie",
    addressText: "ul. Przykładowa 10",
    lat: 52.4,
    lon: 16.9,
    agencyName: null,
    advertiserType: "private",
    thumbnailUrl: "https://immohouse.pl/img/1.jpg",
    photosJson: ["https://immohouse.pl/img/1.jpg"],
    featuresJson: [],
    rawSummaryJson: {},
    rawDetailsJson: {},
    fingerprint: "fp1",
    publishedAtText: null,
    firstSeenAt: new Date("2024-01-01"),
    lastSeenAt: new Date("2024-01-15"),
    lastCheckedAt: new Date("2024-01-15"),
    lastChangedAt: null,
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-15"),
    ...overrides,
  };
}

function makeDetails(overrides: Partial<ListingDetails> = {}): ListingDetails {
  return {
    source: "immohouse",
    canonicalUrl: "https://immohouse.pl/oferta/66001",
    status: "active",
    title: "Mieszkanie 3 pokoje Wilda",
    price: 599_000,
    rooms: 3,
    areaM2: 53,
    city: "Poznań",
    neighborhood: "Wilda",
    ...overrides,
  };
}

describe("compareListings", () => {
  it("returns hasChanged=false when nothing changed", () => {
    const result = compareListings(makeListing(), makeDetails());
    expect(result.hasChanged).toBe(false);
    expect(result.events).toHaveLength(0);
  });

  it("detects price_down", () => {
    const existing = makeListing({ price: 599_000 });
    const incoming = makeDetails({ price: 560_000 });
    const result = compareListings(existing, incoming);
    expect(result.hasChanged).toBe(true);
    expect(result.events).toContain("price_down");
    expect(result.oldValues["price"]).toBe(599_000);
    expect(result.newValues["price"]).toBe(560_000);
  });

  it("detects price_up", () => {
    const existing = makeListing({ price: 560_000 });
    const incoming = makeDetails({ price: 620_000 });
    const result = compareListings(existing, incoming);
    expect(result.events).toContain("price_up");
  });

  it("detects reactivation", () => {
    const existing = makeListing({ status: "inactive" });
    const incoming = makeDetails({ status: "active" });
    const result = compareListings(existing, incoming);
    expect(result.events).toContain("reactivated");
  });

  it("detects inactivation", () => {
    const existing = makeListing({ status: "active" });
    const incoming = makeDetails({ status: "inactive" });
    const result = compareListings(existing, incoming);
    expect(result.events).toContain("inactive");
  });

  it("detects updated when title changes", () => {
    const existing = makeListing({ title: "Old title" });
    const incoming = makeDetails({ title: "New title" });
    const result = compareListings(existing, incoming);
    expect(result.hasChanged).toBe(true);
    expect(result.events).toContain("updated");
  });

  it("does not emit updated when incoming fields are null/undefined", () => {
    const existing = makeListing({ title: "Some title", rooms: 3 });
    const incoming = makeDetails({ title: undefined, rooms: undefined });
    const result = compareListings(existing, incoming);
    expect(result.events).not.toContain("updated");
  });

  it("detects main photo change", () => {
    const existing = makeListing({ photosJson: ["https://example.com/photo1.jpg"] });
    const incoming = makeDetails({ photos: ["https://example.com/photo_new.jpg"] });
    const result = compareListings(existing, incoming);
    expect(result.hasChanged).toBe(true);
  });
});
