import * as cheerio from "cheerio";
import type { ListingStub, ListingDetails } from "../../types/index.js";
import { canonicalizeUrl } from "../../core/canonicalizeUrl.js";

const SOURCE = "immohouse";
const BASE_URL = "https://immohouse.pl";

// ---------------------------------------------------------------------------
// Search results page parser
// ---------------------------------------------------------------------------

/**
 * Parse the search results HTML from immohouse.pl and return a list of stubs.
 *
 * Immohouse renders listings server-side.  Each listing card has a structure
 * similar to (verified by inspection):
 *
 *   <div class="property-item"> or <article class="offer-item">
 *     <a href="/nieruchomosci/xxx-title">…</a>
 *     <span class="price">660 000 PLN</span>
 *     <span class="area">68 m²</span>
 *     <span class="rooms">4 pokoje</span>
 *     <span class="location">Poznań, Wilda</span>
 *     <img src="..." class="thumbnail" />
 *   </div>
 *
 * NOTE: selectors are intentionally broad and defensive.  If Immohouse
 * restructures their HTML, only this file needs to be updated.
 */
export function parseSearchResults(html: string): ListingStub[] {
  const $ = cheerio.load(html);
  const stubs: ListingStub[] = [];
  const discoveredAt = new Date().toISOString();

  // Try multiple possible wrapper selectors
  const cardSelectors = [
    ".property-item",
    ".offer-item",
    ".listing-item",
    '[class*="property-card"]',
    '[class*="offer-card"]',
    '[class*="listing-card"]',
    "article.item",
    ".nieruchomosc",
  ];

  let cards = $();
  for (const sel of cardSelectors) {
    cards = $(sel);
    if (cards.length > 0) break;
  }

  if (cards.length === 0) {
    // Fallback: look for links that look like property detail URLs
    $("a[href]").each((_i, el) => {
      const href = $(el).attr("href") ?? "";
      if (/\/(nieruchomosci|oferta|mieszkanie)\//i.test(href)) {
        const canonical = canonicalizeUrl(SOURCE, resolveUrl(href));
        if (!stubs.find((s) => s.canonicalUrl === canonical)) {
          stubs.push({
            source: SOURCE,
            canonicalUrl: canonical,
            discoveredAt,
          });
        }
      }
    });
    return stubs;
  }

  cards.each((_i, el) => {
    try {
      const card = $(el);
      const stub = parseCard($, card, discoveredAt);
      if (stub) stubs.push(stub);
    } catch {
      // Skip malformed cards silently
    }
  });

  return stubs;
}

function parseCard(
  $: cheerio.CheerioAPI,
  card: cheerio.Cheerio<any>,
  discoveredAt: string
): ListingStub | null {
  // --- URL ---
  const linkEl = card.find("a[href]").first();
  const href = linkEl.attr("href") ?? card.attr("href") ?? card.find("[data-url]").attr("data-url");
  if (!href) return null;

  const canonicalUrl = canonicalizeUrl(SOURCE, resolveUrl(href));

  // --- External ID from URL ---
  const idMatch = href.match(/[-/](\d{4,})/);
  const externalId = idMatch ? idMatch[1] : undefined;

  // --- Title ---
  const title =
    card.find('[class*="title"], h2, h3, .name').first().text().trim() ||
    linkEl.attr("title") ||
    linkEl.text().trim() ||
    undefined;

  // --- Price ---
  const priceText = extractText(card, [
    '[class*="price"]',
    '[class*="cena"]',
    ".kwota",
  ]);
  const price = parsePrice(priceText);

  // --- Area ---
  const areaText = extractText(card, [
    '[class*="area"]',
    '[class*="powierzchnia"]',
    '[class*="m2"]',
    '[class*="size"]',
  ]);
  const areaM2 = parseArea(areaText);

  // --- Rooms ---
  const roomsText = extractText(card, [
    '[class*="room"]',
    '[class*="pokoje"]',
    '[class*="pokoj"]',
  ]);
  const rooms = parseRooms(roomsText);

  // --- Location ---
  const locationText =
    extractText(card, [
      '[class*="location"]',
      '[class*="lokalizacja"]',
      '[class*="address"]',
      '[class*="adres"]',
      ".city",
      ".miasto",
    ]) || undefined;

  // --- Thumbnail ---
  const thumbnailUrl =
    card.find("img").first().attr("src") ||
    card.find("img").first().attr("data-src") ||
    undefined;

  return {
    source: SOURCE,
    externalId,
    canonicalUrl,
    title: title || undefined,
    price,
    currency: price != null ? "PLN" : undefined,
    rooms,
    areaM2,
    locationText,
    thumbnailUrl: thumbnailUrl ? resolveUrl(thumbnailUrl) : undefined,
    discoveredAt,
    rawSummary: { href, priceText, areaText, roomsText },
  };
}

// ---------------------------------------------------------------------------
// Detail page parser
// ---------------------------------------------------------------------------

export function parseListingDetail(html: string, url: string): ListingDetails {
  const $ = cheerio.load(html);

  const title =
    $("h1").first().text().trim() ||
    $('[class*="title"] h1, h1[class*="title"]').first().text().trim() ||
    $('meta[property="og:title"]').attr("content") ||
    undefined;

  // Price – look for structured data first, then visible elements
  const priceText =
    $('[class*="price"], [class*="cena"], .price').first().text().trim() ||
    $('[itemprop="price"]').attr("content") ||
    "";
  const price = parsePrice(priceText);

  // Description
  const description =
    $('[class*="description"], [class*="opis"], .description, #description')
      .first()
      .text()
      .trim() || undefined;

  // Area, rooms, bathrooms from detail table / list
  const areaText = findParamValue($, ["powierzchnia", "area", "m²", "metraż"]);
  const areaM2 = parseArea(areaText);

  const roomsText = findParamValue($, ["pokoje", "rooms", "liczba pokoi", "pokój"]);
  const rooms = parseRooms(roomsText);

  const bathroomsText = findParamValue($, ["łazienki", "bathrooms", "liczba łazienek"]);
  const bathrooms = parseRooms(bathroomsText);

  const floorText = findParamValue($, ["piętro", "floor", "kondygnacja"]);

  // Location
  const city = findParamValue($, ["miasto", "city"]) || "Poznań";
  const neighborhood =
    findParamValue($, ["dzielnica", "neighborhood", "osiedle"]) || undefined;
  const addressText =
    $('[class*="address"], [itemprop="address"]').first().text().trim() || undefined;

  // Geo from JSON-LD or data attrs
  const { lat, lon } = extractGeo($);

  // Agency
  const agencyName =
    $('[class*="agency"], [class*="biuro"], [class*="agent"]').first().text().trim() ||
    undefined;

  // Photos
  const photos = extractPhotos($);

  // Features
  const features = extractFeatures($);

  // Published date
  const publishedAtText =
    findParamValue($, ["data dodania", "data publikacji", "opublikowano"]) ||
    $("time").first().attr("datetime") ||
    undefined;

  // Status detection
  const pageText = $.text().toLowerCase();
  const isInactive =
    pageText.includes("oferta nieaktywna") ||
    pageText.includes("ogłoszenie nieaktywne") ||
    pageText.includes("nie istnieje") ||
    pageText.includes("sprzedana") ||
    pageText.includes("sprzedane");

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
    advertiserType: agencyName ? "agency" : "unknown",
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

function extractText(
  card: cheerio.Cheerio<any>,
  selectors: string[]
): string {
  for (const sel of selectors) {
    const text = card.find(sel).first().text().trim();
    if (text) return text;
  }
  return "";
}

function findParamValue($: cheerio.CheerioAPI, labels: string[]): string {
  let result = "";
  $("tr, li, .param, [class*='detail'], [class*='feature']").each((_i, el) => {
    const text = $(el).text().toLowerCase();
    for (const label of labels) {
      if (text.includes(label.toLowerCase())) {
        // Try to get the next sibling or second td/dd
        const val =
          $(el).find("td:last-child, dd, span:last-child, [class*='value']").text().trim() ||
          $(el).next().text().trim();
        if (val) {
          result = val;
          return false; // break
        }
      }
    }
    return true;
  });
  return result;
}

function extractGeo($: cheerio.CheerioAPI): { lat: number | null; lon: number | null } {
  // Try JSON-LD
  const jsonLd = $('script[type="application/ld+json"]').text();
  if (jsonLd) {
    try {
      const data = JSON.parse(jsonLd) as Record<string, unknown>;
      const geo = (data["geo"] ?? (data["address"] as Record<string, unknown>)?.["geo"]) as
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

  // Try data-lat / data-lng attributes
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

  $('img[src], img[data-src], [class*="gallery"] img, [class*="photo"] img').each(
    (_i, el) => {
      const src =
        $(el).attr("src") ||
        $(el).attr("data-src") ||
        $(el).attr("data-lazy-src") ||
        "";
      if (src && src.startsWith("http") && !seen.has(src)) {
        seen.add(src);
        photos.push(src);
      }
    }
  );
  return photos.slice(0, 30);
}

function extractFeatures($: cheerio.CheerioAPI): string[] {
  const features: string[] = [];
  $('[class*="feature"], [class*="amenity"], [class*="udogodnienie"], [class*="wyposazenie"] li').each(
    (_i, el) => {
      const text = $(el).text().trim();
      if (text.length > 1 && text.length < 80) features.push(text);
    }
  );
  return [...new Set(features)].slice(0, 50);
}

// ---------------------------------------------------------------------------
// Value parsers
// ---------------------------------------------------------------------------

export function parsePrice(text: string): number | undefined {
  if (!text) return undefined;
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
  // "4 pokoje", "3 pokoi", "2-pokojowe", "studio"
  const m = text.match(/\d+/);
  if (!m) return undefined;
  const n = parseInt(m[0]!, 10);
  return isNaN(n) ? undefined : n;
}
