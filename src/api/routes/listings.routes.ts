import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../../db/prisma.js";
import { findPotentialDuplicates, getAdapter, persistDetailsPublic } from "../../core/crawlerRunner.js";
import { canonicalizeUrl, hashUrl } from "../../core/canonicalizeUrl.js";
import {
  getOrCreateListingState,
  updateListingState,
  deleteListingWithValidation,
  deleteListingsByCriteria,
} from "../../services/listingStateService.js";

/** Detect which portal a URL belongs to based on hostname */
function detectPortal(url: string): string | null {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.includes("otodom.pl"))   return "otodom";
    if (host.includes("olx.pl"))      return "olx";
    if (host.includes("domy.pl"))     return "domy";
    if (host.includes("immohouse"))   return "immohouse";
    return null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const ListingStatus = z.enum(["FOUND", "SEEN", "VISIT_PENDING", "VISITED", "FINALIST", "DISCARDED"]);

const ListingsQuerySchema = z.object({
  source: z.string().optional(),
  city: z.string().optional(),
  minPrice: z.coerce.number().optional(),
  maxPrice: z.coerce.number().optional(),
  minArea: z.coerce.number().optional(),
  maxArea: z.coerce.number().optional(),
  rooms: z.coerce.number().int().optional(),
  status: z.enum(["active", "inactive"]).optional(),
  listingStatus: ListingStatus.optional(),
  updatedSince: z.string().optional(),
  hasComments: z.enum(["true", "false"]).optional(),
  rating: z.coerce.number().int().min(1).max(5).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  sortBy: z.enum(["lastSeenAt", "price", "areaM2", "createdAt", "updatedAt"]).default("lastSeenAt"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
});

const UpdateListingStateSchema = z.object({
  status: ListingStatus.optional(),
  comments: z.string().max(5000).optional(),
  visitDate: z.string().datetime().optional(),
  pros: z.array(z.string().max(200)).max(20).optional(),
  cons: z.array(z.string().max(200)).max(20).optional(),
  rating: z.number().int().min(1).max(5).optional(),
});

const BulkDeleteSchema = z.object({
  // Filter by listing status (only FOUND listings can be deleted)
  listingStatus: ListingStatus.optional(),
  // Additional filters
  priceMin: z.number().optional(),
  priceMax: z.number().optional(),
  areaMin: z.number().optional(),
  areaMax: z.number().optional(),
  portal: z.string().optional(),
  city: z.string().optional(),
  daysOld: z.number().int().positive().optional(),
}).refine(
  (data) => Object.values(data).some((v) => v !== undefined),
  { message: "At least one filter criteria must be specified" }
);

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export async function listingsRoutes(app: FastifyInstance): Promise<void> {

  // GET /listings - List with optional state filter
  app.get<{ Querystring: Record<string, string> }>("/listings", async (req, reply) => {
    const q = ListingsQuerySchema.safeParse(req.query);
    if (!q.success) {
      return reply.status(400).send({ error: "Validation error", details: q.error.format() });
    }

    const {
      source, city, minPrice, maxPrice, minArea, maxArea,
      rooms, status, listingStatus, updatedSince, hasComments,
      rating, page, limit, sortBy, sortDir,
    } = q.data;

    const skip = (page - 1) * limit;

    // Build Prisma where clause
    const where: any = {};
    if (source) where.source = source;
    if (city) where.city = { contains: city, mode: "insensitive" };
    if (status) where.status = status;
    if (updatedSince) where.updatedAt = { gte: new Date(updatedSince) };
    if (rooms != null) where.rooms = rooms;

    // Price range
    if (minPrice != null || maxPrice != null) {
      where.price = {};
      if (minPrice != null) where.price.gte = minPrice;
      if (maxPrice != null) where.price.lte = maxPrice;
    }

    // Area range
    if (minArea != null || maxArea != null) {
      where.areaM2 = {};
      if (minArea != null) where.areaM2.gte = minArea;
      if (maxArea != null) where.areaM2.lte = maxArea;
    }

    // Filter by user listing status
    if (listingStatus) {
      where.userState = { status: listingStatus };
    }

    // Filter by whether they have comments
    if (hasComments === "true") {
      where.userState = { ...where.userState, comments: { not: null } };
    } else if (hasComments === "false") {
      where.userState = { ...where.userState, comments: null };
    }

    // Filter by rating
    if (rating != null) {
      where.userState = { ...where.userState, rating };
    }

    const [listings, total] = await Promise.all([
      db.listing.findMany({
        where,
        include: { userState: true },
        orderBy: { [sortBy]: sortDir },
        skip,
        take: limit,
      }),
      db.listing.count({ where }),
    ]);

    return reply.send({
      data: listings,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  });

  // GET /listings/:id - Get one with user state
  app.get<{ Params: { id: string } }>("/listings/:id", async (req, reply) => {
    const listing = await db.listing.findUnique({
      where: { id: req.params.id },
      include: { userState: true },
    });
    if (!listing) return reply.status(404).send({ error: "Not found" });
    return reply.send(listing);
  });

  // GET /listings/:id/state - Get user state
  app.get<{ Params: { id: string } }>("/listings/:id/state", async (req, reply) => {
    const listing = await db.listing.findUnique({
      where: { id: req.params.id },
      select: { id: true },
    });
    if (!listing) return reply.status(404).send({ error: "Not found" });

    const state = await getOrCreateListingState(req.params.id);
    return reply.send(state);
  });

  // PATCH /listings/:id/state - Update user state (status, comments, pros, cons, etc.)
  app.patch<{ Params: { id: string }; Body: unknown }>("/listings/:id/state", async (req, reply) => {
    const body = UpdateListingStateSchema.safeParse(req.body);
    if (!body.success) {
      return reply.status(400).send({ error: "Validation error", details: body.error.format() });
    }

    const listing = await db.listing.findUnique({
      where: { id: req.params.id },
      select: { id: true },
    });
    if (!listing) return reply.status(404).send({ error: "Not found" });

    const updates = {
      ...body.data,
      visitDate: body.data.visitDate ? new Date(body.data.visitDate) : undefined,
    };

    const state = await updateListingState(req.params.id, updates);
    return reply.send(state);
  });

  // DELETE /listings/:id - Delete single listing (only if FOUND)
  app.delete<{ Params: { id: string } }>("/listings/:id", async (req, reply) => {
    const listing = await db.listing.findUnique({
      where: { id: req.params.id },
      include: { userState: true },
    });
    if (!listing) return reply.status(404).send({ error: "Not found" });

    try {
      await deleteListingWithValidation(req.params.id);
      return reply.status(204).send();
    } catch (err: any) {
      // State restriction error
      return reply.status(403).send({
        error: err.message,
        currentStatus: listing.userState?.status ?? "FOUND",
      });
    }
  });

  // POST /listings/import - Import a single listing by URL
  app.post<{ Body: unknown }>("/listings/import", async (req, reply) => {
    const body = z.object({ url: z.string().url() }).safeParse(req.body);
    if (!body.success) {
      return reply.status(400).send({ error: "Validation error", details: body.error.format() });
    }

    const rawUrl = body.data.url;
    const portal = detectPortal(rawUrl);
    if (!portal) {
      return reply.status(422).send({
        error: "Unrecognised portal",
        message: "URL does not match any known portal (otodom, olx, domy, immohouse)",
      });
    }

    const canonical = canonicalizeUrl(portal, rawUrl);
    const urlHash   = hashUrl(canonical);

    // 1. Already in DB?
    const existing = await db.listing.findUnique({
      where: { urlHash },
      include: { userState: true },
    });

    if (existing) {
      return reply.status(200).send({
        alreadyExists: true,
        listing: existing,
      });
    }

    // 2. Fetch details via adapter
    let details;
    try {
      const adapter = getAdapter(portal);
      details = await adapter.fetchListingDetails(canonical);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return reply.status(502).send({ error: "Detail fetch failed", message: msg });
    }

    // 3. Create stub first – persistDetails only updates existing rows,
    //    so we must ensure the row exists before calling it.
    const now = new Date();
    const stub = await db.listing.create({
      data: {
        source: portal,
        canonicalUrl: canonical,
        urlHash,
        status: "active",
        title: details.title ?? null,
        price: details.price ?? null,
        currency: details.currency ?? "PLN",
        rooms: details.rooms ?? null,
        areaM2: details.areaM2 ?? null,
        thumbnailUrl: details.thumbnailUrl ?? null,
        firstSeenAt: now,
        lastSeenAt: now,
        lastCheckedAt: new Date(0), // force persistDetails to run immediately
      },
    });

    // Initialize user state
    await db.listingUserState.create({ data: { listingId: stub.id, status: "FOUND" } });

    // 4. Persist full details (updates the stub we just created)
    await persistDetailsPublic(details);

    const created = await db.listing.findUnique({
      where: { urlHash },
      include: { userState: true },
    });

    return reply.status(201).send({ alreadyExists: false, listing: created });
  });

  // POST /listings/bulk-delete - Delete multiple listings by criteria
  app.post<{ Body: unknown }>("/listings/bulk-delete", async (req, reply) => {
    const body = BulkDeleteSchema.safeParse(req.body);
    if (!body.success) {
      return reply.status(400).send({ error: "Validation error", details: body.error.format() });
    }

    try {
      const result = await deleteListingsByCriteria({
        status: body.data.listingStatus,
        priceMin: body.data.priceMin,
        priceMax: body.data.priceMax,
        areaMin: body.data.areaMin,
        areaMax: body.data.areaMax,
        portal: body.data.portal,
        city: body.data.city,
        daysOld: body.data.daysOld,
      });
      return reply.send(result);
    } catch (err: any) {
      // Contains non-FOUND listings
      return reply.status(409).send({ error: err.message });
    }
  });

  // GET /listings/:id/events - Audit history
  app.get<{ Params: { id: string }; Querystring: { limit?: string } }>(
    "/listings/:id/events",
    async (req, reply) => {
      const listing = await db.listing.findUnique({
        where: { id: req.params.id },
        select: { id: true },
      });
      if (!listing) return reply.status(404).send({ error: "Not found" });

      const limit = Math.min(200, parseInt(req.query.limit ?? "50", 10));
      const events = await db.listingEvent.findMany({
        where: { listingId: req.params.id },
        orderBy: { createdAt: "desc" },
        take: limit,
      });
      return reply.send(events);
    }
  );

  // GET /listings/:id/potential-duplicates
  app.get<{ Params: { id: string } }>("/listings/:id/potential-duplicates", async (req, reply) => {
    const listing = await db.listing.findUnique({
      where: { id: req.params.id },
      select: { id: true },
    });
    if (!listing) return reply.status(404).send({ error: "Not found" });

    const duplicates = await findPotentialDuplicates(req.params.id);
    return reply.send(duplicates);
  });

  // PATCH /listings/:id/match-state - Legacy: update per-search match state
  app.patch<{
    Params: { id: string };
    Body: { searchId: string; userState: string };
  }>("/listings/:id/match-state", async (req, reply) => {
    const { searchId, userState } = req.body as { searchId: string; userState: string };
    const validStates = ["new", "seen", "favorite", "discarded", "contacted"];
    if (!validStates.includes(userState)) {
      return reply.status(400).send({ error: `userState must be one of: ${validStates.join(", ")}` });
    }

    const match = await db.searchListingMatch.findUnique({
      where: { searchId_listingId: { searchId, listingId: req.params.id } },
    });
    if (!match) return reply.status(404).send({ error: "Match not found" });

    const updated = await db.searchListingMatch.update({
      where: { searchId_listingId: { searchId, listingId: req.params.id } },
      data: { userState },
    });
    return reply.send(updated);
  });

  /**
   * PATCH /listings/:id/score
   * Manually override the currentMatchScore for a specific saved-search match.
   * The scraper computes this automatically; use this endpoint to correct it.
   *
   * Body: { searchId: string, score: number (0.0 – 1.0) }
   */
  app.patch<{
    Params: { id: string };
    Body: unknown;
  }>("/listings/:id/score", async (req, reply) => {
    const OverrideScoreSchema = z.object({
      searchId: z.string().uuid(),
      score: z.number().min(0).max(1),
    });

    const body = OverrideScoreSchema.safeParse(req.body);
    if (!body.success) {
      return reply.status(400).send({ error: "Validation error", details: body.error.format() });
    }

    const { searchId, score } = body.data;

    const match = await db.searchListingMatch.findUnique({
      where: { searchId_listingId: { searchId, listingId: req.params.id } },
    });
    if (!match) {
      return reply.status(404).send({ error: "No match found for this listing + search combination" });
    }

    const updated = await db.searchListingMatch.update({
      where: { searchId_listingId: { searchId, listingId: req.params.id } },
      data: { currentMatchScore: score },
    });

    return reply.send({ listingId: req.params.id, searchId, currentMatchScore: updated.currentMatchScore });
  });
}
