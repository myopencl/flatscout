import type { FastifyInstance } from "fastify";
import { db } from "../../db/prisma.js";

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/health", async (_req, reply) => {
    try {
      await db.$queryRaw`SELECT 1`;
      return reply.send({ status: "ok", db: "connected", ts: new Date().toISOString() });
    } catch (err) {
      return reply.status(503).send({
        status: "error",
        db: "disconnected",
        error: err instanceof Error ? err.message : "unknown",
      });
    }
  });
}
