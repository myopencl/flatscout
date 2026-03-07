// =============================================================================
// Core domain types – shared across adapters, core logic and API
// =============================================================================

export interface SearchFilters {
  operation: "buy" | "rent";
  propertyType: "flat";
  city?: string;
  region?: string;
  rooms?: number;
  priceMin?: number;
  priceMax?: number;
  areaMin?: number;
  areaMax?: number;
  radiusKm?: number;
  ownerType?: string;
  mapBounds?: {
    east: number;
    north: number;
    west: number;
    south: number;
  };
  sortBy?: string;
  sortDirection?: "ASC" | "DESC";
  extra?: Record<string, unknown>;
}

/** Lightweight record extracted during the discovery (search results) phase. */
export interface ListingStub {
  source: string;
  externalId?: string;
  canonicalUrl: string;
  title?: string;
  price?: number;
  currency?: string;
  rooms?: number;
  areaM2?: number;
  locationText?: string;
  thumbnailUrl?: string;
  discoveredAt: string; // ISO-8601
  rawSummary?: Record<string, unknown>;
}

/** Full record extracted from a listing detail page. */
export interface ListingDetails {
  source: string;
  externalId?: string;
  canonicalUrl: string;
  title?: string;
  description?: string;
  price?: number;
  currency?: string;
  rooms?: number;
  bathrooms?: number;
  areaM2?: number;
  floor?: string | number | null;
  neighborhood?: string | null;
  city?: string | null;
  region?: string | null;
  lat?: number | null;
  lon?: number | null;
  addressText?: string | null;
  thumbnailUrl?: string | null;
  photos?: string[];
  features?: string[];
  agencyName?: string | null;
  advertiserType?: "agency" | "private" | "unknown";
  publishedAtText?: string | null;
  status: "active" | "inactive";
  rawDetails?: Record<string, unknown>;
}

/** Contract every portal adapter must fulfill. */
export interface PortalAdapter {
  readonly source: string;
  buildSearchUrl(filters: SearchFilters): string;
  discoverListings(filters: SearchFilters): Promise<ListingStub[]>;
  fetchListingDetails(url: string): Promise<ListingDetails>;
  checkListingStatus(url: string): Promise<"active" | "inactive" | "unknown">;
}

// ---------------------------------------------------------------------------
// Change detection
// ---------------------------------------------------------------------------

export type EventType =
  | "new"
  | "updated"
  | "price_down"
  | "price_up"
  | "inactive"
  | "reactivated";

export interface ChangeResult {
  hasChanged: boolean;
  events: EventType[];
  oldValues: Record<string, unknown>;
  newValues: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Crawler runner output
// ---------------------------------------------------------------------------

export interface CrawlResult {
  searchId: string;
  portal: string;
  discoveredCount: number;
  newCount: number;
  updatedCount: number;
  inactiveCount: number;
  durationMs: number;
  error?: string;
}
