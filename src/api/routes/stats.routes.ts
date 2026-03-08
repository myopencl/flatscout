import type { FastifyInstance } from "fastify";
import { db } from "../../db/prisma.js";

const LISTING_STATUSES = ["FOUND", "SEEN", "VISIT_PENDING", "VISITED", "FINALIST", "DISCARDED"] as const;

export async function statsRoutes(app: FastifyInstance): Promise<void> {

  // GET /stats/listings-by-status - Count listings per status
  app.get("/stats/listings-by-status", async (_req, reply) => {
    const counts: Record<string, number> = {};

    for (const status of LISTING_STATUSES) {
      counts[status] = await db.listing.count({
        where: { userState: { status } },
      });
    }

    // Also count listings with no state record (implicitly FOUND)
    counts["NO_STATE"] = await db.listing.count({
      where: { userState: null },
    });

    const total = Object.values(counts).reduce((a, b) => a + b, 0);

    return reply.send({ total, byStatus: counts });
  });

  // GET /stats/searches-summary - One row per search with listing counts
  app.get("/stats/searches-summary", async (_req, reply) => {
    const searches = await db.savedSearch.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { matches: true } },
        runLogs: {
          orderBy: { startedAt: "desc" },
          take: 1,
          select: {
            startedAt: true, success: true,
            discoveredCount: true, newCount: true, durationMs: true,
          },
        },
      },
    });

    // For each search, count listings by status
    const summaries = await Promise.all(
      searches.map(async (search) => {
        const statusCounts: Record<string, number> = {};
        for (const status of LISTING_STATUSES) {
          statusCounts[status] = await db.searchListingMatch.count({
            where: {
              searchId: search.id,
              listing: { userState: { status } },
            },
          });
        }

        return {
          id: search.id,
          name: search.name,
          portal: search.portal,
          enabled: search.enabled,
          frequencyMinutes: search.frequencyMinutes,
          totalListings: search._count.matches,
          byStatus: statusCounts,
          lastRun: search.runLogs[0] ?? null,
          createdAt: search.createdAt,
          updatedAt: search.updatedAt,
        };
      })
    );

    return reply.send(summaries);
  });

  // GET /stats/activity-timeline - New / status changes over time
  app.get<{ Querystring: { days?: string } }>("/stats/activity-timeline", async (req, reply) => {
    const days = Math.min(90, Math.max(1, parseInt(req.query.days ?? "30", 10)));
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Count events grouped by day and type
    const events = await db.listingEvent.findMany({
      where: { createdAt: { gte: since } },
      select: { eventType: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });

    // Group by date (YYYY-MM-DD) and event type
    const byDay: Record<string, Record<string, number>> = {};
    for (const event of events) {
      const day = event.createdAt.toISOString().slice(0, 10);
      if (!byDay[day]) byDay[day] = {};
      byDay[day][event.eventType] = (byDay[day][event.eventType] ?? 0) + 1;
    }

    // Count state changes per day from ListingUserState updatedAt
    const stateChanges = await db.listingUserState.findMany({
      where: { updatedAt: { gte: since } },
      select: { status: true, updatedAt: true },
      orderBy: { updatedAt: "asc" },
    });

    const stateByDay: Record<string, Record<string, number>> = {};
    for (const change of stateChanges) {
      const day = change.updatedAt.toISOString().slice(0, 10);
      if (!stateByDay[day]) stateByDay[day] = {};
      const key = `state_${change.status}`;
      stateByDay[day][key] = (stateByDay[day][key] ?? 0) + 1;
    }

    // Merge into single timeline
    const allDays = new Set([...Object.keys(byDay), ...Object.keys(stateByDay)]);
    const timeline = Array.from(allDays)
      .sort()
      .map((day) => ({
        date: day,
        events: byDay[day] ?? {},
        stateChanges: stateByDay[day] ?? {},
      }));

    return reply.send({ days, since, timeline });
  });

  // GET /stats/overview - Quick summary of everything
  app.get("/stats/overview", async (_req, reply) => {
    const [
      totalListings,
      activeListings,
      totalSearches,
      enabledSearches,
    ] = await Promise.all([
      db.listing.count(),
      db.listing.count({ where: { status: "active" } }),
      db.savedSearch.count(),
      db.savedSearch.count({ where: { enabled: true } }),
    ]);

    const statusCounts: Record<string, number> = {};
    for (const status of LISTING_STATUSES) {
      statusCounts[status] = await db.listing.count({
        where: { userState: { status } },
      });
    }

    const finalists = statusCounts["FINALIST"] ?? 0;
    const visitPending = statusCounts["VISIT_PENDING"] ?? 0;
    const recentEvents = await db.listingEvent.count({
      where: { createdAt: { gte: new Date(Date.now() - 24 * 3600 * 1000) } },
    });

    return reply.send({
      listings: {
        total: totalListings,
        active: activeListings,
        byStatus: statusCounts,
        finalists,
        visitsPending: visitPending,
      },
      searches: {
        total: totalSearches,
        enabled: enabledSearches,
      },
      activity: {
        eventsLast24h: recentEvents,
      },
    });
  });
}
