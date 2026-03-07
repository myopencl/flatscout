import { describe, it, expect } from "vitest";
import { canonicalizeUrl, hashUrl } from "../src/core/canonicalizeUrl.js";

describe("canonicalizeUrl", () => {
  it("normalizes OLX mobile host to www", () => {
    const result = canonicalizeUrl(
      "olx",
      "https://m.olx.pl/nieruchomosci/mieszkania/sprzedaz/poznan/ID123.html"
    );
    expect(result).toContain("www.olx.pl");
    expect(result).not.toContain("m.olx.pl");
  });

  it("removes UTM tracking params", () => {
    const result = canonicalizeUrl(
      "immohouse",
      "https://immohouse.pl/oferta/123?utm_source=google&utm_medium=cpc"
    );
    expect(result).not.toContain("utm_source");
    expect(result).not.toContain("utm_medium");
  });

  it("removes fragments", () => {
    const result = canonicalizeUrl("olx", "https://www.olx.pl/oferta/123#gallery");
    expect(result).not.toContain("#gallery");
  });

  it("enforces HTTPS", () => {
    const result = canonicalizeUrl("immohouse", "http://immohouse.pl/oferta/123");
    expect(result).toMatch(/^https:\/\//);
  });

  it("lowercases the host", () => {
    const result = canonicalizeUrl("immohouse", "https://IMMOHOUSE.PL/oferta/123");
    expect(result).toContain("immohouse.pl");
  });

  it("removes trailing slash on path", () => {
    const result = canonicalizeUrl("olx", "https://www.olx.pl/oferta/123/");
    expect(result).not.toMatch(/\/$/);
  });

  it("keeps root path intact", () => {
    const result = canonicalizeUrl("olx", "https://www.olx.pl/");
    expect(result).toMatch(/\/$/);
  });

  it("preserves meaningful query params", () => {
    const url =
      "https://www.otodom.pl/pl/oferta/mieszkanie-123?priceMin=400000&priceMax=700000";
    const result = canonicalizeUrl("otodom", url);
    expect(result).toContain("priceMin=400000");
    expect(result).toContain("priceMax=700000");
  });
});

describe("hashUrl", () => {
  it("returns a 64-char hex string (SHA-256)", () => {
    const hash = hashUrl("https://immohouse.pl/oferta/123");
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]+$/);
  });

  it("is deterministic for the same URL", () => {
    const url = "https://immohouse.pl/oferta/456";
    expect(hashUrl(url)).toBe(hashUrl(url));
  });

  it("differs for different URLs", () => {
    expect(hashUrl("https://immohouse.pl/a")).not.toBe(hashUrl("https://immohouse.pl/b"));
  });
});
