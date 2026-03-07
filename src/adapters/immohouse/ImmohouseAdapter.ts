import type { PortalAdapter, SearchFilters, ListingStub, ListingDetails } from "../../types/index.js";
import { fetchHtml, RateLimiter } from "../../utils/http.js";
import { withRetry, HttpError, isPermamentHttpError } from "../../utils/retry.js";
import { logger } from "../../utils/logger.js";
import { canonicalizeUrl } from "../../core/canonicalizeUrl.js";
import {
  parseSearchResults,
  parseListingDetail,
} from "./immohouse.parsers.js";

const RATE_LIMIT_MS = Number(process.env["RATE_LIMIT_DELAY_MS"] ?? 1_500);

export class ImmohouseAdapter implements PortalAdapter {
  readonly source = "immohouse";
  private readonly rateLimiter = new RateLimiter(RATE_LIMIT_MS);
  private readonly log = logger.child({ adapter: "immohouse" });

  buildSearchUrl(filters: SearchFilters): string {
    const params = new URLSearchParams();

    // Immohouse search parameter mapping
    params.set("property_type", "mieszkanie");
    params.set("transaction_type", filters.operation === "buy" ? "sprzedaz" : "wynajem");

    if (filters.city) params.set("location_locality", filters.city);
    if (filters.areaMin != null) params.set("totalArea_min", String(filters.areaMin));
    if (filters.areaMax != null) params.set("totalArea_max", String(filters.areaMax));
    if (filters.priceMin != null) params.set("price_amount_min", String(filters.priceMin));
    if (filters.priceMax != null) params.set("price_amount_max", String(filters.priceMax));
    if (filters.rooms != null) params.set("rooms", String(filters.rooms));

    return `https://immohouse.pl/wyszukiwarka-nieruchomosci?${params.toString()}`;
  }

  async discoverListings(filters: SearchFilters): Promise<ListingStub[]> {
    const allStubs: ListingStub[] = [];
    let page = 1;
    const maxPages = 20;

    while (page <= maxPages) {
      const url = this.buildPagedUrl(filters, page);
      this.log.info({ url, page }, "Fetching search results page");

      await this.rateLimiter.wait();

      let result;
      try {
        result = await withRetry(() => fetchHtml(url), {
          shouldAbort: isPermamentHttpError,
        });
      } catch (err) {
        this.log.error({ err, url, page }, "Failed to fetch search results page");
        break;
      }

      if (!result.ok) {
        this.log.warn({ status: result.status, url }, "Non-OK status on search page");
        break;
      }

      const stubs = parseSearchResults(result.html);
      this.log.debug({ page, count: stubs.length }, "Parsed stubs from page");

      if (stubs.length === 0) break; // no more results

      allStubs.push(...stubs);

      // If we got fewer stubs than a full page, assume we've reached the last page
      if (stubs.length < 12) break;

      page++;
    }

    // Deduplicate by canonicalUrl
    const seen = new Set<string>();
    return allStubs.filter((s) => {
      if (seen.has(s.canonicalUrl)) return false;
      seen.add(s.canonicalUrl);
      return true;
    });
  }

  async fetchListingDetails(url: string): Promise<ListingDetails> {
    const canonical = canonicalizeUrl(this.source, url);
    await this.rateLimiter.wait();

    const result = await withRetry(() => fetchHtml(canonical), {
      shouldAbort: isPermamentHttpError,
    });

    if (result.status === 404 || result.status === 410) {
      return this.inactiveShell(canonical);
    }

    if (!result.ok) {
      throw new HttpError(result.status, canonical);
    }

    return parseListingDetail(result.html, canonical);
  }

  async checkListingStatus(url: string): Promise<"active" | "inactive" | "unknown"> {
    const canonical = canonicalizeUrl(this.source, url);
    try {
      await this.rateLimiter.wait();
      const result = await fetchHtml(canonical, { timeoutMs: 10_000 });

      if (result.status === 404 || result.status === 410) return "inactive";
      if (!result.ok) return "unknown";

      const lower = result.html.toLowerCase();
      if (
        lower.includes("oferta nieaktywna") ||
        lower.includes("ogłoszenie nieaktywne") ||
        lower.includes("nie istnieje")
      ) {
        return "inactive";
      }
      return "active";
    } catch {
      return "unknown";
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private buildPagedUrl(filters: SearchFilters, page: number): string {
    const base = this.buildSearchUrl(filters);
    if (page === 1) return base;
    const url = new URL(base);
    url.searchParams.set("page", String(page));
    return url.toString();
  }

  private inactiveShell(url: string): ListingDetails {
    return {
      source: this.source,
      canonicalUrl: url,
      status: "inactive",
    };
  }
}
