import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../../db/prisma.js";
import { runCrawlForSearch } from "../../core/crawlerRunner.js";
import { logger } from "../../utils/logger.js";
import { getAdapter } from "../../core/crawlerRunner.js";

const log = logger.child({ module: "api:saved-searches" });

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
  ownerType: z.string().optional(),
  sortBy: z.string().optional(),
  sortDirection: z.enum(["ASC", "DESC"]).optional(),
  extra: z.record(z.unknown()).optional(),
});

const CreateSearchSchema = z.object({
  name: z.string().min(1).max(200),
  portal: z.enum(["immohouse", "olx", "otodom"]),
  enabled: z.boolean().default(true),
  frequencyMinutes: z.number().int().min(5).max(1440).default(60),
  filters: SearchFiltersSchema,
});

const UpdateSearchSchema = CreateSearchSchema.partial().omit({ portal: true });

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export async function savedSearchRoutes(app: FastifyInstance): Promise<void> {
  // POST /saved-searches
  app.post("/saved-searches", async (req, reply) => {
    const body = CreateSearchSchema.safeParse(req.body);
    if (!body.success) {
      return reply.status(400).send({ error: "Validation error", details: body.error.format() });
    }

    const { name, portal, enabled, frequencyMinutes, filters } = body.data;
    const adapter = getAdapter(portal);
    const searchUrl = adapter.buildSearchUrl(filters);

    const search = await db.savedSearch.create({
      data: {
        name,
        portal,
        enabled,
        frequencyMinutes,
        filtersJson: filters as any,
        searchUrl,
      },
    });

    log.info({ searchId: search.id, portal, name }, "Created saved search");
    return reply.status(201).send(search);
  });

  // GET /saved-searches
  app.get("/saved-searches", async (_req, reply) => {
    const searches = await db.savedSearch.findMany({
      orderBy: { createdAt: "desc" },
    });
    return reply.send(searches);
  });

  // GET /saved-searches/:id
  app.get<{ Params: { id: string } }>("/saved-searches/:id", async (req, reply) => {
    const search = await db.savedSearch.findUnique({ where: { id: req.params.id } });
    if (!search) return reply.status(404).send({ error: "Not found" });
    return reply.send(search);
  });

  // PATCH /saved-searches/:id
  app.patch<{ Params: { id: string } }>("/saved-searches/:id", async (req, reply) => {
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
      filtersJson = filters;
      const adapter = getAdapter(existing.portal);
      searchUrl = adapter.buildSearchUrl(filters);
    }

    const updated = await db.savedSearch.update({
      where: { id: req.params.id },
      data: { ...rest, filtersJson: filtersJson as any, searchUrl },
    });

    return reply.send(updated);
  });

  // POST /saved-searches/:id/run  (manual trigger)
  app.post<{ Params: { id: string } }>("/saved-searches/:id/run", async (req, reply) => {
    const search = await db.savedSearch.findUnique({ where: { id: req.params.id } });
    if (!search) return reply.status(404).send({ error: "Not found" });

    log.info({ searchId: search.id }, "Manual crawl triggered via API");

    // Run asynchronously, return job info immediately
    setImmediate(() => {
      runCrawlForSearch(search).catch((err) =>
        log.error({ err, searchId: search.id }, "Manual crawl failed")
      );
    });

    return reply.status(202).send({ message: "Crawl started", searchId: search.id });
  });

  // GET /saved-searches/:id/listings
  app.get<{
    Params: { id: string };
    Querystring: { page?: string; limit?: string; userState?: string };
  }>("/saved-searches/:id/listings", async (req, reply) => {
    const search = await db.savedSearch.findUnique({ where: { id: req.params.id } });
    if (!search) return reply.status(404).send({ error: "Not found" });

    const page = Math.max(1, parseInt(req.query.page ?? "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit ?? "50", 10)));
    const skip = (page - 1) * limit;

    const where = req.query.userState
      ? { searchId: req.params.id, userState: req.query.userState }
      : { searchId: req.params.id };

    const [matches, total] = await Promise.all([
      db.searchListingMatch.findMany({
        where,
        include: { listing: true },
        orderBy: { lastMatchedAt: "desc" },
        skip,
        take: limit,
      }),
      db.searchListingMatch.count({ where }),
    ]);

    return reply.send({
      data: matches.map((m) => ({ ...m.listing, userState: m.userState, matchedAt: m.lastMatchedAt })),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  });

  // GET /saved-searches/:id/changes
  app.get<{
    Params: { id: string };
    Querystring: { since?: string };
  }>("/saved-searches/:id/changes", async (req, reply) => {
    const search = await db.savedSearch.findUnique({ where: { id: req.params.id } });
    if (!search) return reply.status(404).send({ error: "Not found" });

    const since = req.query.since ? new Date(req.query.since) : new Date(Date.now() - 24 * 3600 * 1000);

    // Get all listing IDs linked to this search
    const matches = await db.searchListingMatch.findMany({
      where: { searchId: req.params.id },
      select: { listingId: true },
    });
    const listingIds = matches.map((m) => m.listingId);

    const events = await db.listingEvent.findMany({
      where: {
        listingId: { in: listingIds },
        createdAt: { gte: since },
      },
      include: { listing: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    return reply.send(events);
  });
}
