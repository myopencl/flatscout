import type { SavedSearch } from "@prisma/client";
import { db } from "../db/prisma.js";
import { logger } from "../utils/logger.js";
import { canonicalizeUrl, hashUrl } from "./canonicalizeUrl.js";
import { computeFingerprint } from "./fingerprints.js";
import { compareListings } from "./compareListings.js";
import { ImmohouseAdapter } from "../adapters/immohouse/ImmohouseAdapter.js";
import { OlxAdapter } from "../adapters/olx/OlxAdapter.js";
import { OtodomAdapter } from "../adapters/otodom/OtodomAdapter.js";
import type { PortalAdapter, ListingDetails, SearchFilters, CrawlResult } from "../types/index.js";

// Maximum simultaneous detail fetches across all portals
const DETAIL_CONCURRENCY = Number(process.env["DETAIL_FETCH_CONCURRENCY"] ?? 2);

// Re-fetch details for listings older than this (ms) even if not changed in discovery
const DETAIL_REFRESH_AGE_MS = 24 * 60 * 60 * 1_000; // 24h

// ---------------------------------------------------------------------------
// Adapter registry
// ---------------------------------------------------------------------------

const adapters: Record<string, PortalAdapter> = {
  immohouse: new ImmohouseAdapter(),
  olx: new OlxAdapter(),
  otodom: new OtodomAdapter(),
};

export function getAdapter(source: string): PortalAdapter {
  const adapter = adapters[source];
  if (!adapter) throw new Error(`Unknown portal source: ${source}`);
  return adapter;
}

// ---------------------------------------------------------------------------
// Main runner
// ---------------------------------------------------------------------------

export async function runCrawlForSearch(search: SavedSearch): Promise<CrawlResult> {
  const startedAt = Date.now();
  const log = logger.child({ searchId: search.id, portal: search.portal });

  const runLog = await db.scrapeRunLog.create({
    data: {
      searchId: search.id,
      portal: search.portal,
    },
  });

  let discoveredCount = 0;
  let newCount = 0;
  let updatedCount = 0;
  let inactiveCount = 0;
  let errorMessage: string | undefined;

  try {
    const adapter = getAdapter(search.portal);
    const filters = search.filtersJson as unknown as SearchFilters;

    log.info({ searchUrl: search.searchUrl }, "Starting crawl");

    // ---- PHASE 1: Discovery ----
    const stubs = await adapter.discoverListings(filters);
    discoveredCount = stubs.length;
    log.info({ discoveredCount }, "Discovery complete");

    // ---- PHASE 2: Persist stubs & determine which need detail fetch ----
    const urlsNeedingDetail: string[] = [];

    for (const stub of stubs) {
      const canonical = canonicalizeUrl(stub.source, stub.canonicalUrl);
      const urlHash = hashUrl(canonical);

      const existing = await db.listing.findUnique({ where: { urlHash } });

      if (!existing) {
        // New listing – save stub immediately, queue for detail fetch
        await db.listing.create({
          data: {
            source: stub.source,
            externalId: stub.externalId ?? null,
            canonicalUrl: canonical,
            urlHash,
            status: "active",
            title: stub.title ?? null,
            price: stub.price ?? null,
            currency: stub.currency ?? "PLN",
            rooms: stub.rooms ?? null,
            areaM2: stub.areaM2 ?? null,
            thumbnailUrl: stub.thumbnailUrl ?? null,
            rawSummaryJson: (stub.rawSummary ?? {}) as object,
            firstSeenAt: new Date(stub.discoveredAt),
            lastSeenAt: new Date(stub.discoveredAt),
            lastCheckedAt: new Date(stub.discoveredAt),
          },
        });

        await db.listingEvent.create({
          data: {
            listingId: (await db.listing.findUniqueOrThrow({ where: { urlHash } })).id,
            eventType: "new",
            newValueJson: stub as unknown as object,
          },
        });

        newCount++;
        urlsNeedingDetail.push(canonical);
      } else {
        // Known listing – update lastSeenAt
        await db.listing.update({
          where: { id: existing.id },
          data: { lastSeenAt: new Date(), status: "active" },
        });

        // Queue for detail refresh if stale
        const age = Date.now() - existing.lastCheckedAt.getTime();
        if (age > DETAIL_REFRESH_AGE_MS) {
          urlsNeedingDetail.push(canonical);
        }
      }

      // Associate with this saved search
      const listing = await db.listing.findUnique({ where: { urlHash } });
      if (listing) {
        await db.searchListingMatch.upsert({
          where: { searchId_listingId: { searchId: search.id, listingId: listing.id } },
          create: {
            searchId: search.id,
            listingId: listing.id,
            lastMatchedAt: new Date(),
          },
          update: { lastMatchedAt: new Date() },
        });
      }
    }

    // ---- PHASE 3: Detail fetch (throttled) ----
    log.info({ count: urlsNeedingDetail.length }, "Starting detail fetches");
    await processWithConcurrency(
      urlsNeedingDetail,
      DETAIL_CONCURRENCY,
      async (url) => {
        try {
          const details = await adapter.fetchListingDetails(url);
          await persistDetails(details);
          // Mutate counters via reference (we pass the object)
        } catch (err) {
          log.error({ err, url }, "Detail fetch failed");
        }
      }
    );

    // Re-read counters (they were mutated inside persistDetails via the object ref)
    // — actually we can't mutate counts inside a closure easily without a ref object.
    // We'll recount from the DB using the run context.

    // ---- PHASE 4: Mark disappeared listings as inactive ----
    const seenUrls = new Set(stubs.map((s) => canonicalizeUrl(s.source, s.canonicalUrl)));
    const staleInactive = await db.listing.findMany({
      where: {
        source: search.portal,
        status: "active",
        lastSeenAt: { lt: new Date(startedAt - DETAIL_REFRESH_AGE_MS) },
      },
      select: { id: true, canonicalUrl: true },
    });

    for (const stale of staleInactive) {
      if (!seenUrls.has(stale.canonicalUrl)) {
        const status = await adapter.checkListingStatus(stale.canonicalUrl);
        if (status === "inactive") {
          await db.listing.update({
            where: { id: stale.id },
            data: { status: "inactive", lastCheckedAt: new Date() },
          });
          await db.listingEvent.create({
            data: {
              listingId: stale.id,
              eventType: "inactive",
            },
          });
          inactiveCount++;
        }
      }
    }

    // Update saved search success timestamp
    await db.savedSearch.update({
      where: { id: search.id },
      data: {
        lastRunAt: new Date(),
        lastSuccessAt: new Date(),
        lastError: null,
      },
    });

    log.info({ discoveredCount, newCount, updatedCount, inactiveCount }, "Crawl completed");
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
    log.error({ err }, "Crawl run failed");

    await db.savedSearch.update({
      where: { id: search.id },
      data: { lastRunAt: new Date(), lastError: errorMessage },
    });
  } finally {
    // Close Playwright browser if OtodomAdapter was used
    if (search.portal === "otodom") {
      const otodom = adapters["otodom"] as OtodomAdapter;
      await otodom.close().catch(() => undefined);
      // Re-instantiate for next run
      adapters["otodom"] = new OtodomAdapter();
    }
  }

  const durationMs = Date.now() - startedAt;

  await db.scrapeRunLog.update({
    where: { id: runLog.id },
    data: {
      finishedAt: new Date(),
      durationMs,
      success: !errorMessage,
      discoveredCount,
      newCount,
      updatedCount,
      inactiveCount,
      errorMessage: errorMessage ?? null,
    },
  });

  return {
    searchId: search.id,
    portal: search.portal,
    discoveredCount,
    newCount,
    updatedCount,
    inactiveCount,
    durationMs,
    error: errorMessage,
  };
}

// ---------------------------------------------------------------------------
// Persist detail fetch result & emit change events
// ---------------------------------------------------------------------------

async function persistDetails(
  details: ListingDetails
): Promise<void> {
  const canonical = canonicalizeUrl(details.source, details.canonicalUrl);
  const urlHash = hashUrl(canonical);
  const existing = await db.listing.findUnique({ where: { urlHash } });

  if (!existing) {
    log.warn({ url: canonical }, "Detail fetch returned unknown listing – skipping persist");
    return;
  }

  const fingerprint = computeFingerprint(details);

  if (details.status === "inactive") {
    if (existing.status !== "inactive") {
      await db.listing.update({
        where: { id: existing.id },
        data: { status: "inactive", lastCheckedAt: new Date(), fingerprint },
      });
      await db.listingEvent.create({
        data: { listingId: existing.id, eventType: "inactive" },
      });
    }
    return;
  }

  // Detect changes
  const changes = compareListings(existing, details);

  await db.listing.update({
    where: { id: existing.id },
    data: {
      title: details.title ?? existing.title,
      description: details.description ?? existing.description,
      price: details.price ?? existing.price,
      currency: details.currency ?? existing.currency,
      rooms: details.rooms ?? existing.rooms,
      bathrooms: details.bathrooms ?? existing.bathrooms,
      areaM2: details.areaM2 ?? existing.areaM2,
      floor: details.floor != null ? String(details.floor) : existing.floor,
      city: details.city ?? existing.city,
      neighborhood: details.neighborhood ?? existing.neighborhood,
      addressText: details.addressText ?? existing.addressText,
      lat: details.lat ?? existing.lat,
      lon: details.lon ?? existing.lon,
      agencyName: details.agencyName ?? existing.agencyName,
      advertiserType: details.advertiserType ?? existing.advertiserType,
      thumbnailUrl: details.thumbnailUrl ?? existing.thumbnailUrl,
      photosJson: details.photos ? (details.photos as string[]) : existing.photosJson,
      featuresJson: details.features ? (details.features as string[]) : existing.featuresJson,
      publishedAtText: details.publishedAtText ?? existing.publishedAtText,
      rawDetailsJson: (details.rawDetails ?? {}) as object,
      fingerprint,
      status: "active",
      lastCheckedAt: new Date(),
      lastChangedAt: changes.hasChanged ? new Date() : existing.lastChangedAt,
    },
  });

  // Emit events
  for (const eventType of changes.events) {
    await db.listingEvent.create({
      data: {
        listingId: existing.id,
        eventType,
        oldValueJson: changes.oldValues as object,
        newValueJson: changes.newValues as object,
      },
    });
  }
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

async function processWithConcurrency<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (queue.length > 0) {
      const item = queue.shift();
      if (item !== undefined) await fn(item);
    }
  });
  await Promise.all(workers);
}

/** Find listings with similar fingerprint (potential cross-portal duplicates) */
export async function findPotentialDuplicates(listingId: string) {
  const listing = await db.listing.findUnique({ where: { id: listingId } });
  if (!listing?.fingerprint) return [];

  return db.listing.findMany({
    where: {
      fingerprint: listing.fingerprint,
      id: { not: listingId },
    },
    orderBy: { firstSeenAt: "asc" },
    take: 10,
  });
}
