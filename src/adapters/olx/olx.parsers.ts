import * as cheerio from "cheerio";
import type { ListingStub, ListingDetails } from "../../types/index.js";
import { canonicalizeUrl } from "../../core/canonicalizeUrl.js";

const SOURCE = "olx";

// ---------------------------------------------------------------------------
// Search results page parser
// ---------------------------------------------------------------------------

/**
 * OLX renders listings in a div#offers_table structure.
 * Each listing is a <div data-cy="l-card"> or <div class="offer-wrapper">.
 */
export function parseSearchResults(html: string): ListingStub[] {
  const $ = cheerio.load(html);
  const stubs: ListingStub[] = [];
  const discoveredAt = new Date().toISOString();

  // Primary selector (OLX Next.js era)
  let cards = $('[data-cy="l-card"]');

  // Fallback to classic OLX selectors
  if (cards.length === 0) cards = $(".offer-wrapper");
  if (cards.length === 0) cards = $("li[data-id]");

  cards.each((_i, el) => {
    try {
      const card = $(el);
      const stub = parseCard($, card, discoveredAt);
      if (stub) stubs.push(stub);
    } catch {
      // skip malformed
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
  const href = linkEl.attr("href") ?? "";
  if (!href || href === "#") return null;

  const rawUrl = href.startsWith("http") ? href : `https://www.olx.pl${href}`;

  // Validate: reject URLs from other portals (OLX sometimes shows sponsored listings from otodom, etc.)
  if (!rawUrl.includes("olx.pl")) {
    return null;
  }

  const canonicalUrl = canonicalizeUrl(SOURCE, rawUrl);

  // External ID from URL or data-id attr
  const externalId =
    card.attr("data-id") ||
    card.attr("id") ||
    href.match(/ID([a-zA-Z0-9]+)\.html/)?.[1] ||
    href.match(/-(\d+)\.html/)?.[1] ||
    undefined;

  // --- Title ---
  const title =
    card.find('[data-cy="ad-card-title"], h3, h4, .title-cell, .offer-title').first().text().trim() ||
    linkEl.attr("title") ||
    undefined;

  // --- Price ---
  const priceText = card
    .find('[data-testid="ad-price"], .price, [class*="price"], strong')
    .first()
    .text()
    .trim();
  const price = parseOlxPrice(priceText);

  // --- Params (area, rooms) ---
  const paramsText = card
    .find('[data-testid="advert-details-item"], .params li, [class*="param"]')
    .map((_i, el) => $(el).text().trim())
    .get()
    .join(" | ");

  const areaM2 = parseOlxArea(paramsText);
  const rooms = parseOlxRooms(paramsText);

  // --- Location ---
  const locationText =
    card
      .find('[data-testid="location-date"], .location-date, [class*="location"]')
      .first()
      .text()
      .trim()
      .split(" - ")[0] || undefined;

  // --- Thumbnail ---
  const thumbnailUrl =
    card.find("img").first().attr("src") ||
    card.find("img").first().attr("data-src") ||
    undefined;

  return {
    source: SOURCE,
    externalId,
    canonicalUrl,
    title,
    price,
    currency: price != null ? "PLN" : undefined,
    rooms,
    areaM2,
    locationText,
    thumbnailUrl,
    discoveredAt,
    rawSummary: { href, priceText, paramsText },
  };
}

// ---------------------------------------------------------------------------
// Detail page parser
// ---------------------------------------------------------------------------

export function parseListingDetail(html: string, url: string): ListingDetails {
  const $ = cheerio.load(html);

  const title =
    $("h1").first().text().trim() ||
    $('[data-cy="ad_title"]').first().text().trim() ||
    $('meta[property="og:title"]').attr("content") ||
    undefined;

  const priceText =
    $('[data-testid="ad-price-container"], .price-label, [class*="price"]')
      .first()
      .text()
      .trim();
  const price = parseOlxPrice(priceText);

  const description =
    $('[data-cy="ad_description"], #textContent, .description')
      .first()
      .text()
      .trim() || undefined;

  // Parameters table / list
  const params: Record<string, string> = {};
  $('[data-testid="advert-details-item"], li.offer-details__item').each((_i, el) => {
    const label = $(el).find("p:first-child, span.offer-details__name").text().trim().toLowerCase();
    const value = $(el).find("p:last-child, a, strong").text().trim();
    if (label && value) params[label] = value;
  });

  const areaM2 = parseOlxArea(params["powierzchnia"] ?? params["area"] ?? "");
  const rooms = parseOlxRooms(
    params["liczba pokoi"] ?? params["rooms"] ?? params["pokoje"] ?? ""
  );
  const floor = params["piętro"] ?? params["floor"] ?? null;
  const neighborhood = params["dzielnica"] ?? params["dzielnica/osiedle"] ?? null;
  const city = "Poznań";

  // Location from breadcrumb or meta
  const addressText =
    $('[data-testid="map-section"], .location, [class*="location"]').first().text().trim() ||
    undefined;

  const { lat, lon } = extractOlxGeo($);

  // Agency / private
  const sellerType =
    $('[data-testid="user-profile-title"], .offer-user-title').first().text().toLowerCase() ?? "";
  const advertiserType: "agency" | "private" | "unknown" = sellerType.includes("agencja")
    ? "agency"
    : sellerType.includes("prywat")
    ? "private"
    : "unknown";

  const agencyName = advertiserType === "agency"
    ? $('[data-testid="user-profile-title"]').first().text().trim() || undefined
    : undefined;

  const photos = extractOlxPhotos($);
  const features = extractOlxFeatures($);

  const publishedAtText =
    $('[data-cy="ad-posted-at"], span[data-testid]').first().attr("title") ||
    $("time").first().attr("datetime") ||
    undefined;

  // Status detection
  const pageText = $.text().toLowerCase();
  const isInactive =
    pageText.includes("ogłoszenie nieaktywne") ||
    pageText.includes("oferta wygasła") ||
    pageText.includes("to ogłoszenie już nie istnieje") ||
    $('[data-testid="error-page"]').length > 0;

  return {
    source: SOURCE,
    canonicalUrl: url,
    title,
    description,
    price,
    currency: "PLN",
    rooms,
    areaM2,
    floor,
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
  };
}

// ---------------------------------------------------------------------------
// Helpers / Parsers
// ---------------------------------------------------------------------------

function extractOlxGeo($: cheerio.CheerioAPI): { lat: number | null; lon: number | null } {
  const mapSection = $("[data-lat], [data-lng]").first();
  if (mapSection.length) {
    const lat = parseFloat(mapSection.attr("data-lat") ?? "");
    const lon = parseFloat(mapSection.attr("data-lng") ?? "");
    return { lat: isNaN(lat) ? null : lat, lon: isNaN(lon) ? null : lon };
  }
  // Try JSON-LD
  try {
    const ld = JSON.parse($('script[type="application/ld+json"]').first().text()) as Record<
      string,
      unknown
    >;
    const geo = ld["geo"] as Record<string, unknown> | undefined;
    if (geo) {
      return { lat: Number(geo["latitude"]) || null, lon: Number(geo["longitude"]) || null };
    }
  } catch {
    // ignore
  }
  return { lat: null, lon: null };
}

function extractOlxPhotos($: cheerio.CheerioAPI): string[] {
  const seen = new Set<string>();
  const photos: string[] = [];
  $('[data-testid="swiper-slide"] img, .photo-glow img, .carousel img').each((_i, el) => {
    const src = $(el).attr("src") || $(el).attr("data-src") || "";
    if (src && src.startsWith("http") && !seen.has(src)) {
      seen.add(src);
      photos.push(src);
    }
  });
  return photos.slice(0, 30);
}

function extractOlxFeatures($: cheerio.CheerioAPI): string[] {
  const features: string[] = [];
  $('[data-testid="advert-details-item"] p:last-child, li.offer-details__item a').each(
    (_i, el) => {
      const text = $(el).text().trim();
      if (text && text.length < 80) features.push(text);
    }
  );
  return [...new Set(features)].slice(0, 50);
}

export function parseOlxPrice(text: string): number | undefined {
  if (!text) return undefined;
  // Remove CSS and HTML junk first - split on first curly brace or common separators
  const cleaned = text.split(/[.{<]/)[0].trim();
  if (!cleaned) return undefined;
  const digits = cleaned.replace(/[^\d]/g, "");
  const n = parseInt(digits, 10);
  return isNaN(n) || n === 0 ? undefined : n;
}

export function parseOlxArea(text: string): number | undefined {
  if (!text) return undefined;
  const m = text.match(/(\d+[,.]?\d*)\s*m[²2]/i);
  if (!m) return undefined;
  const n = parseFloat(m[1]!.replace(",", "."));
  return isNaN(n) ? undefined : n;
}

export function parseOlxRooms(text: string): number | undefined {
  if (!text) return undefined;
  const m = text.match(/\d+\s*pok/i) || text.match(/^(\d+)$/);
  if (!m) return undefined;
  const num = m[0].match(/\d+/);
  if (!num) return undefined;
  const n = parseInt(num[0], 10);
  return isNaN(n) ? undefined : n;
}
