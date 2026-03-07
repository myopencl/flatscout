import { PrismaClient } from "@prisma/client";
import { logger } from "../utils/logger.js";

// Singleton pattern – safe in Node.js processes and avoids connection pool exhaustion
let _client: PrismaClient | undefined;

export function getPrismaClient(): PrismaClient {
  if (!_client) {
    _client = new PrismaClient({
      log: [
        { level: "query", emit: "event" },
        { level: "warn", emit: "stdout" },
        { level: "error", emit: "stdout" },
      ],
    });

    if (process.env["LOG_LEVEL"] === "debug" || process.env["LOG_LEVEL"] === "trace") {
      _client.$on("query" as never, (e: { query: string; duration: number }) => {
        logger.debug({ query: e.query, durationMs: e.duration }, "Prisma query");
      });
    }
  }
  return _client;
}

export async function disconnectPrisma(): Promise<void> {
  if (_client) {
    await _client.$disconnect();
    _client = undefined;
  }
}

// Convenience re-export so callers can do: import { db } from '../db/prisma'
export const db = getPrismaClient();
