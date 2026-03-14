import type { ListingStub, ListingDetails } from "../../types/index.js";
import { canonicalizeUrl } from "../../core/canonicalizeUrl.js";

const SOURCE = "otodom";

// ---------------------------------------------------------------------------
// Otodom uses Next.js and injects its full data payload into
// window.__NEXT_DATA__ as a JSON blob. We parse that instead of scraping DOM,
// which is more reliable than CSS selectors on a hydrated React app.
// ---------------------------------------------------------------------------

interface NextDataListing {
  id?: string;
  slug?: string;
  url?: string;
  title?: string;
  totalPrice?: { value?: number; currency?: string };
  areaInSquareMeters?: number;
  roomsNumber?: string; // "THREE" | "FOUR" | etc.
  location?: {
    address?: {
      city?: { name?: string };
      district?: { name?: string };
      street?: { name?: string };
    };
    mapDetails?: { lat?: number; lon?: number };
    coordinates?: { latitude?: number; longitude?: number };
  };
  agency?: { name?: string };
  isPrivateOwner?: boolean;
  images?: Array<{ medium?: string; large?: string }>;
  description?: string;
  characteristics?: Array<{ key?: string; value?: string; label?: string; localizedValue?: string }>;
  openDays?: unknown;
  activeFrom?: string;
}

const ROOMS_MAP: Record<string, number> = {
  ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5, SIX: 6,
  SEVEN: 7, EIGHT: 8, NINE: 9, TEN: 10, MORE: 10,
};

// ---------------------------------------------------------------------------
// Parse search results from __NEXT_DATA__
// ---------------------------------------------------------------------------

export function parseOtodomSearchPage(
  nextDataJson: string
): ListingStub[] {
  const discoveredAt = new Date().toISOString();
  let data: unknown;

  try {
    data = JSON.parse(nextDataJson);
  } catch {
    return [];
  }

  // Navigate to listing array — structure varies by Otodom version
  const listings = extractListings(data);
  if (!listings) return [];

  return listings
    .map((item: NextDataListing): ListingStub | null => {
      const href = item.url ?? item.slug;
      if (!href) return null;

      const rawUrl = href.startsWith("http")
        ? href
        : `https://www.otodom.pl/pl/oferta/${href}`;
      const canonicalUrl = canonicalizeUrl(SOURCE, rawUrl);

      return {
        source: SOURCE,
        externalId: String(item.id ?? ""),
        canonicalUrl,
        title: item.title,
        price: item.totalPrice?.value,
        currency: item.totalPrice?.currency ?? "PLN",
        rooms: parseRooms(item.roomsNumber),
        areaM2: item.areaInSquareMeters,
        locationText: [
          item.location?.address?.district?.name,
          item.location?.address?.city?.name,
        ]
          .filter(Boolean)
          .join(", "),
        thumbnailUrl: item.images?.[0]?.medium ?? item.images?.[0]?.large,
        discoveredAt,
        rawSummary: item as Record<string, unknown>,
      };
    })
    .filter((s): s is ListingStub => s !== null);
}

// ---------------------------------------------------------------------------
// Parse detail page from __NEXT_DATA__
// ---------------------------------------------------------------------------

export function parseOtodomDetailPage(
  nextDataJson: string,
  url: string
): ListingDetails {
  let data: unknown;
  try {
    data = JSON.parse(nextDataJson);
  } catch {
    return { source: SOURCE, canonicalUrl: url, status: "unknown" as never };
  }

  const ad = extractAdDetail(data) as NextDataListing | null;

  if (!ad) {
    return { source: SOURCE, canonicalUrl: url, status: "inactive" };
  }

  const charMap: Record<string, string> = {};
  for (const c of ad.characteristics ?? []) {
    if (c.key) charMap[c.key] = c.localizedValue ?? c.value ?? "";
  }

  const floor = charMap["floor_no"] ?? charMap["floor"] ?? null;
  const bathrooms = charMap["bathrooms_num"] ? parseInt(charMap["bathrooms_num"], 10) : undefined;

  const advertiserType: "agency" | "private" | "unknown" = ad.isPrivateOwner
    ? "private"
    : ad.agency?.name
    ? "agency"
    : "unknown";

  const photos = (ad.images ?? [])
    .map((img) => img.large ?? img.medium)
    .filter((u): u is string => !!u)
    .slice(0, 30);

  return {
    source: SOURCE,
    externalId: String(ad.id ?? ""),
    canonicalUrl: url,
    title: ad.title,
    description: ad.description,
    price: ad.totalPrice?.value,
    currency: ad.totalPrice?.currency ?? "PLN",
    rooms: parseRooms(ad.roomsNumber),
    bathrooms: bathrooms || undefined,
    areaM2: ad.areaInSquareMeters,
    floor,
    city: ad.location?.address?.city?.name ?? "Poznań",
    neighborhood: ad.location?.address?.district?.name ?? null,
    addressText: [
      ad.location?.address?.street?.name,
      ad.location?.address?.district?.name,
      ad.location?.address?.city?.name,
    ]
      .filter(Boolean)
      .join(", ") || null,
    lat: ad.location?.coordinates?.latitude ?? ad.location?.mapDetails?.lat ?? null,
    lon: ad.location?.coordinates?.longitude ?? ad.location?.mapDetails?.lon ?? null,
    photos,
    features: Object.entries(charMap).map(([k, v]) => `${k}: ${v}`).slice(0, 50),
    agencyName: ad.agency?.name ?? null,
    advertiserType,
    publishedAtText: ad.activeFrom ?? null,
    status: "active",
    rawDetails: ad as Record<string, unknown>,
  };
}

// ---------------------------------------------------------------------------
// Helpers to navigate the __NEXT_DATA__ tree
// ---------------------------------------------------------------------------

function extractListings(data: unknown): NextDataListing[] | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, any>;

  // Common paths in Otodom Next.js structure
  const candidates = [
    (d["props"] as any)?.["pageProps"]?.["data"]?.["searchAds"]?.["items"],
    (d["props"] as any)?.["pageProps"]?.["listings"]?.["items"],
    (d["props"] as any)?.["pageProps"]?.["data"]?.["listings"],
  ];

  for (const c of candidates) {
    if (Array.isArray(c) && c.length > 0) return c as NextDataListing[];
  }
  return null;
}

function extractAdDetail(data: unknown): NextDataListing | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, any>;

  const candidates = [
    (d["props"] as any)?.["pageProps"]?.["ad"],
    (d["props"] as any)?.["pageProps"]?.["data"]?.["ad"],
    (d["props"] as any)?.["pageProps"]?.["adDetails"],
  ];

  for (const c of candidates) {
    if (c && typeof c === "object") return c as NextDataListing;
  }
  return null;
}

export function parseRooms(roomsStr?: string): number | undefined {
  if (!roomsStr) return undefined;
  if (ROOMS_MAP[roomsStr] != null) return ROOMS_MAP[roomsStr];
  const n = parseInt(roomsStr, 10);
  return isNaN(n) ? undefined : n;
}

/**
 * Extract the __NEXT_DATA__ JSON from a full HTML page.
 * Returns null if not found.
 */
export function extractNextData(html: string): string | null {
  const m = html.match(/<script[^>]+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  return m ? m[1]! : null;
}
