import { logger } from "./utils/logger.js";
import { startServer } from "./api/server.js";
import { startScheduler } from "./core/scheduler.js";
import { db, disconnectPrisma } from "./db/prisma.js";

async function main() {
  logger.info("poznan-scraper starting up");

  // Verify DB connection
  try {
    await db.$queryRaw`SELECT 1`;
    logger.info("Database connection established");
  } catch (err) {
    logger.fatal({ err }, "Cannot connect to database – aborting");
    process.exit(1);
  }

  // Start API server
  await startServer();

  // Start scheduler
  startScheduler();

  logger.info("All services started");
}

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

let isShuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info({ signal }, "Shutting down gracefully");

  try {
    await disconnectPrisma();
    logger.info("Database disconnected");
  } catch (err) {
    logger.error({ err }, "Error during shutdown");
  }

  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("uncaughtException", (err) => {
  logger.fatal({ err }, "Uncaught exception");
  shutdown("uncaughtException").catch(() => process.exit(1));
});
process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "Unhandled promise rejection");
});

main().catch((err) => {
  logger.fatal({ err }, "Fatal startup error");
  process.exit(1);
});
