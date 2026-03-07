import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../../db/prisma.js";
import { findPotentialDuplicates } from "../../core/crawlerRunner.js";

const ListingsQuerySchema = z.object({
  source: z.string().optional(),
  city: z.string().optional(),
  minPrice: z.coerce.number().optional(),
  maxPrice: z.coerce.number().optional(),
  minArea: z.coerce.number().optional(),
  maxArea: z.coerce.number().optional(),
  rooms: z.coerce.number().int().optional(),
  status: z.enum(["active", "inactive"]).optional(),
  updatedSince: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export async function listingsRoutes(app: FastifyInstance): Promise<void> {
  // GET /listings
  app.get<{ Querystring: Record<string, string> }>("/listings", async (req, reply) => {
    const q = ListingsQuerySchema.safeParse(req.query);
    if (!q.success) {
      return reply.status(400).send({ error: "Validation error", details: q.error.format() });
    }

    const {
      source, city, minPrice, maxPrice, minArea, maxArea,
      rooms, status, updatedSince, page, limit,
    } = q.data;

    const where = {
      ...(source && { source }),
      ...(city && { city: { contains: city, mode: "insensitive" as const } }),
      ...(minPrice != null && { price: { gte: minPrice } }),
      ...(maxPrice != null && { price: { ...(minPrice != null ? { gte: minPrice } : {}), lte: maxPrice } }),
      ...(minArea != null && { areaM2: { gte: minArea } }),
      ...(maxArea != null && { areaM2: { ...(minArea != null ? { gte: minArea } : {}), lte: maxArea } }),
      ...(rooms != null && { rooms }),
      ...(status && { status }),
      ...(updatedSince && { updatedAt: { gte: new Date(updatedSince) } }),
    };

    const skip = (page - 1) * limit;

    const [listings, total] = await Promise.all([
      db.listing.findMany({
        where,
        orderBy: { lastSeenAt: "desc" },
        skip,
        take: limit,
        select: {
          id: true, source: true, canonicalUrl: true, status: true,
          title: true, price: true, currency: true, rooms: true,
          areaM2: true, city: true, neighborhood: true, thumbnailUrl: true,
          firstSeenAt: true, lastSeenAt: true, lastChangedAt: true,
        },
      }),
      db.listing.count({ where }),
    ]);

    return reply.send({
      data: listings,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  });

  // GET /listings/:id
  app.get<{ Params: { id: string } }>("/listings/:id", async (req, reply) => {
    const listing = await db.listing.findUnique({ where: { id: req.params.id } });
    if (!listing) return reply.status(404).send({ error: "Not found" });
    return reply.send(listing);
  });

  // GET /listings/:id/events
  app.get<{ Params: { id: string }; Querystring: { limit?: string } }>(
    "/listings/:id/events",
    async (req, reply) => {
      const exists = await db.listing.findUnique({
        where: { id: req.params.id },
        select: { id: true },
      });
      if (!exists) return reply.status(404).send({ error: "Not found" });

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
    const exists = await db.listing.findUnique({
      where: { id: req.params.id },
      select: { id: true },
    });
    if (!exists) return reply.status(404).send({ error: "Not found" });

    const duplicates = await findPotentialDuplicates(req.params.id);
    return reply.send(duplicates);
  });

  // PATCH /listings/:id/state  (update user state on match)
  app.patch<{
    Params: { id: string };
    Body: { searchId: string; userState: string };
  }>("/listings/:id/state", async (req, reply) => {
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
}
