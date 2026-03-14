import { db } from "../db/prisma.js";
import { logger } from "../utils/logger.js";
import type { ListingUserState, ListingStatus, UpdateListingStateRequest } from "../types/index.js";

const log = logger.child({ service: "listingStateService" });

/**
 * Get or create ListingUserState for a listing
 * If it doesn't exist, create it with FOUND status
 */
export async function getOrCreateListingState(listingId: string): Promise<ListingUserState> {
  let state = await db.listingUserState.findUnique({
    where: { listingId },
  });

  if (!state) {
    state = await db.listingUserState.create({
      data: {
        listingId,
        status: "FOUND",
      },
    });
    log.debug({ listingId }, "Created new listing user state");
  }

  return transformState(state);
}

/**
 * Get existing ListingUserState
 */
export async function getListingState(listingId: string): Promise<ListingUserState | null> {
  const state = await db.listingUserState.findUnique({
    where: { listingId },
  });

  return state ? transformState(state) : null;
}

/**
 * Update ListingUserState with new values
 * Only updates fields that are provided
 */
export async function updateListingState(
  listingId: string,
  updates: UpdateListingStateRequest
): Promise<ListingUserState> {
  // Get or create state first
  await getOrCreateListingState(listingId);

  // Prepare data for update
  const updateData: Record<string, any> = {};

  if (updates.status !== undefined) {
    updateData.status = updates.status;
  }
  if (updates.comments !== undefined) {
    updateData.comments = updates.comments;
  }
  if (updates.visitDate !== undefined) {
    updateData.visitDate = updates.visitDate;
  }
  if (updates.pros !== undefined) {
    updateData.prosJson = updates.pros;
  }
  if (updates.cons !== undefined) {
    updateData.consJson = updates.cons;
  }
  if (updates.rating !== undefined) {
    updateData.rating = updates.rating;
  }
  if (updates.isFavorite !== undefined) {
    updateData.isFavorite = updates.isFavorite;
  }

  const state = await db.listingUserState.update({
    where: { listingId },
    data: updateData,
  });

  log.debug({ listingId, updates }, "Updated listing state");
  return transformState(state);
}

/**
 * Check if a listing can be deleted (only FOUND status allowed)
 */
export async function canDeleteListing(listingId: string): Promise<boolean> {
  const state = await getListingState(listingId);
  if (!state) {
    // If no state exists, it's effectively FOUND (new listing)
    return true;
  }
  return state.status === "FOUND";
}

/**
 * Delete a single listing with validation
 * Only allows deletion if status is FOUND
 */
export async function deleteListingWithValidation(listingId: string): Promise<void> {
  const canDelete = await canDeleteListing(listingId);
  if (!canDelete) {
    const state = await getListingState(listingId);
    throw new Error(
      `Cannot delete listing in ${state?.status || "UNKNOWN"} state. Only FOUND listings can be deleted.`
    );
  }

  // Delete the listing (will cascade delete ListingUserState)
  await db.listing.delete({
    where: { id: listingId },
  });

  log.info({ listingId }, "Deleted listing with validation");
}

/**
 * Delete listings by status
 * Allows deletion only if ALL matching listings are in FOUND status
 */
export async function deleteListingsByStatus(
  status: ListingStatus,
  filters?: {
    portalId?: string;
    city?: string;
    maxDaysOld?: number;
  }
): Promise<{ deletedCount: number; skippedCount: number }> {
  // Build query to find listings with this status
  let where: any = {
    userState: {
      status,
    },
  };

  if (filters?.portalId) {
    where.source = filters.portalId;
  }
  if (filters?.city) {
    where.city = filters.city;
  }
  if (filters?.maxDaysOld) {
    const daysAgo = new Date(Date.now() - filters.maxDaysOld * 24 * 60 * 60 * 1000);
    where.updatedAt = { lt: daysAgo };
  }

  // If status is not FOUND, we need to check
  if (status !== "FOUND") {
    // Count how many are in FOUND status among these criteria
    const foundCount = await db.listing.count({
      where: {
        ...where,
        userState: {
          status: "FOUND",
        },
      },
    });

    if (foundCount > 0) {
      log.warn(
        { status, foundCount },
        "Cannot delete listings in non-FOUND status because some are in FOUND status"
      );
      // Could implement partial delete, but for safety we return error
      throw new Error(
        `Cannot delete listings in ${status} status. Found ${foundCount} listings that are still in FOUND status.`
      );
    }
  }

  const listings = await db.listing.findMany({
    where,
    select: { id: true },
  });

  if (listings.length === 0) {
    return { deletedCount: 0, skippedCount: 0 };
  }

  // Delete all listings (cascade will delete ListingUserState)
  const result = await db.listing.deleteMany({
    where,
  });

  log.info({ status, count: result.count }, "Deleted listings by status");
  return { deletedCount: result.count, skippedCount: 0 };
}

/**
 * Delete listings by generic criteria (price, area, portal, city, etc.)
 * Only allows deletion if ALL matching listings are in FOUND status
 */
export async function deleteListingsByCriteria(criteria: {
  status?: ListingStatus;
  priceMin?: number;
  priceMax?: number;
  areaMin?: number;
  areaMax?: number;
  portal?: string;
  city?: string;
  daysOld?: number; // Delete if not updated in N days
}): Promise<{ deletedCount: number; skippedCount: number; preventedCount: number }> {
  // Build dynamic query
  const where: any = {};

  if (criteria.status) {
    where.userState = { status: criteria.status };
  } else {
    // Default: only delete FOUND listings
    where.userState = { status: "FOUND" };
  }

  if (criteria.priceMin !== undefined || criteria.priceMax !== undefined) {
    where.price = {};
    if (criteria.priceMin !== undefined) where.price.gte = criteria.priceMin;
    if (criteria.priceMax !== undefined) where.price.lte = criteria.priceMax;
  }

  if (criteria.areaMin !== undefined || criteria.areaMax !== undefined) {
    where.areaM2 = {};
    if (criteria.areaMin !== undefined) where.areaM2.gte = criteria.areaMin;
    if (criteria.areaMax !== undefined) where.areaM2.lte = criteria.areaMax;
  }

  if (criteria.portal) {
    where.source = criteria.portal;
  }

  if (criteria.city) {
    where.city = criteria.city;
  }

  if (criteria.daysOld) {
    const daysAgo = new Date(Date.now() - criteria.daysOld * 24 * 60 * 60 * 1000);
    where.updatedAt = { lt: daysAgo };
  }

  // Verify that non-FOUND listings won't be deleted
  const nonFoundCount = await db.listing.count({
    where: {
      ...where,
      userState: {
        status: {
          not: "FOUND",
        },
      },
    },
  });

  if (nonFoundCount > 0) {
    log.warn(
      { criteria, nonFoundCount },
      "Some listings match criteria but are not in FOUND status - preventing deletion"
    );
    throw new Error(
      `Cannot delete listings by these criteria. Found ${nonFoundCount} listings in non-FOUND status that match the criteria.`
    );
  }

  // Delete all matching listings
  const result = await db.listing.deleteMany({
    where,
  });

  log.info({ criteria, deletedCount: result.count }, "Deleted listings by criteria");
  return { deletedCount: result.count, skippedCount: 0, preventedCount: nonFoundCount };
}

/**
 * Get statistics about listings by status
 */
export async function getListingStatsByStatus(): Promise<Record<string, number>> {
  const statuses: ListingStatus[] = ["FOUND", "SEEN", "VISIT_PENDING", "VISITED", "FINALIST", "DISCARDED"];
  const stats: Record<string, number> = {};

  for (const status of statuses) {
    const count = await db.listing.count({
      where: {
        userState: {
          status,
        },
      },
    });
    stats[status] = count;
  }

  return stats;
}

// ============================================================================
// Helper functions
// ============================================================================

/**
 * Transform Prisma model to API response type
 */
function transformState(rawState: any): ListingUserState {
  return {
    id: rawState.id,
    listingId: rawState.listingId,
    status: rawState.status,
    comments: rawState.comments,
    visitDate: rawState.visitDate,
    pros: rawState.prosJson ? JSON.parse(JSON.stringify(rawState.prosJson)) : undefined,
    cons: rawState.consJson ? JSON.parse(JSON.stringify(rawState.consJson)) : undefined,
    rating: rawState.rating,
    isFavorite: rawState.isFavorite ?? false,
    createdAt: rawState.createdAt,
    updatedAt: rawState.updatedAt,
  };
}
