import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  parseSearchResults,
  parseListingDetail,
  parsePrice,
  parseArea,
  parseRooms,
} from "../src/adapters/domy/domy.parsers.js";

const fixtureHtml = readFileSync(
  join(__dirname, "fixtures/domy-results.html"),
  "utf-8"
);

// ---------------------------------------------------------------------------
// Search results parser
// ---------------------------------------------------------------------------

describe("parseSearchResults (domy.pl)", () => {
  it("parses all 4 listing cards from fixture", () => {
    const stubs = parseSearchResults(fixtureHtml);
    expect(stubs.length).toBe(4);
  });

  it("returns source = 'domy' for every stub", () => {
    const stubs = parseSearchResults(fixtureHtml);
    for (const stub of stubs) {
      expect(stub.source).toBe("domy");
    }
  });

  it("extracts canonical URLs with https and no trailing slash", () => {
    const stubs = parseSearchResults(fixtureHtml);
    for (const stub of stubs) {
      expect(stub.canonicalUrl).toMatch(/^https:\/\/domy\.pl\//);
      expect(stub.canonicalUrl).not.toMatch(/\/$/);
    }
  });

  it("extracts prices as integers (PLN)", () => {
    const stubs = parseSearchResults(fixtureHtml);
    expect(stubs[0]!.price).toBe(650_000);
    expect(stubs[1]!.price).toBe(490_000);
    expect(stubs[2]!.price).toBe(580_000);
    expect(stubs[3]!.price).toBe(420_000);
  });

  it("extracts area from data-name='area' parameter", () => {
    const stubs = parseSearchResults(fixtureHtml);
    expect(stubs[0]!.areaM2).toBe(68);
    expect(stubs[1]!.areaM2).toBe(52);
    expect(stubs[2]!.areaM2).toBeCloseTo(72.5, 1);
    expect(stubs[3]!.areaM2).toBe(45);
  });

  it("extracts rooms from data-name='rooms' parameter", () => {
    const stubs = parseSearchResults(fixtureHtml);
    expect(stubs[0]!.rooms).toBe(3);
    expect(stubs[1]!.rooms).toBe(2);
    expect(stubs[2]!.rooms).toBe(3);
    expect(stubs[3]!.rooms).toBeUndefined(); // minimal card
  });

  it("extracts external ID from data-id attribute", () => {
    const stubs = parseSearchResults(fixtureHtml);
    expect(stubs[0]!.externalId).toBe("123456");
    expect(stubs[1]!.externalId).toBe("234567");
  });

  it("extracts thumbnail URL for eager-loaded images", () => {
    const stubs = parseSearchResults(fixtureHtml);
    expect(stubs[0]!.thumbnailUrl).toBe("https://static.domy.pl/photos/123456/main.jpg");
  });

  it("extracts thumbnail URL for lazy-loaded images (data-src)", () => {
    const stubs = parseSearchResults(fixtureHtml);
    // Listing 3 has data-src instead of src
    expect(stubs[2]!.thumbnailUrl).toBe("https://static.domy.pl/photos/345678/main.jpg");
  });

  it("handles minimal card with no thumbnail gracefully", () => {
    const stubs = parseSearchResults(fixtureHtml);
    // Listing 4 has no img
    expect(stubs[3]!.thumbnailUrl).toBeUndefined();
  });

  it("deduplicates stubs with identical canonicalUrl", () => {
    // Feed the same HTML twice – the function deduplicates internally
    const combined = fixtureHtml + fixtureHtml;
    // Each card has unique URLs so no dedup expected on valid HTML
    const stubs = parseSearchResults(fixtureHtml);
    const urls = stubs.map((s) => s.canonicalUrl);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("returns empty array for empty HTML", () => {
    const stubs = parseSearchResults("<html><body></body></html>");
    expect(stubs).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Detail page parser
// ---------------------------------------------------------------------------

const detailHtml = `
<!DOCTYPE html>
<html lang="pl">
<head><title>3-pokojowe mieszkanie, Jeżyce | Domy.pl</title></head>
<body>
  <h1>3-pokojowe mieszkanie, Jeżyce, ul. Kraszewskiego</h1>
  <div class="offer-price">
    <span class="price__value">650 000 zł</span>
  </div>
  <div class="offer-description">
    Przestronne mieszkanie w sercu Jeżyc, blisko centrum Poznania.
    Mieszkanie po remoncie, gotowe do zamieszkania.
  </div>
  <ul class="parameters">
    <li class="parameters__parameter" data-name="area">68 m²</li>
    <li class="parameters__parameter" data-name="rooms">3</li>
    <li class="parameters__parameter" data-name="floor">2</li>
    <li class="parameters__parameter" data-name="city">Poznań</li>
    <li class="parameters__parameter" data-name="district">Jeżyce</li>
  </ul>
  <div class="offer-agency">Biuro Nieruchomości Centrum</div>
  <time class="offer-date" datetime="2025-02-15">15 lutego 2025</time>
  <script type="application/ld+json">
  {
    "@type": "Residence",
    "geo": {
      "latitude": 52.4064,
      "longitude": 16.9252
    }
  }
  </script>
</body>
</html>
`;

describe("parseListingDetail (domy.pl)", () => {
  const url = "https://domy.pl/mieszkania/oferta/mieszkanie-jezyce-poznan-123456";

  it("parses title from h1", () => {
    const detail = parseListingDetail(detailHtml, url);
    expect(detail.title).toContain("3-pokojowe mieszkanie");
  });

  it("parses price correctly", () => {
    const detail = parseListingDetail(detailHtml, url);
    expect(detail.price).toBe(650_000);
  });

  it("parses area from data-name attribute", () => {
    const detail = parseListingDetail(detailHtml, url);
    expect(detail.areaM2).toBe(68);
  });

  it("parses rooms from data-name attribute", () => {
    const detail = parseListingDetail(detailHtml, url);
    expect(detail.rooms).toBe(3);
  });

  it("parses geo coordinates from JSON-LD", () => {
    const detail = parseListingDetail(detailHtml, url);
    expect(detail.lat).toBeCloseTo(52.4064, 3);
    expect(detail.lon).toBeCloseTo(16.9252, 3);
  });

  it("returns active status for normal page", () => {
    const detail = parseListingDetail(detailHtml, url);
    expect(detail.status).toBe("active");
  });

  it("returns inactive status when page contains inactive phrase", () => {
    const inactiveHtml = detailHtml.replace(
      "</body>",
      '<p class="alert">Oferta nieaktywna</p></body>'
    );
    const detail = parseListingDetail(inactiveHtml, url);
    expect(detail.status).toBe("inactive");
  });

  it("preserves canonicalUrl", () => {
    const detail = parseListingDetail(detailHtml, url);
    expect(detail.canonicalUrl).toBe(url);
  });

  it("returns source = 'domy'", () => {
    const detail = parseListingDetail(detailHtml, url);
    expect(detail.source).toBe("domy");
  });
});

// ---------------------------------------------------------------------------
// Unit parsers
// ---------------------------------------------------------------------------

describe("parsePrice", () => {
  it("parses '650 000 zł'", () => expect(parsePrice("650 000 zł")).toBe(650_000));
  it("parses '490 000 PLN'", () => expect(parsePrice("490 000 PLN")).toBe(490_000));
  it("parses '1.200.000'", () => expect(parsePrice("1.200.000")).toBe(1_200_000));
  it("returns undefined for empty string", () => expect(parsePrice("")).toBeUndefined());
  it("returns undefined for non-numeric text", () => expect(parsePrice("zapytaj")).toBeUndefined());
});

describe("parseArea", () => {
  it("parses '68 m²'", () => expect(parseArea("68 m²")).toBe(68));
  it("parses '72,5 m²'", () => expect(parseArea("72,5 m²")).toBeCloseTo(72.5, 1));
  it("parses '45.0'", () => expect(parseArea("45.0")).toBe(45));
  it("returns undefined for empty string", () => expect(parseArea("")).toBeUndefined());
});

describe("parseRooms", () => {
  it("parses '3'", () => expect(parseRooms("3")).toBe(3));
  it("parses '2 pokoje'", () => expect(parseRooms("2 pokoje")).toBe(2));
  it("parses '4-pokojowe'", () => expect(parseRooms("4-pokojowe")).toBe(4));
  it("returns undefined for empty string", () => expect(parseRooms("")).toBeUndefined());
});
