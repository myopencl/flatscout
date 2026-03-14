import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../../db/prisma.js";
import { runCrawlForSearch, getAdapter } from "../../core/crawlerRunner.js";
import { logger } from "../../utils/logger.js";

const log = logger.child({ module: "api:searches" });

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const SearchFiltersSchema = z.object({
  operation: z.enum(["buy", "rent"]).default("buy"),
  propertyType: z.literal("flat").default("flat"),
  city: z.string().optional(),
  region: z.string().optional(),
  rooms: z.number().int().positive().optional(),
  priceMin: z.number().int().positive().optional(),
  priceMax: z.number().int().positive().optional(),
  areaMin: z.number().positive().optional(),
  areaMax: z.number().positive().optional(),
  radiusKm: z.number().positive().optional(),
  placeId: z.string().optional(),
  districtId: z.string().optional(),
  onlyWithPhotos: z.boolean().optional(),
  resultsPerPage: z.number().int().positive().optional(),
  ownerType: z.string().optional(),
  sortBy: z.string().optional(),
  sortDirection: z.enum(["ASC", "DESC"]).optional(),
  mapBounds: z.object({
    west: z.number(),
    south: z.number(),
    east: z.number(),
    north: z.number(),
  }).optional(),
  customSearchUrl: z.string().optional(),
  extra: z.record(z.unknown()).optional(),
});

const CreateSearchSchema = z.object({
  name: z.string().min(1).max(200),
  portal: z.enum(["immohouse", "olx", "otodom", "domy"]),
  enabled: z.boolean().default(true),
  frequencyMinutes: z.number().int().min(5).max(1440).default(60),
  filters: SearchFiltersSchema,
  // Convenience: accept customSearchUrl at the top level and merge into filters
  customSearchUrl: z.string().url().optional(),
});

const UpdateSearchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  enabled: z.boolean().optional(),
  frequencyMinutes: z.number().int().min(5).max(1440).optional(),
  filters: SearchFiltersSchema.optional(),
});

const SearchListingsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  listingStatus: z.enum(["FOUND", "SEEN", "VISIT_PENDING", "VISITED", "FINALIST", "DISCARDED"]).optional(),
  userState: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export async function searchesRoutes(app: FastifyInstance): Promise<void> {

  // POST /searches - Create
  app.post<{ Body: unknown }>("/searches", async (req, reply) => {
    const body = CreateSearchSchema.safeParse(req.body);
    if (!body.success) {
      return reply.status(400).send({ error: "Validation error", details: body.error.format() });
    }

    const { name, portal, enabled, frequencyMinutes, customSearchUrl } = body.data;
    // Merge top-level customSearchUrl into filters (either location is accepted)
    const filters = {
      ...body.data.filters,
      ...(customSearchUrl ? { customSearchUrl } : {}),
    };
    const adapter = getAdapter(portal);
    const searchUrl = adapter.buildSearchUrl(filters);

    const search = await db.savedSearch.create({
      data: { name, portal, enabled, frequencyMinutes, filtersJson: filters as any, searchUrl },
    });

    log.info({ searchId: search.id, portal, name }, "Created search");
    return reply.status(201).send(search);
  });

  // GET /searches - List all
  app.get<{ Querystring: Record<string, string> }>("/searches", async (req, reply) => {
    const portal = req.query["portal"];
    const enabled = req.query["enabled"];
    const page = Math.max(1, parseInt(req.query["page"] ?? "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query["limit"] ?? "50", 10)));
    const skip = (page - 1) * limit;

    const where: any = {};
    if (portal) where.portal = portal;
    if (enabled !== undefined) where.enabled = enabled === "true";

    const [searches, total] = await Promise.all([
      db.savedSearch.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: {
          _count: { select: { matches: true } },
        },
      }),
      db.savedSearch.count({ where }),
    ]);

    return reply.send({
      data: searches,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  });

  // GET /searches/:id - Get one
  app.get<{ Params: { id: string } }>("/searches/:id", async (req, reply) => {
    const search = await db.savedSearch.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { matches: true, runLogs: true } } },
    });
    if (!search) return reply.status(404).send({ error: "Not found" });
    return reply.send(search);
  });

  // PATCH /searches/:id - Update
  app.patch<{ Params: { id: string }; Body: unknown }>("/searches/:id", async (req, reply) => {
    const body = UpdateSearchSchema.safeParse(req.body);
    if (!body.success) {
      return reply.status(400).send({ error: "Validation error", details: body.error.format() });
    }

    const existing = await db.savedSearch.findUnique({ where: { id: req.params.id } });
    if (!existing) return reply.status(404).send({ error: "Not found" });

    const { filters, ...rest } = body.data;
    let searchUrl = existing.searchUrl;
    let filtersJson = existing.filtersJson;

    if (filters) {
      const adapter = getAdapter(existing.portal);
      searchUrl = adapter.buildSearchUrl(filters);
      filtersJson = filters as any;
    }

    const updated = await db.savedSearch.update({
      where: { id: req.params.id },
      data: { ...rest, filtersJson: filtersJson as any, searchUrl },
    });

    log.info({ searchId: req.params.id }, "Updated search");
    return reply.send(updated);
  });

  // DELETE /searches/:id - Delete
  app.delete<{
    Params: { id: string };
    Querystring: { cascadeListings?: string };
  }>("/searches/:id", async (req, reply) => {
    const existing = await db.savedSearch.findUnique({ where: { id: req.params.id } });
    if (!existing) return reply.status(404).send({ error: "Not found" });

    const cascadeListings = req.query.cascadeListings === "true";

    if (cascadeListings) {
      // Get all listing IDs from this search, then delete orphan listings
      const matches = await db.searchListingMatch.findMany({
        where: { searchId: req.params.id },
        select: { listingId: true },
      });
      const listingIds = matches.map((m) => m.listingId);

      if (listingIds.length > 0) {
        // Only delete listings that appear in no other search
        const sharedListings = await db.searchListingMatch.findMany({
          where: {
            listingId: { in: listingIds },
            searchId: { not: req.params.id },
          },
          select: { listingId: true },
        });
        const sharedIds = new Set(sharedListings.map((m) => m.listingId));
        const toDelete = listingIds.filter((id) => !sharedIds.has(id));

        if (toDelete.length > 0) {
          await db.listing.deleteMany({ where: { id: { in: toDelete } } });
          log.info({ searchId: req.params.id, deletedListings: toDelete.length }, "Cascade deleted listings");
        }
      }
    }

    await db.savedSearch.delete({ where: { id: req.params.id } });
    log.info({ searchId: req.params.id, cascadeListings }, "Deleted search");
    return reply.status(204).send();
  });

  // POST /searches/:id/duplicate - Duplicate
  app.post<{
    Params: { id: string };
    Body: { name?: string };
  }>("/searches/:id/duplicate", async (req, reply) => {
    const existing = await db.savedSearch.findUnique({ where: { id: req.params.id } });
    if (!existing) return reply.status(404).send({ error: "Not found" });

    const name = (req.body as any)?.name || `${existing.name} (Copy)`;

    const newSearch = await db.savedSearch.create({
      data: {
        name,
        portal: existing.portal,
        filtersJson: existing.filtersJson as any,
        searchUrl: existing.searchUrl,
        frequencyMinutes: existing.frequencyMinutes,
        enabled: true,
      },
    });

    log.info({ originalId: req.params.id, newId: newSearch.id }, "Duplicated search");
    return reply.status(201).send(newSearch);
  });

  // POST /searches/:id/run-now - Manual run
  app.post<{ Params: { id: string } }>("/searches/:id/run-now", async (req, reply) => {
    const search = await db.savedSearch.findUnique({ where: { id: req.params.id } });
    if (!search) return reply.status(404).send({ error: "Not found" });

    log.info({ searchId: search.id }, "Manual run triggered");
    setImmediate(() => {
      runCrawlForSearch(search).catch((err) =>
        log.error({ err, searchId: search.id }, "Manual run failed")
      );
    });

    return reply.status(202).send({ message: "Crawl started", searchId: search.id });
  });

  // GET /searches/:id/listings - Listings for this search with user state
  app.get<{
    Params: { id: string };
    Querystring: Record<string, string>;
  }>("/searches/:id/listings", async (req, reply) => {
    const search = await db.savedSearch.findUnique({ where: { id: req.params.id } });
    if (!search) return reply.status(404).send({ error: "Not found" });

    const q = SearchListingsQuerySchema.safeParse(req.query);
    if (!q.success) {
      return reply.status(400).send({ error: "Validation error", details: q.error.format() });
    }

    const { page, limit, listingStatus, userState } = q.data;
    const skip = (page - 1) * limit;

    const where: any = { searchId: req.params.id };
    if (userState) where.userState = userState;
    if (listingStatus) {
      where.listing = { userState: { status: listingStatus } };
    }

    const [matches, total] = await Promise.all([
      db.searchListingMatch.findMany({
        where,
        include: {
          listing: {
            include: { userState: true },
          },
        },
        orderBy: { lastMatchedAt: "desc" },
        skip,
        take: limit,
      }),
      db.searchListingMatch.count({ where }),
    ]);

    const data = matches.map((m) => ({
      ...m.listing,
      userState: m.listing.userState,
      searchMatch: {
        userState: m.userState,
        firstMatchedAt: m.firstMatchedAt,
        lastMatchedAt: m.lastMatchedAt,
      },
    }));

    return reply.send({
      data,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  });

  // GET /searches/:id/stats - Stats for this search
  app.get<{ Params: { id: string } }>("/searches/:id/stats", async (req, reply) => {
    const search = await db.savedSearch.findUnique({ where: { id: req.params.id } });
    if (!search) return reply.status(404).send({ error: "Not found" });

    // Count by listing status
    const statuses = ["FOUND", "SEEN", "VISIT_PENDING", "VISITED", "FINALIST", "DISCARDED"] as const;
    const byListingStatus: Record<string, number> = {};

    for (const status of statuses) {
      byListingStatus[status] = await db.searchListingMatch.count({
        where: {
          searchId: req.params.id,
          listing: { userState: { status } },
        },
      });
    }

    // Count by match user state
    const matchStates = await db.searchListingMatch.groupBy({
      by: ["userState"],
      where: { searchId: req.params.id },
      _count: true,
    });

    const byMatchState: Record<string, number> = {};
    for (const g of matchStates) {
      byMatchState[g.userState] = g._count;
    }

    const total = await db.searchListingMatch.count({ where: { searchId: req.params.id } });

    // Last run info
    const lastRun = await db.scrapeRunLog.findFirst({
      where: { searchId: req.params.id },
      orderBy: { startedAt: "desc" },
    });

    return reply.send({
      searchId: req.params.id,
      totalListings: total,
      byListingStatus,
      byMatchState,
      lastRun: lastRun
        ? {
            startedAt: lastRun.startedAt,
            success: lastRun.success,
            discoveredCount: lastRun.discoveredCount,
            newCount: lastRun.newCount,
            durationMs: lastRun.durationMs,
          }
        : null,
    });
  });

  // GET /searches/:id/changes - Recent changes (kept for backwards compat)
  app.get<{
    Params: { id: string };
    Querystring: { since?: string };
  }>("/searches/:id/changes", async (req, reply) => {
    const search = await db.savedSearch.findUnique({ where: { id: req.params.id } });
    if (!search) return reply.status(404).send({ error: "Not found" });

    const since = req.query.since
      ? new Date(req.query.since)
      : new Date(Date.now() - 24 * 3600 * 1000);

    const matches = await db.searchListingMatch.findMany({
      where: { searchId: req.params.id },
      select: { listingId: true },
    });
    const listingIds = matches.map((m) => m.listingId);

    const events = await db.listingEvent.findMany({
      where: { listingId: { in: listingIds }, createdAt: { gte: since } },
      include: { listing: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    return reply.send(events);
  });
}
