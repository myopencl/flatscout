import type { PortalAdapter, SearchFilters, ListingStub, ListingDetails } from "../../types/index.js";
import { fetchHtml, RateLimiter } from "../../utils/http.js";
import { withRetry, HttpError, isPermamentHttpError } from "../../utils/retry.js";
import { logger } from "../../utils/logger.js";
import { canonicalizeUrl } from "../../core/canonicalizeUrl.js";
import { parseSearchResults, parseListingDetail } from "./olx.parsers.js";

const RATE_LIMIT_MS = Number(process.env["RATE_LIMIT_DELAY_MS"] ?? 1_500);

export class OlxAdapter implements PortalAdapter {
  readonly source = "olx";
  private readonly rateLimiter = new RateLimiter(RATE_LIMIT_MS);
  private readonly log = logger.child({ adapter: "olx" });

  buildSearchUrl(filters: SearchFilters): string {
    // If a custom search URL is provided, use it directly
    if (filters.customSearchUrl) {
      this.log.debug({ url: filters.customSearchUrl }, "Using custom search URL");
      return filters.customSearchUrl;
    }

    // Build dynamic base URL with city support
    const operation = filters.operation === "buy" ? "sprzedaz" : "wynajem";
    const city = filters.city?.toLowerCase() ?? "poznan";
    const base = `https://www.olx.pl/nieruchomosci/mieszkania/${operation}/${city}/`;

    const params = new URLSearchParams();
    params.set("search[dist]", String(filters.radiusKm ?? 5));

    // Dynamic ordering (before: hardcoded to "created_at:desc")
    const sortBy = filters.sortBy ?? "created_at";
    const direction = filters.sortDirection ?? "DESC";
    params.set("search[order]", `${sortBy}:${direction.toLowerCase()}`);

    if (filters.priceMin != null)
      params.set("search[filter_float_price:from]", String(filters.priceMin));
    if (filters.priceMax != null)
      params.set("search[filter_float_price:to]", String(filters.priceMax));
    if (filters.areaMin != null)
      params.set("search[filter_float_m:from]", String(filters.areaMin));
    if (filters.areaMax != null)
      params.set("search[filter_float_m:to]", String(filters.areaMax));

    // OLX uses string values for rooms ("one", "two", "three", etc.)
    if (filters.rooms != null) {
      const roomsMap: Record<number, string> = {
        1: "one",
        2: "two",
        3: "three",
        4: "four",
        5: "five",
      };
      const roomValue = roomsMap[filters.rooms] ?? String(filters.rooms);
      params.set("search[filter_enum_rooms][0]", roomValue);
    }

    // District filter
    if (filters.districtId != null)
      params.set("search[district_id]", String(filters.districtId));

    // Filter: only listings with photos
    if (filters.onlyWithPhotos === true)
      params.set("search[photos]", "1");

    return `${base}?${params.toString()}`;
  }

  async discoverListings(filters: SearchFilters): Promise<ListingStub[]> {
    const allStubs: ListingStub[] = [];
    let page = 1;
    const maxPages = 25;

    while (page <= maxPages) {
      const url = this.buildPagedUrl(filters, page);
      this.log.info({ url, page }, "Fetching OLX search page");

      await this.rateLimiter.wait();

      let result;
      try {
        result = await withRetry(() => fetchHtml(url), {
          shouldAbort: isPermamentHttpError,
        });
      } catch (err) {
        this.log.error({ err, url }, "Failed to fetch OLX page");
        break;
      }

      if (!result.ok) {
        this.log.warn({ status: result.status, url }, "Non-OK status");
        break;
      }

      // OLX sometimes returns JS-heavy pages that Cheerio can't parse fully.
      // If we detect a nearly empty results container, flag it.
      if (this.looksEmpty(result.html)) {
        this.log.warn({ page }, "OLX page looks empty – HTML may be incomplete (JS-rendered). Consider switching to Playwright.");
        break;
      }

      const stubs = parseSearchResults(result.html);
      this.log.debug({ page, count: stubs.length }, "Parsed OLX stubs");

      if (stubs.length === 0) break;

      allStubs.push(...stubs);
      if (stubs.length < 30) break; // OLX shows 30/40 per page; partial = last page

      page++;
    }

    // Deduplicate
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
      return { source: this.source, canonicalUrl: canonical, status: "inactive" };
    }

    if (!result.ok) throw new HttpError(result.status, canonical);

    // Detect redirect to main page (OLX removes expired listings)
    if (result.finalUrl !== canonical && !result.finalUrl.includes("/oferta/")) {
      return { source: this.source, canonicalUrl: canonical, status: "inactive" };
    }

    return parseListingDetail(result.html, canonical);
  }

  async checkListingStatus(url: string): Promise<"active" | "inactive" | "unknown"> {
    const canonical = canonicalizeUrl(this.source, url);
    try {
      await this.rateLimiter.wait();
      const result = await fetchHtml(canonical, {
        timeoutMs: 10_000,
        followRedirects: true,
      });

      if (result.status === 404 || result.status === 410) return "inactive";
      if (!result.ok) return "unknown";

      // If OLX redirected away from the listing URL, it's inactive
      if (result.finalUrl !== canonical && !result.finalUrl.includes("/oferta/")) {
        return "inactive";
      }

      const lower = result.html.toLowerCase();
      if (lower.includes("ogłoszenie nieaktywne") || lower.includes("to ogłoszenie już nie istnieje")) {
        return "inactive";
      }
      return "active";
    } catch {
      return "unknown";
    }
  }

  private buildPagedUrl(filters: SearchFilters, page: number): string {
    const base = this.buildSearchUrl(filters);
    if (page === 1) return base;
    const url = new URL(base);
    url.searchParams.set("page", String(page));
    return url.toString();
  }

  private looksEmpty(html: string): boolean {
    return (
      html.length < 5_000 ||
      (!html.includes("data-cy") &&
        !html.includes("offer-wrapper") &&
        !html.includes("l-card"))
    );
  }
}
