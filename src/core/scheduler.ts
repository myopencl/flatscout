import cron from "node-cron";
import { db } from "../db/prisma.js";
import { logger } from "../utils/logger.js";
import { runCrawlForSearch, refetchIncompleteListings } from "./crawlerRunner.js";

const log = logger.child({ module: "scheduler" });

// Track active jobs by search ID to prevent overlapping runs
const activeJobs = new Map<string, boolean>();

// Prevent overlapping incomplete-listing quality checks
let qualityCheckRunning = false;

/** Start the scheduler. Registers a cron job that runs every minute and
 *  dispatches due saved searches, plus a 6-hour job to re-fetch incomplete listings. */
export function startScheduler(): void {
  log.info("Scheduler starting – checking for due searches every minute");

  cron.schedule("* * * * *", async () => {
    try {
      await dispatchDueSearches();
    } catch (err) {
      log.error({ err }, "Scheduler tick error");
    }
  });

  // Every 6 hours: re-fetch active listings that are missing price or coordinates
  cron.schedule("0 */6 * * *", async () => {
    if (qualityCheckRunning) {
      log.debug("Quality check already running – skipping");
      return;
    }
    qualityCheckRunning = true;
    log.info("Starting periodic quality check for incomplete listings");
    try {
      const count = await refetchIncompleteListings(100);
      log.info({ count }, "Quality check: incomplete listing refetches queued");
    } catch (err) {
      log.error({ err }, "Quality check cron error");
    } finally {
      qualityCheckRunning = false;
    }
  });
}

async function dispatchDueSearches(): Promise<void> {
  const now = new Date();

  const searches = await db.savedSearch.findMany({
    where: { enabled: true },
  });

  for (const search of searches) {
    if (activeJobs.get(search.id)) {
      log.debug({ searchId: search.id }, "Search is already running – skipping");
      continue;
    }

    const isDue = isSearchDue(search.lastRunAt, search.frequencyMinutes, now);
    if (!isDue) continue;

    log.info(
      { searchId: search.id, portal: search.portal, name: search.name },
      "Dispatching search"
    );

    activeJobs.set(search.id, true);

    // Fire-and-forget so the scheduler tick doesn't block
    runCrawlForSearch(search)
      .then((result) => {
        log.info(result, "Search run finished");
      })
      .catch((err) => {
        log.error({ err, searchId: search.id }, "Search run threw unexpectedly");
      })
      .finally(() => {
        activeJobs.delete(search.id);
      });
  }
}

function isSearchDue(
  lastRunAt: Date | null,
  frequencyMinutes: number,
  now: Date
): boolean {
  if (!lastRunAt) return true; // Never run before
  const elapsed = (now.getTime() - lastRunAt.getTime()) / 60_000;
  return elapsed >= frequencyMinutes;
}
