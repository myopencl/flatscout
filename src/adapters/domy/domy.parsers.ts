import * as cheerio from "cheerio";
import type { ListingStub, ListingDetails } from "../../types/index.js";
import { canonicalizeUrl } from "../../core/canonicalizeUrl.js";

const SOURCE = "domy";
const BASE_URL = "https://domy.pl";

// ---------------------------------------------------------------------------
// Search results page parser
// ---------------------------------------------------------------------------

/**
 * Parse the search results HTML from domy.pl and return a list of stubs.
 *
 * Domy.pl structure (verified 2026-03-13):
 *   <div class="propertyBox">
 *     <a class="property_link" href="/nieruchomosci/oferta/...">
 *       <h3>Title</h3>
 *       <span class="propertyPriceOpt">600 000 zł</span>
 *       <div class="propertyNumberDetails">Rooms, Area, etc.</div>
 *     </a>
 *     <div class="propertyDescribeText">Description</div>
 *     <img src="..." />
 *   </div>
 */
export function parseSearchResults(html: string): ListingStub[] {
  const $ = cheerio.load(html);
  const stubs: ListingStub[] = [];
  const discoveredAt = new Date().toISOString();

  // Domy.pl uses .propertyBox for listing cards
  let cards = $(".propertyBox");

  // Fallback if propertyBox doesn't work
  if (cards.length === 0) {
    cards = $("[class*='propertyBox'], [class*='property-box'], .listing-item, .offer-item");
  }

  // Last resort: extract via property_link anchors
  if (cards.length === 0) {
    $("a.property_link[href*='/oferta']").each((_i, el) => {
      const href = $(el).attr("href") ?? "";
      const full = resolveUrl(href);
      const canonical = canonicalizeUrl(SOURCE, full);
      if (!stubs.find((s) => s.canonicalUrl === canonical)) {
        stubs.push({
          source: SOURCE,
          canonicalUrl: canonical,
          discoveredAt,
          title: $(el).find("h2, h3").text().trim() || undefined,
        });
      }
    });
    return stubs;
  }

  cards.each((_i, el) => {
    try {
      const stub = parseCard($, $(el), discoveredAt);
      if (stub) stubs.push(stub);
    } catch {
      // Skip malformed cards
    }
  });

  return stubs;
}

function parseCard(
  _$: cheerio.CheerioAPI,
  card: cheerio.Cheerio<any>,
  discoveredAt: string
): ListingStub | null {
  // --- URL: look for property_link or any href in the card ---
  const href =
    card.find("a.property_link").first().attr("href") ||
    card.find("a[href*='/oferta']").first().attr("href") ||
    card.find("a[href]").first().attr("href");

  if (!href) return null;

  const canonicalUrl = canonicalizeUrl(SOURCE, resolveUrl(href));

  // --- External ID: extract from URL or data attributes ---
  const idMatch = href.match(/[-/](\d{5,})/);
  const externalId =
    card.attr("data-id") || card.attr("id") || (idMatch ? idMatch[1] : undefined);

  // --- Title: from property_link h2/h3 or link text ---
  const titleEl = card.find("a.property_link");
  const title =
    titleEl.find("h2, h3").first().text().trim() ||
    titleEl.text().trim() ||
    undefined;

  // --- Price: from propertyPriceOpt span ---
  const priceText = card.find(".propertyPriceOpt").text().trim() ||
    extractText(card, [
      '[class*="price"]',
      '[class*="cena"]',
      ".kwota",
    ]);
  const price = parsePrice(priceText);

  // --- Area & Rooms: from propertyNumberDetails (text like "3 pokoje, 75 m²") ---
  const detailsText = card.find(".propertyNumberDetails").text().trim();

  // Parse area (m²) from details or fallback
  let areaM2: number | undefined;
  const areaMatch = detailsText.match(/(\d+(?:[.,]\d+)?)\s*m[²2]/i);
  if (areaMatch) {
    areaM2 = parseArea(areaMatch[1]);
  } else {
    areaM2 = parseArea(extractText(card, [
      '[class*="area"]',
      '[class*="powierzchnia"]',
      '[class*="m2"]',
    ]));
  }

  // Parse rooms (pokoje) from details or fallback
  let rooms: number | undefined;
  const roomsMatch = detailsText.match(/(\d+)\s*pokoje?/i);
  if (roomsMatch) {
    rooms = parseRooms(roomsMatch[1]);
  } else {
    rooms = parseRooms(extractText(card, [
      '[class*="rooms"]',
      '[class*="pokoje"]',
    ]));
  }

  // --- Location: from propertyDescribeText or fallback ---
  const locationText =
    card.find(".propertyDescribeText").text().trim() ||
    extractText(card, [
      '[class*="location"]',
      '[class*="lokalizacja"]',
      '[class*="address"]',
    ]) || undefined;

  // --- Thumbnail: from img in the card ---
  const thumbnailUrl =
    card.find("img").first().attr("src") ||
    card.find("img").first().attr("data-src") ||
    card.find("img").first().attr("data-lazy") ||
    undefined;

  return {
    source: SOURCE,
    externalId: externalId ?? undefined,
    canonicalUrl,
    title: title || undefined,
    price,
    currency: price != null ? "PLN" : undefined,
    rooms,
    areaM2,
    locationText,
    thumbnailUrl: thumbnailUrl ? resolveUrl(thumbnailUrl) : undefined,
    discoveredAt,
    rawSummary: { href, priceText, detailsText, locationText },
  };
}

// ---------------------------------------------------------------------------
// Detail page parser
// ---------------------------------------------------------------------------

export function parseListingDetail(html: string, url: string): ListingDetails {
  const $ = cheerio.load(html);

  // --- Title ---
  const title =
    $("h1").first().text().trim() ||
    $('meta[property="og:title"]').attr("content") ||
    undefined;

  // --- Price ---
  const priceText =
    $('[class*="price"], [class*="cena"]').first().text().trim() ||
    $('[itemprop="price"]').attr("content") ||
    "";
  const price = parsePrice(priceText);

  // --- Description ---
  const description =
    $('[class*="description"], [class*="opis"], #description, .offer-description')
      .first()
      .text()
      .trim() || undefined;

  // --- Parameters (key-value table/list) ---
  const areaText =
    $('[data-name="area"], [class*="area"]').first().text().trim() ||
    findParamValue($, ["powierzchnia", "area", "m²", "metraż"]);
  const areaM2 = parseArea(areaText);

  const roomsText =
    $('[data-name="rooms"]').first().text().trim() ||
    findParamValue($, ["liczba pokoi", "pokoje", "rooms"]);
  const rooms = parseRooms(roomsText);

  const bathroomsText = findParamValue($, ["łazienki", "bathrooms", "liczba łazienek"]);
  const bathrooms = parseRooms(bathroomsText);

  const floorText =
    $('[data-name="floor"]').first().text().trim() ||
    findParamValue($, ["piętro", "floor", "kondygnacja"]);

  // --- Location ---
  const city =
    $('[data-name="city"]').first().text().trim() ||
    findParamValue($, ["miasto", "city"]) ||
    "Poznań";

  const neighborhood =
    $('[data-name="district"], [data-name="neighborhood"]').first().text().trim() ||
    findParamValue($, ["dzielnica", "neighborhood", "osiedle"]) ||
    undefined;

  const addressText =
    $('[class*="address"], [itemprop="address"], [class*="adres"]')
      .first()
      .text()
      .trim() || undefined;

  // --- Geo ---
  const { lat, lon } = extractGeo($);

  // --- Agency ---
  const agencyName =
    $('[class*="agency"], [class*="biuro"], [class*="agent"], [class*="developer"]')
      .first()
      .text()
      .trim() || undefined;

  const advertiserTypeText =
    findParamValue($, ["typ ogłoszeniodawcy", "advertiser type"]).toLowerCase();
  const advertiserType =
    advertiserTypeText.includes("prywat") || advertiserTypeText.includes("osoba")
      ? "private"
      : agencyName
      ? "agency"
      : "unknown";

  // --- Media ---
  const photos = extractPhotos($);
  const features = extractFeatures($);

  // --- Published date ---
  const publishedAtText =
    $('[class*="date"], time').first().attr("datetime") ||
    findParamValue($, ["data dodania", "data publikacji", "opublikowano"]) ||
    undefined;

  // --- Status ---
  const pageText = $.text().toLowerCase();
  const isInactive =
    pageText.includes("oferta nieaktywna") ||
    pageText.includes("ogłoszenie nieaktywne") ||
    pageText.includes("nie istnieje") ||
    pageText.includes("sprzedana") ||
    pageText.includes("sprzedane") ||
    pageText.includes("wynajęte");

  return {
    source: SOURCE,
    canonicalUrl: url,
    title,
    description,
    price,
    currency: price != null ? "PLN" : undefined,
    rooms,
    bathrooms: bathrooms || undefined,
    areaM2,
    floor: floorText || null,
    city,
    neighborhood,
    addressText,
    lat,
    lon,
    photos,
    features,
    agencyName,
    advertiserType,
    publishedAtText,
    status: isInactive ? "inactive" : "active",
    rawDetails: {},
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveUrl(href: string): string {
  if (href.startsWith("http")) return href;
  if (href.startsWith("//")) return `https:${href}`;
  return `${BASE_URL}${href.startsWith("/") ? "" : "/"}${href}`;
}

function extractText(card: cheerio.Cheerio<any>, selectors: string[]): string {
  for (const sel of selectors) {
    const text = card.find(sel).first().text().trim();
    if (text) return text;
  }
  return "";
}

function findParamValue($: cheerio.CheerioAPI, labels: string[]): string {
  let result = "";
  $("tr, li, .param, [class*='detail'], [class*='feature'], [class*='parameter']").each(
    (_i, el) => {
      const text = $(el).text().toLowerCase();
      for (const label of labels) {
        if (text.includes(label.toLowerCase())) {
          const val =
            $(el)
              .find("td:last-child, dd, span:last-child, [class*='value'], strong")
              .text()
              .trim() || $(el).next().text().trim();
          if (val) {
            result = val;
            return false; // break .each
          }
        }
      }
      return true;
    }
  );
  return result;
}

function extractGeo($: cheerio.CheerioAPI): { lat: number | null; lon: number | null } {
  // Try JSON-LD
  const jsonLd = $('script[type="application/ld+json"]').text();
  if (jsonLd) {
    try {
      const data = JSON.parse(jsonLd) as Record<string, unknown>;
      const geo = (data["geo"] ?? (data["address"] as any)?.["geo"]) as
        | Record<string, unknown>
        | undefined;
      if (geo) {
        return {
          lat: Number(geo["latitude"]) || null,
          lon: Number(geo["longitude"]) || null,
        };
      }
    } catch {
      // ignore
    }
  }
  // Try data-lat / data-lng
  const mapEl = $("[data-lat], [data-latitude]").first();
  const lat = parseFloat(mapEl.attr("data-lat") ?? mapEl.attr("data-latitude") ?? "");
  const lon = parseFloat(mapEl.attr("data-lng") ?? mapEl.attr("data-longitude") ?? "");
  return {
    lat: isNaN(lat) ? null : lat,
    lon: isNaN(lon) ? null : lon,
  };
}

function extractPhotos($: cheerio.CheerioAPI): string[] {
  const seen = new Set<string>();
  const photos: string[] = [];
  $(
    'img[src], img[data-src], [class*="gallery"] img, [class*="photo"] img, [class*="slider"] img'
  ).each((_i, el) => {
    const src =
      $(el).attr("src") ||
      $(el).attr("data-src") ||
      $(el).attr("data-lazy") ||
      $(el).attr("data-original") ||
      "";
    if (src && src.startsWith("http") && !seen.has(src)) {
      seen.add(src);
      photos.push(src);
    }
  });
  return photos.slice(0, 30);
}

function extractFeatures($: cheerio.CheerioAPI): string[] {
  const features: string[] = [];
  $(
    '[class*="feature"] li, [class*="amenity"], [class*="udogodnienie"] li, [class*="wyposazenie"] li, [class*="equipment"] li'
  ).each((_i, el) => {
    const text = $(el).text().trim();
    if (text.length > 1 && text.length < 80) features.push(text);
  });
  return [...new Set(features)].slice(0, 50);
}

// ---------------------------------------------------------------------------
// Value parsers (exported for tests)
// ---------------------------------------------------------------------------

export function parsePrice(text: string): number | undefined {
  if (!text) return undefined;
  // Strip currency symbols and separators: "600 000 zł", "600.000 PLN", "600,000"
  const digits = text.replace(/[^\d]/g, "");
  const n = parseInt(digits, 10);
  return isNaN(n) || n === 0 ? undefined : n;
}

export function parseArea(text: string): number | undefined {
  if (!text) return undefined;
  const m = text.match(/(\d+[,.]?\d*)/);
  if (!m) return undefined;
  const n = parseFloat(m[1]!.replace(",", "."));
  return isNaN(n) ? undefined : n;
}

export function parseRooms(text: string): number | undefined {
  if (!text) return undefined;
  const m = text.match(/\d+/);
  if (!m) return undefined;
  const n = parseInt(m[0]!, 10);
  return isNaN(n) ? undefined : n;
}
