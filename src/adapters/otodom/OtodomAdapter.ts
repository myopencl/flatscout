import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import type { PortalAdapter, SearchFilters, ListingStub, ListingDetails } from "../../types/index.js";
import { canonicalizeUrl } from "../../core/canonicalizeUrl.js";
import { logger } from "../../utils/logger.js";
import { sleep } from "../../utils/http.js";
import {
  parseOtodomSearchPage,
  parseOtodomDetailPage,
  extractNextData,
} from "./otodom.parsers.js";

const SOURCE = "otodom";
const HEADLESS = process.env["PLAYWRIGHT_HEADLESS"] !== "false";
const PAGE_TIMEOUT = Number(process.env["REQUEST_TIMEOUT_MS"] ?? 30_000);
const RATE_LIMIT_MS = Number(process.env["RATE_LIMIT_DELAY_MS"] ?? 2_000);

/**
 * OtodomAdapter uses Playwright because Otodom returns 403 to automated
 * HTTP clients. We use a persistent browser context to keep cookies and
 * share session state across requests.
 *
 * The browser is created lazily and shared across calls within a single run.
 * Call close() after the crawl session to release resources.
 */
export class OtodomAdapter implements PortalAdapter {
  readonly source = SOURCE;
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private lastRequestAt = 0;
  private readonly log = logger.child({ adapter: "otodom" });

  buildSearchUrl(filters: SearchFilters): string {
    const operation = filters.operation === "buy" ? "sprzedaz" : "wynajem";
    const base = `https://www.otodom.pl/pl/wyniki/${operation}/mieszkanie`;

    const params = new URLSearchParams();
    params.set("ownerTypeSingleSelect", filters.ownerType ?? "ALL");
    if (filters.priceMin != null) params.set("priceMin", String(filters.priceMin));
    if (filters.priceMax != null) params.set("priceMax", String(filters.priceMax));
    if (filters.areaMin != null) params.set("areaMin", String(filters.areaMin));
    if (filters.areaMax != null) params.set("areaMax", String(filters.areaMax));
    if (filters.rooms != null) params.set("roomsNumber", `[${filters.rooms}]`);
    params.set("by", "DEFAULT");
    params.set("direction", "DESC");
    params.set("viewType", "listing");

    // Build path: wielkopolskie/poznan/poznan/poznan for Poznań
    const cityPath = filters.city?.toLowerCase() ?? "poznan";
    const path = `${base}/wielkopolskie/${cityPath}/${cityPath}/${cityPath}`;

    return `${path}?${params.toString()}`;
  }

  async discoverListings(filters: SearchFilters): Promise<ListingStub[]> {
    const allStubs: ListingStub[] = [];
    let page = 1;
    const maxPages = 20;

    while (page <= maxPages) {
      const url = this.buildPagedSearchUrl(filters, page);
      this.log.info({ url, page }, "Fetching Otodom search page via Playwright");

      let html: string;
      try {
        html = await this.fetchPageHtml(url);
      } catch (err) {
        this.log.error({ err, url, page }, "Playwright fetch failed");
        break;
      }

      const nextData = extractNextData(html);
      if (!nextData) {
        this.log.warn({ page }, "No __NEXT_DATA__ found on Otodom search page");
        break;
      }

      const stubs = parseOtodomSearchPage(nextData);
      this.log.debug({ page, count: stubs.length }, "Parsed Otodom stubs");

      if (stubs.length === 0) break;

      allStubs.push(...stubs);
      if (stubs.length < 30) break; // partial page = last

      page++;
    }

    const seen = new Set<string>();
    return allStubs.filter((s) => {
      if (seen.has(s.canonicalUrl)) return false;
      seen.add(s.canonicalUrl);
      return true;
    });
  }

  async fetchListingDetails(url: string): Promise<ListingDetails> {
    const canonical = canonicalizeUrl(SOURCE, url);
    this.log.debug({ url: canonical }, "Fetching Otodom detail via Playwright");

    let html: string;
    try {
      html = await this.fetchPageHtml(canonical);
    } catch (err) {
      this.log.error({ err, url: canonical }, "Playwright detail fetch failed");
      return { source: SOURCE, canonicalUrl: canonical, status: "inactive" };
    }

    const nextData = extractNextData(html);
    if (!nextData) {
      return { source: SOURCE, canonicalUrl: canonical, status: "inactive" };
    }

    return parseOtodomDetailPage(nextData, canonical);
  }

  async checkListingStatus(url: string): Promise<"active" | "inactive" | "unknown"> {
    const canonical = canonicalizeUrl(SOURCE, url);
    try {
      const html = await this.fetchPageHtml(canonical);
      const lower = html.toLowerCase();
      if (
        lower.includes("ogłoszenie nieaktywne") ||
        lower.includes("oferta wygasła") ||
        lower.includes("nie istnieje")
      ) {
        return "inactive";
      }
      const nextData = extractNextData(html);
      if (!nextData) return "unknown";
      return "active";
    } catch {
      return "unknown";
    }
  }

  /** Release Playwright resources. Call after a crawl session completes. */
  async close(): Promise<void> {
    if (this.context) {
      await this.context.close();
      this.context = null;
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
    this.log.debug("Playwright browser closed");
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private async ensureBrowser(): Promise<{ browser: Browser; context: BrowserContext }> {
    if (this.browser && this.context) {
      return { browser: this.browser, context: this.context };
    }

    this.log.debug({ headless: HEADLESS }, "Launching Playwright browser");
    this.browser = await chromium.launch({ headless: HEADLESS });
    this.context = await this.browser.newContext({
      userAgent:
        process.env["USER_AGENT"] ||
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      locale: "pl-PL",
      viewport: { width: 1280, height: 900 },
      extraHTTPHeaders: {
        "Accept-Language": "pl-PL,pl;q=0.9",
      },
    });

    return { browser: this.browser, context: this.context };
  }

  private async fetchPageHtml(url: string): Promise<string> {
    // Enforce rate limit
    const now = Date.now();
    const elapsed = now - this.lastRequestAt;
    if (elapsed < RATE_LIMIT_MS) {
      await sleep(RATE_LIMIT_MS - elapsed);
    }
    this.lastRequestAt = Date.now();

    const { context } = await this.ensureBrowser();
    const page: Page = await context.newPage();

    try {
      await page.goto(url, { waitUntil: "networkidle", timeout: PAGE_TIMEOUT });

      // Handle cookie consent banner if present
      try {
        const acceptBtn = page.locator(
          '[data-cy="accept-button"], button:has-text("Zaakceptuj"), button:has-text("Accept all")'
        );
        if (await acceptBtn.isVisible({ timeout: 3_000 })) {
          await acceptBtn.click();
          await page.waitForTimeout(500);
        }
      } catch {
        // No cookie banner, that's fine
      }

      // Wait for listings or detail content to appear
      try {
        await page.waitForSelector(
          '[data-cy="search.listing"], article[data-cy], [data-testid="listing-wrapper"]',
          { timeout: 8_000 }
        );
      } catch {
        // May be a detail page or an error page – continue
      }

      return await page.content();
    } finally {
      await page.close();
    }
  }

  private buildPagedSearchUrl(filters: SearchFilters, page: number): string {
    const base = this.buildSearchUrl(filters);
    if (page === 1) return base;
    const url = new URL(base);
    url.searchParams.set("page", String(page));
    return url.toString();
  }
}
