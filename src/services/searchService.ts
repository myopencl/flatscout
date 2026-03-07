import { db } from "../db/prisma.js";
import { logger } from "../utils/logger.js";
import type { SearchFilters } from "../types/index.js";
import { OtodomAdapter } from "../adapters/otodom/OtodomAdapter.js";
import { OlxAdapter } from "../adapters/olx/OlxAdapter.js";
import { ImmohouseAdapter } from "../adapters/immohouse/ImmohouseAdapter.js";

const log = logger.child({ service: "searchService" });

// Portal adapters
const adapters: Record<string, any> = {
  otodom: new OtodomAdapter(),
  olx: new OlxAdapter(),
  immohouse: new ImmohouseAdapter(),
};

export interface CreateSearchInput {
  name: string;
  portal: "otodom" | "olx" | "immohouse";
  filters: SearchFilters;
  frequencyMinutes?: number; // Default: 60
}

export interface UpdateSearchInput {
  name?: string;
  filters?: SearchFilters;
  frequencyMinutes?: number;
  enabled?: boolean;
}

export interface SavedSearchResponse {
  id: string;
  name: string;
  portal: string;
  filters: SearchFilters;
  searchUrl: string;
  enabled: boolean;
  frequencyMinutes: number;
  createdAt: Date;
  updatedAt: Date;
  lastRunAt?: Date;
  lastSuccessAt?: Date;
}

/**
 * Create a new saved search
 */
export async function createSearch(input: CreateSearchInput): Promise<SavedSearchResponse> {
  const { name, portal, filters, frequencyMinutes = 60 } = input;

  // Get adapter for this portal
  const adapter = adapters[portal];
  if (!adapter) {
    throw new Error(`Unknown portal: ${portal}`);
  }

  // Generate search URL
  const searchUrl = adapter.buildSearchUrl(filters);

  // Create in database
  const search = await db.savedSearch.create({
    data: {
      name,
      portal,
      filtersJson: filters,
      searchUrl,
      frequencyMinutes,
      enabled: true,
    },
  });

  log.info({ searchId: search.id, portal, name }, "Created new search");
  return transformSearch(search);
}

/**
 * Get a saved search by ID
 */
export async function getSearch(searchId: string): Promise<SavedSearchResponse | null> {
  const search = await db.savedSearch.findUnique({
    where: { id: searchId },
  });

  return search ? transformSearch(search) : null;
}

/**
 * List all saved searches with pagination
 */
export async function listSearches(options?: {
  skip?: number;
  take?: number;
  portal?: string;
  enabled?: boolean;
}): Promise<{ searches: SavedSearchResponse[]; total: number }> {
  const where: any = {};

  if (options?.portal) {
    where.portal = options.portal;
  }
  if (options?.enabled !== undefined) {
    where.enabled = options.enabled;
  }

  const [searches, total] = await Promise.all([
    db.savedSearch.findMany({
      where,
      skip: options?.skip || 0,
      take: options?.take || 50,
      orderBy: { createdAt: "desc" },
    }),
    db.savedSearch.count({ where }),
  ]);

  return {
    searches: searches.map(transformSearch),
    total,
  };
}

/**
 * Update a saved search
 */
export async function updateSearch(
  searchId: string,
  input: UpdateSearchInput
): Promise<SavedSearchResponse> {
  // Get existing search to preserve portal and build URL if needed
  const existing = await getSearch(searchId);
  if (!existing) {
    throw new Error(`Search not found: ${searchId}`);
  }

  const updateData: any = {};

  if (input.name !== undefined) {
    updateData.name = input.name;
  }
  if (input.enabled !== undefined) {
    updateData.enabled = input.enabled;
  }
  if (input.frequencyMinutes !== undefined) {
    updateData.frequencyMinutes = input.frequencyMinutes;
  }

  // If filters changed, rebuild URL
  if (input.filters) {
    const adapter = adapters[existing.portal];
    if (!adapter) {
      throw new Error(`Unknown portal: ${existing.portal}`);
    }

    const searchUrl = adapter.buildSearchUrl(input.filters);
    updateData.filtersJson = input.filters;
    updateData.searchUrl = searchUrl;
  }

  const search = await db.savedSearch.update({
    where: { id: searchId },
    data: updateData,
  });

  log.info({ searchId, changes: Object.keys(input) }, "Updated search");
  return transformSearch(search);
}

/**
 * Delete a saved search
 */
export async function deleteSearch(searchId: string, cascadeDeleteListings = false): Promise<void> {
  if (cascadeDeleteListings) {
    // Delete all listings associated with this search
    const matches = await db.searchListingMatch.findMany({
      where: { searchId },
      select: { listingId: true },
    });

    const listingIds = matches.map((m: typeof matches[0]) => m.listingId);

    if (listingIds.length > 0) {
      await db.listing.deleteMany({
        where: { id: { in: listingIds } },
      });
      log.info({ searchId, deletedListings: listingIds.length }, "Deleted associated listings");
    }
  }

  await db.savedSearch.delete({
    where: { id: searchId },
  });

  log.info({ searchId, cascadeDelete: cascadeDeleteListings }, "Deleted search");
}

/**
 * Duplicate a saved search
 */
export async function duplicateSearch(searchId: string, newName?: string): Promise<SavedSearchResponse> {
  const existing = await getSearch(searchId);
  if (!existing) {
    throw new Error(`Search not found: ${searchId}`);
  }

  const name = newName || `${existing.name} (Copy)`;

  const newSearch = await db.savedSearch.create({
    data: {
      name,
      portal: existing.portal,
      filtersJson: existing.filters,
      searchUrl: existing.searchUrl,
      frequencyMinutes: existing.frequencyMinutes,
      enabled: true,
    },
  });

  log.info({ originalId: searchId, newId: newSearch.id }, "Duplicated search");
  return transformSearch(newSearch);
}

/**
 * Manually trigger a search run
 * (This just updates the timestamp; actual runner checks this)
 */
export async function executeSearchNow(searchId: string): Promise<SavedSearchResponse> {
  const search = await db.savedSearch.update({
    where: { id: searchId },
    data: {
      lastRunAt: new Date(),
    },
  });

  log.info({ searchId }, "Marked search for immediate execution");
  return transformSearch(search);
}

/**
 * Get listings from a specific search
 */
export async function getSearchListings(
  searchId: string,
  options?: {
    skip?: number;
    take?: number;
    status?: string; // Filter by user state status
  }
) {
  const where: any = { searchId };

  if (options?.status) {
    where.listing = {
      userState: {
        status: options.status,
      },
    };
  }

  const [matches, total] = await Promise.all([
    db.searchListingMatch.findMany({
      where,
      skip: options?.skip || 0,
      take: options?.take || 50,
      include: {
        listing: {
          include: {
            userState: true,
          },
        },
      },
      orderBy: { lastMatchedAt: "desc" },
    }),
    db.searchListingMatch.count({ where }),
  ]);

  return {
    listings: matches.map((m: typeof matches[0]) => ({
      ...m.listing,
      searchMatch: {
        firstMatchedAt: m.firstMatchedAt,
        lastMatchedAt: m.lastMatchedAt,
        currentMatchScore: m.currentMatchScore,
        userState: m.userState,
      },
    })),
    total,
  };
}

/**
 * Get statistics for a saved search
 */
export async function getSearchStats(searchId: string) {
  const search = await getSearch(searchId);
  if (!search) {
    throw new Error(`Search not found: ${searchId}`);
  }

  // Count listings by status
  const statsByStatus = await db.searchListingMatch.groupBy({
    by: ["userState"],
    where: { searchId },
    _count: true,
  });

  const stats = {
    search: search,
    totalListings: 0,
    byStatus: {} as Record<string, number>,
  };

  for (const group of statsByStatus) {
    stats.byStatus[group.userState] = group._count;
    stats.totalListings += group._count;
  }

  return stats;
}

// ============================================================================
// Helper functions
// ============================================================================

function transformSearch(rawSearch: any): SavedSearchResponse {
  return {
    id: rawSearch.id,
    name: rawSearch.name,
    portal: rawSearch.portal,
    filters: rawSearch.filtersJson,
    searchUrl: rawSearch.searchUrl,
    enabled: rawSearch.enabled,
    frequencyMinutes: rawSearch.frequencyMinutes,
    createdAt: rawSearch.createdAt,
    updatedAt: rawSearch.updatedAt,
    lastRunAt: rawSearch.lastRunAt,
    lastSuccessAt: rawSearch.lastSuccessAt,
  };
}
