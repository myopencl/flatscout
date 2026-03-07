import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  parseSearchResults,
  parsePrice,
  parseArea,
  parseRooms,
} from "../src/adapters/immohouse/immohouse.parsers.js";

const fixtureHtml = readFileSync(
  join(__dirname, "fixtures/immohouse-results.html"),
  "utf-8"
);

describe("parseSearchResults (Immohouse)", () => {
  it("parses all 4 listing cards from fixture", () => {
    const stubs = parseSearchResults(fixtureHtml);
    expect(stubs.length).toBe(4);
  });

  it("extracts canonical URLs for each listing", () => {
    const stubs = parseSearchResults(fixtureHtml);
    for (const stub of stubs) {
      expect(stub.canonicalUrl).toMatch(/^https:\/\/immohouse\.pl\//);
    }
  });

  it("extracts prices correctly", () => {
    const stubs = parseSearchResults(fixtureHtml);
    const prices = stubs.map((s) => s.price).filter(Boolean);
    expect(prices).toContain(599_000);
    expect(prices).toContain(660_000);
    expect(prices).toContain(430_000);
  });

  it("extracts rooms correctly", () => {
    const stubs = parseSearchResults(fixtureHtml);
    const rooms = stubs.map((s) => s.rooms).filter(Boolean);
    expect(rooms).toContain(3);
    expect(rooms).toContain(4);
  });

  it("extracts area correctly", () => {
    const stubs = parseSearchResults(fixtureHtml);
    const areas = stubs.map((s) => s.areaM2).filter(Boolean);
    expect(areas).toContain(53);
    expect(areas).toContain(68);
    expect(areas).toContain(47.3);
  });

  it("extracts location text", () => {
    const stubs = parseSearchResults(fixtureHtml);
    const locations = stubs.map((s) => s.locationText).filter(Boolean);
    expect(locations.some((l) => l?.includes("Wilda"))).toBe(true);
    expect(locations.some((l) => l?.includes("Grunwald"))).toBe(true);
  });

  it("handles card without price gracefully", () => {
    const stubs = parseSearchResults(fixtureHtml);
    const noPrice = stubs.find((s) => s.canonicalUrl.includes("66003"));
    expect(noPrice).toBeDefined();
    expect(noPrice?.price).toBeUndefined();
    expect(noPrice?.areaM2).toBe(47.3);
  });

  it("sets discoveredAt to ISO-8601 timestamp", () => {
    const stubs = parseSearchResults(fixtureHtml);
    for (const stub of stubs) {
      expect(stub.discoveredAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }
  });

  it("sets source to 'immohouse'", () => {
    const stubs = parseSearchResults(fixtureHtml);
    for (const stub of stubs) {
      expect(stub.source).toBe("immohouse");
    }
  });
});

describe("parsePrice", () => {
  it("parses '599 000 PLN'", () => expect(parsePrice("599 000 PLN")).toBe(599_000));
  it("parses '660000 PLN'", () => expect(parsePrice("660000 PLN")).toBe(660_000));
  it("parses '430 000'", () => expect(parsePrice("430 000")).toBe(430_000));
  it("returns undefined for empty string", () => expect(parsePrice("")).toBeUndefined());
  it("returns undefined for non-numeric", () => expect(parsePrice("Zapytaj")).toBeUndefined());
});

describe("parseArea", () => {
  it("parses '53 m²'", () => expect(parseArea("53 m²")).toBe(53));
  it("parses '47.3 m²'", () => expect(parseArea("47.3 m²")).toBe(47.3));
  it("parses '68,5'", () => expect(parseArea("68,5")).toBe(68.5));
  it("returns undefined for empty string", () => expect(parseArea("")).toBeUndefined());
});

describe("parseRooms", () => {
  it("parses '3 pokoje'", () => expect(parseRooms("3 pokoje")).toBe(3));
  it("parses '4 pokoi'", () => expect(parseRooms("4 pokoi")).toBe(4));
  it("parses '2'", () => expect(parseRooms("2")).toBe(2));
  it("returns undefined for empty string", () => expect(parseRooms("")).toBeUndefined());
});
