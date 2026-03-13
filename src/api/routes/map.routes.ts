import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../../db/prisma.js";

// ---------------------------------------------------------------------------
// Normalised shape returned to the map application
// ---------------------------------------------------------------------------

interface MapListing {
  id: string;
  portal: string;
  url: string;
  alternate_urls: string[];
  title: string | null;
  price: number | null;
  address: string | null;
  coordinates: { lat: number; lon: number } | null;
  nr_rooms: number | null;
  size_m2: number | null;
  floor: string | null;
  monthly_expenses: number | null;
  score: number | null;
  status: string;
  date_published: string | null;
  date_seen: string;
  user: {
    workflow_status: string;
    rating: number | null;
    pros: string[] | null;
    cons: string[] | null;
    comments: string | null;
    visit_date: string | null;
  };
}

// ---------------------------------------------------------------------------
// Query schema
// ---------------------------------------------------------------------------

const MapQuerySchema = z.object({
  searchId:    z.string().uuid().optional(),
  portal:      z.string().optional(),
  city:        z.string().optional(),
  minPrice:    z.coerce.number().optional(),
  maxPrice:    z.coerce.number().optional(),
  minArea:     z.coerce.number().optional(),
  maxArea:     z.coerce.number().optional(),
  rooms:       z.coerce.number().int().optional(),
  status:      z.enum(["active", "inactive"]).optional(),
  userStatus:  z.enum(["FOUND", "SEEN", "VISIT_PENDING", "VISITED", "FINALIST", "DISCARDED"]).optional(),
  hasCoords:   z.enum(["true", "false"]).optional(),
  minScore:    z.coerce.number().min(0).max(1).optional(),
  page:        z.coerce.number().int().min(1).default(1),
  limit:       z.coerce.number().int().min(1).max(500).default(100),
  sortBy:      z.enum(["date_seen", "price", "size_m2", "score", "date_published"]).default("date_seen"),
  sortDir:     z.enum(["asc", "desc"]).default("desc"),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract monthly expenses from the features JSON array if present */
function extractMonthlyExpenses(features: unknown): number | null {
  if (!Array.isArray(features)) return null;
  for (const f of features as string[]) {
    // Look for patterns like "Czynsz: 500 zł" or "Opłaty: 800 zł"
    const m = String(f).match(/(?:czynsz|oplaty|opłaty|czynsz administracyjny)[:\s]+(\d[\d\s]*)\s*z[łl]/i);
    if (m) return parseInt(m[1]!.replace(/\s/g, ""), 10);
  }
  return null;
}

/** Map a DB row + optional score to the normalised MapListing shape */
function toMapListing(
  row: any,
  score: number | null
): MapListing {
  return {
    id:               row.id,
    portal:           row.source,
    url:              row.canonicalUrl,
    alternate_urls:   Array.isArray(row.alternateUrls) ? row.alternateUrls : [],
    title:            row.title ?? null,
    price:            row.price ?? null,
    address:          row.addressText ?? row.neighborhood ?? null,
    coordinates:
      row.lat != null && row.lon != null
        ? { lat: row.lat, lon: row.lon }
        : null,
    nr_rooms:         row.rooms ?? null,
    size_m2:          row.areaM2 ?? null,
    floor:            row.floor ?? null,
    monthly_expenses: extractMonthlyExpenses(row.featuresJson),
    score:            score,
    status:           row.status,
    date_published:   row.publishedAtText ?? null,
    date_seen:        row.lastSeenAt.toISOString(),
    user: {
      workflow_status: row.userState?.status ?? "FOUND",
      rating:          row.userState?.rating ?? null,
      pros:            (row.userState?.prosJson as string[] | null) ?? null,
      cons:            (row.userState?.consJson as string[] | null) ?? null,
      comments:        row.userState?.comments ?? null,
      visit_date:      row.userState?.visitDate?.toISOString() ?? null,
    },
  };
}

// ---------------------------------------------------------------------------
// DB sort field mapping
// ---------------------------------------------------------------------------

const SORT_MAP: Record<string, string> = {
  date_seen:       "lastSeenAt",
  price:           "price",
  size_m2:         "areaM2",
  score:           "lastSeenAt", // score sort handled in-memory (see below)
  date_published:  "lastSeenAt", // publishedAtText is a string; fall back to lastSeenAt
};

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export async function mapRoutes(app: FastifyInstance): Promise<void> {

  /**
   * GET /api/v1/map/listings
   *
   * Returns a paginated list of listings in the normalised map format.
   * All filters are optional; without filters returns all active listings.
   */
  app.get<{ Querystring: Record<string, string> }>("/map/listings", async (req, reply) => {
    const q = MapQuerySchema.safeParse(req.query);
    if (!q.success) {
      return reply.status(400).send({ error: "Validation error", details: q.error.format() });
    }

    const {
      searchId, portal, city, minPrice, maxPrice,
      minArea, maxArea, rooms, status, userStatus,
      hasCoords, minScore, page, limit, sortBy, sortDir,
    } = q.data;

    const skip = (page - 1) * limit;

    // --- Where clause ---
    const where: any = {};
    if (portal)    where.source = portal;
    if (city)      where.city = { contains: city, mode: "insensitive" };
    if (status)    where.status = status;
    if (rooms)     where.rooms = rooms;

    if (minPrice != null || maxPrice != null) {
      where.price = {};
      if (minPrice != null) where.price.gte = minPrice;
      if (maxPrice != null) where.price.lte = maxPrice;
    }
    if (minArea != null || maxArea != null) {
      where.areaM2 = {};
      if (minArea != null) where.areaM2.gte = minArea;
      if (maxArea != null) where.areaM2.lte = maxArea;
    }
    if (hasCoords === "true")  { where.lat = { not: null }; }
    if (hasCoords === "false") { where.lat = null; }
    if (userStatus) { where.userState = { status: userStatus }; }

    // Score filter requires a join with search_listing_matches
    if (searchId) {
      where.matches = {
        some: {
          searchId,
          ...(minScore != null ? { currentMatchScore: { gte: minScore } } : {}),
        },
      };
    }

    // --- Fetch listings ---
    const dbSortField = SORT_MAP[sortBy] ?? "lastSeenAt";

    const [rows, total] = await Promise.all([
      db.listing.findMany({
        where,
        include: {
          userState: true,
          ...(searchId
            ? { matches: { where: { searchId }, select: { currentMatchScore: true } } }
            : {}),
        },
        orderBy: { [dbSortField]: sortDir },
        skip,
        take: limit,
      }),
      db.listing.count({ where }),
    ]);

    // --- Map to normalised format ---
    let data = rows.map((row: any) => {
      const score =
        searchId && row.matches?.length > 0
          ? (row.matches[0].currentMatchScore ?? null)
          : null;
      return toMapListing(row, score);
    });

    // Sort by score in-memory when requested (DESC = highest first)
    if (sortBy === "score") {
      data = data.sort((a, b) => {
        if (a.score == null && b.score == null) return 0;
        if (a.score == null) return 1;
        if (b.score == null) return -1;
        return sortDir === "desc" ? b.score - a.score : a.score - b.score;
      });
    }

    return reply.send({
      data,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  });

  /**
   * GET /api/v1/map/listings/:id
   *
   * Returns a single listing in the normalised map format.
   * Pass ?searchId=<uuid> to include the match score for that search.
   */
  app.get<{
    Params: { id: string };
    Querystring: { searchId?: string };
  }>("/map/listings/:id", async (req, reply) => {
    const { id } = req.params;
    const { searchId } = req.query;

    const row = await db.listing.findUnique({
      where: { id },
      include: {
        userState: true,
        ...(searchId
          ? { matches: { where: { searchId }, select: { currentMatchScore: true } } }
          : {}),
      },
    }) as any;

    if (!row) return reply.status(404).send({ error: "Listing not found" });

    const score =
      searchId && row.matches?.length > 0
        ? (row.matches[0].currentMatchScore ?? null)
        : null;

    return reply.send(toMapListing(row, score));
  });
}
