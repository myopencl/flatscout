import type {
  PortalAdapter,
  SearchFilters,
  ListingStub,
  ListingDetails,
} from "../../types/index.js";
import { fetchHtml, RateLimiter } from "../../utils/http.js";
import { withRetry, HttpError, isPermamentHttpError } from "../../utils/retry.js";
import { logger } from "../../utils/logger.js";
import { canonicalizeUrl } from "../../core/canonicalizeUrl.js";
import { parseSearchResults, parseListingDetail } from "./domy.parsers.js";

const SOURCE = "domy";
const BASE_URL = "https://domy.pl";
const RATE_LIMIT_MS = Number(process.env["RATE_LIMIT_DELAY_MS"] ?? 1_500);

/**
 * DomyAdapter scrapes domy.pl using plain HTTP + Cheerio.
 *
 * URL structure (verified 2025):
 *   https://domy.pl/mieszkania-sprzedaz-{city}-pl
 *   ?ps[advanced_search]=1
 *   &ps[transaction]=1          (1=buy, 2=rent)
 *   &ps[type]=1                 (1=mieszkania/apartment)
 *   &ps[location][type]=1
 *   &ps[location][text_queue][]=Poznań Jeżyce
 *   &ps[living_area_from]=40
 *   &ps[price_from]=400000
 *   &ps[price_to]=700000
 *   &ps[number_of_rooms_from]=2
 *   &ps[number_of_rooms_to]=3
 *   &page=2                     (pagination)
 */
export class DomyAdapter implements PortalAdapter {
  readonly source = SOURCE;
  private readonly rateLimiter = new RateLimiter(RATE_LIMIT_MS);
  private readonly log = logger.child({ adapter: "domy" });

  buildSearchUrl(filters: SearchFilters): string {
    // If a custom search URL is provided, use it directly
    if (filters.customSearchUrl) {
      this.log.debug({ url: filters.customSearchUrl }, "Using custom search URL");
      return filters.customSearchUrl;
    }

    const transaction = filters.operation === "buy" ? "1" : "2";
    const city = (filters.city ?? "poznan").toLowerCase().replace(/\s+/g, "-");

    // Slug for path: "mieszkania-sprzedaz-poznan-pl"
    const operation = filters.operation === "buy" ? "sprzedaz" : "wynajem";
    const pathSlug = `mieszkania-${operation}-${city}-pl`;

    // Use URLSearchParams but domy.pl expects PHP-style array notation
    // We build params manually to handle ps[key][] arrays correctly
    const parts: string[] = [
      "ps%5Badvanced_search%5D=1",
      `ps%5Btransaction%5D=${transaction}`,
      "ps%5Btype%5D=1",
      "ps%5Blocation%5D%5Btype%5D=1",
    ];

    // Location – encode city and optional neighborhood
    const locationText = filters.city ? encodeURIComponent(filters.city) : "Pozna%C5%84";
    parts.push(`ps%5Blocation%5D%5Btext_queue%5D%5B%5D=${locationText}`);
    parts.push(`ps%5Blocation%5D%5Btext_tmp_queue%5D%5B%5D=${locationText}`);

    if (filters.areaMin != null)
      parts.push(`ps%5Bliving_area_from%5D=${filters.areaMin}`);
    if (filters.areaMax != null)
      parts.push(`ps%5Bliving_area_to%5D=${filters.areaMax}`);
    if (filters.priceMin != null)
      parts.push(`ps%5Bprice_from%5D=${filters.priceMin}`);
    if (filters.priceMax != null)
      parts.push(`ps%5Bprice_to%5D=${filters.priceMax}`);
    if (filters.rooms != null) {
      parts.push(`ps%5Bnumber_of_rooms_from%5D=${filters.rooms}`);
      parts.push(`ps%5Bnumber_of_rooms_to%5D=${filters.rooms}`);
    }

    return `${BASE_URL}/${pathSlug}?${parts.join("&")}`;
  }

  async discoverListings(filters: SearchFilters): Promise<ListingStub[]> {
    const allStubs: ListingStub[] = [];
    let page = 1;
    const maxPages = 25;

    while (page <= maxPages) {
      const url = this.buildPagedUrl(filters, page);
      this.log.info({ url, page }, "Fetching domy.pl search page");

      await this.rateLimiter.wait();

      let result;
      try {
        result = await withRetry(() => fetchHtml(url), {
          shouldAbort: isPermamentHttpError,
        });
      } catch (err) {
        this.log.error({ err, url }, "Failed to fetch domy.pl page");
        break;
      }

      if (!result.ok) {
        this.log.warn({ status: result.status, url }, "Non-OK status from domy.pl");
        break;
      }

      if (this.looksEmpty(result.html)) {
        this.log.warn(
          { page },
          "domy.pl page looks empty – may require Playwright if JS-rendered"
        );
        break;
      }

      // Diagnostic: log a snapshot of the HTML so we can verify selectors
      if (page === 1) {
        const snippet = result.html.slice(0, 2000).replace(/\s+/g, " ");
        this.log.debug({ htmlSnippet: snippet }, "domy.pl raw HTML (first 2000 chars)");
        // Also log all classes present to help tune selectors
        const classMatches = [...result.html.matchAll(/class="([^"]+)"/g)]
          .map((m) => m[1])
          .filter((c): c is string => !!c)
          .flatMap((c) => c.split(/\s+/))
          .filter((c) => /offer|item|list|card|property|result|search/i.test(c));
        const uniqueClasses = [...new Set(classMatches)].slice(0, 40);
        this.log.info({ uniqueClasses }, "domy.pl relevant CSS classes found in HTML");
      }

      const stubs = parseSearchResults(result.html);
      this.log.info({ page, count: stubs.length }, "Parsed domy.pl stubs");

      if (stubs.length === 0) break;

      allStubs.push(...stubs);

      // domy.pl typically shows 24–30 listings per page; partial page = last
      if (stubs.length < 20) break;

      page++;
    }

    // Deduplicate within same search run
    const seen = new Set<string>();
    return allStubs.filter((s) => {
      if (seen.has(s.canonicalUrl)) return false;
      seen.add(s.canonicalUrl);
      return true;
    });
  }

  async fetchListingDetails(url: string): Promise<ListingDetails> {
    const canonical = canonicalizeUrl(SOURCE, url);
    await this.rateLimiter.wait();

    let result;
    try {
      result = await withRetry(() => fetchHtml(canonical), {
        shouldAbort: isPermamentHttpError,
      });
    } catch (err) {
      this.log.error({ err, url: canonical }, "Detail fetch failed");
      return { source: SOURCE, canonicalUrl: canonical, status: "inactive" };
    }

    if (result.status === 404 || result.status === 410) {
      return { source: SOURCE, canonicalUrl: canonical, status: "inactive" };
    }

    if (!result.ok) throw new HttpError(result.status, canonical);

    // domy.pl redirects removed listings to the homepage or a search page
    const finalUrl = result.finalUrl ?? canonical;
    if (
      finalUrl !== canonical &&
      !finalUrl.includes("/ofert") &&
      !finalUrl.includes("/mieszkan")
    ) {
      return { source: SOURCE, canonicalUrl: canonical, status: "inactive" };
    }

    const details = parseListingDetail(result.html, canonical);
    // DEBUG: log coordinates to verify extraction
    if (details.lat == null || details.lon == null) {
      this.log.warn(
        { url: canonical, lat: details.lat, lon: details.lon, title: details.title },
        "Domy detail has NULL coordinates"
      );
    }
    return details;
  }

  async checkListingStatus(url: string): Promise<"active" | "inactive" | "unknown"> {
    const canonical = canonicalizeUrl(SOURCE, url);
    try {
      await this.rateLimiter.wait();
      const result = await fetchHtml(canonical, {
        timeoutMs: 10_000,
        followRedirects: true,
      });

      if (result.status === 404 || result.status === 410) return "inactive";
      if (!result.ok) return "unknown";

      const lower = result.html.toLowerCase();
      if (
        lower.includes("oferta nieaktywna") ||
        lower.includes("ogłoszenie nieaktywne") ||
        lower.includes("nie istnieje") ||
        lower.includes("sprzedana")
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
    // domy.pl uses ?page=N or &page=N appended to the query string
    const separator = base.includes("?") ? "&" : "?";
    return `${base}${separator}page=${page}`;
  }

  private looksEmpty(html: string): boolean {
    // Check for domy.pl's actual search result indicators
    return (
      html.length < 5_000 ||
      (!html.includes("propertyBox") &&
        !html.includes("property_link") &&
        !html.includes("propertyPriceOpt") &&
        !html.includes("/oferta/"))
    );
  }
}
