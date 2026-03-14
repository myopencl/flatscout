import type { SavedSearch } from "@prisma/client";
import { db } from "../db/prisma.js";
import { logger } from "../utils/logger.js";
import { canonicalizeUrl, hashUrl } from "./canonicalizeUrl.js";
import { computeFingerprint } from "./fingerprints.js";
import { compareListings } from "./compareListings.js";
import { computeMatchScore } from "./scoring.js";
import { ImmohouseAdapter } from "../adapters/immohouse/ImmohouseAdapter.js";
import { OlxAdapter } from "../adapters/olx/OlxAdapter.js";
import { OtodomAdapter } from "../adapters/otodom/OtodomAdapter.js";
import { DomyAdapter } from "../adapters/domy/DomyAdapter.js";
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
  domy: new DomyAdapter(),
};

// ---------------------------------------------------------------------------
// Playwright-based portal lock
// Portals that share a single browser instance (Playwright) must not run
// concurrently – a finishing run closes the browser that the other run is
// still using.  We serialise them with a per-portal promise chain.
// ---------------------------------------------------------------------------

const PLAYWRIGHT_PORTALS = new Set(["otodom"]);
const portalLock: Record<string, Promise<unknown>> = {};

/**
 * Wrap `fn` so that only ONE call runs at a time for the given portal.
 * Subsequent calls are queued and run after the previous one resolves.
 */
function withPortalLock<T>(portal: string, fn: () => Promise<T>): Promise<T> {
  if (!PLAYWRIGHT_PORTALS.has(portal)) return fn();

  const prev = portalLock[portal] ?? Promise.resolve();
  const next = prev.then(() => fn(), () => fn()); // run even if prev errored
  portalLock[portal] = next.catch(() => undefined); // swallow so chain keeps going
  return next;
}

export function getAdapter(source: string): PortalAdapter {
  const adapter = adapters[source];
  if (!adapter) throw new Error(`Unknown portal source: ${source}`);
  return adapter;
}

// ---------------------------------------------------------------------------
// Main runner
// ---------------------------------------------------------------------------

export function runCrawlForSearch(search: SavedSearch): Promise<CrawlResult> {
  return withPortalLock(search.portal, () => _runCrawlForSearch(search));
}

async function _runCrawlForSearch(search: SavedSearch): Promise<CrawlResult> {
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

      let existing = await db.listing.findUnique({ where: { urlHash } });

      if (!existing) {
        // Brand-new listing – save stub immediately, queue for detail fetch
        const newListing = await db.listing.create({
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

        // Initialize user state with FOUND status for every new listing
        await db.listingUserState.create({
          data: {
            listingId: newListing.id,
            status: "FOUND",
          },
        });

        await db.listingEvent.create({
          data: {
            listingId: newListing.id,
            eventType: "new",
            newValueJson: stub as unknown as object,
          },
        });

        newCount++;
        urlsNeedingDetail.push(canonical);
        existing = newListing;
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

      // Associate with this saved search and compute a preliminary match score
      // (will be refined after detail fetch with full listing data)
      const matchScore = computeMatchScore(
        {
          price: existing.price,
          rooms: existing.rooms,
          areaM2: existing.areaM2,
          city: existing.city,
        },
        filters
      );

      await db.searchListingMatch.upsert({
        where: { searchId_listingId: { searchId: search.id, listingId: existing.id } },
        create: {
          searchId: search.id,
          listingId: existing.id,
          lastMatchedAt: new Date(),
          currentMatchScore: matchScore,
        },
        update: {
          lastMatchedAt: new Date(),
          currentMatchScore: matchScore,
        },
      });
    }

    // ---- PHASE 3: Detail fetch (throttled) ----
    // NOTE: cross-portal deduplication happens inside persistDetails,
    // where the full fingerprint (price + area + rooms + city + …) is available.
    log.info({ count: urlsNeedingDetail.length }, "Starting detail fetches");
    await processWithConcurrency(
      urlsNeedingDetail,
      DETAIL_CONCURRENCY,
      async (url) => {
        try {
          const details = await adapter.fetchListingDetails(url);
          const result = await persistDetails(details, search.id, filters);
          if (result?.updated) updatedCount++;
        } catch (err) {
          log.error({ err, url }, "Detail fetch failed");
          // Reset lastCheckedAt to epoch so Phase 2 re-queues this listing
          // on the very next search run instead of waiting 24 hours.
          try {
            const urlHash = hashUrl(canonicalizeUrl(search.portal, url));
            await db.listing.updateMany({
              where: { urlHash },
              data: { lastCheckedAt: new Date(0) },
            });
          } catch {
            // Best-effort – don't let this mask the original error
          }
        }
      }
    );

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
//
// Cross-portal deduplication:
//   Once we have full detail data (and thus a reliable fingerprint), we check
//   whether the same physical apartment already exists under a different
//   portal's URL.  If a duplicate is found we:
//     1. Add this URL to the older listing's `alternateUrls` array.
//     2. Re-map any SearchListingMatch rows that point to this stub listing
//        so they point to the older canonical listing instead.
//     3. Delete the stub listing that was just created for this URL.
//
//   This keeps exactly ONE row per real apartment in the database.
// ---------------------------------------------------------------------------

/** Public alias so the import endpoint can reuse persist logic without a searchId */
export async function persistDetailsPublic(details: ListingDetails) {
  return persistDetails(details);
}

async function persistDetails(
  details: ListingDetails,
  searchId?: string,
  filters?: SearchFilters
): Promise<{ updated: boolean; mergedIntoId?: string } | null> {
  const canonical = canonicalizeUrl(details.source, details.canonicalUrl);
  const urlHash = hashUrl(canonical);
  const existing = await db.listing.findUnique({ where: { urlHash } });

  if (!existing) {
    logger.warn({ url: canonical }, "Detail fetch returned unknown listing – skipping persist");
    return null;
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
    return { updated: false };
  }

  // ---- Cross-portal duplicate check ----
  // We now have a FULL fingerprint (price, area, rooms, city, neighbourhood,
  // agency, address, first sentence of description), so duplicates are
  // reliable.  Only check against OTHER portals – same-portal matches are
  // normal re-crawls.
  const primaryListing = await db.listing.findFirst({
    where: {
      fingerprint,
      source: { not: details.source },
      status: "active",
      // Exclude the listing we're currently working on
      id: { not: existing.id },
    },
    orderBy: { firstSeenAt: "asc" }, // oldest = primary
  });

  if (primaryListing) {
    logger.info(
      {
        primaryId: primaryListing.id,
        primarySource: primaryListing.source,
        duplicateUrl: canonical,
        duplicateSource: details.source,
      },
      "Cross-portal duplicate detected during detail fetch – merging"
    );

    // 1. Add this URL to the primary listing's alternateUrls
    const existingAlternates = (primaryListing.alternateUrls as string[] | null) ?? [];
    if (!existingAlternates.includes(canonical)) {
      await db.listing.update({
        where: { id: primaryListing.id },
        data: {
          alternateUrls: [...existingAlternates, canonical] as any,
          lastSeenAt: new Date(),
        },
      });
    }

    // 2. Re-map SearchListingMatch records from the stub to the primary
    if (searchId && filters) {
      const stubMatch = await db.searchListingMatch.findUnique({
        where: { searchId_listingId: { searchId, listingId: existing.id } },
      });

      if (stubMatch) {
        // Compute an accurate score for the primary (which has full data)
        const matchScore = computeMatchScore(
          {
            price: primaryListing.price,
            rooms: primaryListing.rooms,
            areaM2: primaryListing.areaM2,
            city: primaryListing.city,
          },
          filters
        );

        // Upsert into the primary; delete the stub match
        await db.searchListingMatch.upsert({
          where: { searchId_listingId: { searchId, listingId: primaryListing.id } },
          create: {
            searchId,
            listingId: primaryListing.id,
            firstMatchedAt: stubMatch.firstMatchedAt,
            lastMatchedAt: new Date(),
            currentMatchScore: matchScore,
          },
          update: { lastMatchedAt: new Date(), currentMatchScore: matchScore },
        });

        await db.searchListingMatch.delete({
          where: { searchId_listingId: { searchId, listingId: existing.id } },
        });
      }
    }

    // 3. Remove the stub listing (all related rows cascade-delete)
    await db.listing.delete({ where: { id: existing.id } });

    return { updated: false, mergedIntoId: primaryListing.id };
  }

  // ---- Normal path: update the listing with full detail data ----
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
      photosJson: details.photos ? (details.photos as any) : existing.photosJson,
      featuresJson: details.features ? (details.features as any) : existing.featuresJson,
      publishedAtText: details.publishedAtText ?? existing.publishedAtText,
      rawDetailsJson: (details.rawDetails ?? {}) as object,
      fingerprint,
      status: "active",
      lastCheckedAt: new Date(),
      lastChangedAt: changes.hasChanged ? new Date() : existing.lastChangedAt,
    },
  });

  // Re-compute score with enriched data and update the match record
  if (searchId && filters) {
    const refinedScore = computeMatchScore(
      {
        price: details.price ?? existing.price,
        rooms: details.rooms ?? existing.rooms,
        areaM2: details.areaM2 ?? existing.areaM2,
        city: details.city ?? existing.city,
      },
      filters
    );
    await db.searchListingMatch.updateMany({
      where: { listingId: existing.id, searchId },
      data: { currentMatchScore: refinedScore },
    });
  }

  // Emit change events
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

  return { updated: changes.hasChanged };
}

// ---------------------------------------------------------------------------
// Cross-portal duplicate lookup (used by API endpoint)
// ---------------------------------------------------------------------------

/** Find listings with the same fingerprint (potential cross-portal duplicates). */
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

// ---------------------------------------------------------------------------
// Re-fetch a single listing by ID
// ---------------------------------------------------------------------------

export async function refetchListingById(listingId: string): Promise<void> {
  const listing = await db.listing.findUnique({ where: { id: listingId } });
  if (!listing) throw new Error(`Listing not found: ${listingId}`);

  const adapter = getAdapter(listing.source);
  const details = await adapter.fetchListingDetails(listing.canonicalUrl);
  await persistDetails(details);
}

// ---------------------------------------------------------------------------
// Re-fetch incomplete listings (missing price or lat/lon)
// ---------------------------------------------------------------------------

export async function refetchIncompleteListings(limit: number): Promise<number> {
  const incomplete = await db.listing.findMany({
    where: {
      status: "active",
      OR: [
        { price: null },
        { lat: null },
        { lon: null },
      ],
    },
    orderBy: { lastCheckedAt: "asc" },
    take: limit,
    select: { id: true },
  });

  await processWithConcurrency(
    incomplete.map((l) => l.id),
    DETAIL_CONCURRENCY,
    async (id) => {
      try {
        await refetchListingById(id);
      } catch (err) {
        logger.error({ err, listingId: id }, "Incomplete listing refetch failed");
      }
    }
  );

  return incomplete.length;
}
