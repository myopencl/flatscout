import Fastify from "fastify";
import cors from "@fastify/cors";
import { logger } from "../utils/logger.js";
import { healthRoutes } from "./routes/health.routes.js";
import { savedSearchRoutes } from "./routes/savedSearches.routes.js";
import { listingsRoutes } from "./routes/listings.routes.js";

const PORT = Number(process.env["PORT"] ?? 3000);
const HOST = process.env["HOST"] ?? "0.0.0.0";

export async function buildServer() {
  const app = Fastify({
    logger: false, // We use pino directly
    trustProxy: true,
  });

  await app.register(cors, {
    origin: process.env["CORS_ORIGIN"] ?? "*",
  });

  // Request logging middleware
  app.addHook("onRequest", (req, _reply, done) => {
    logger.debug({ method: req.method, url: req.url }, "Incoming request");
    done();
  });

  app.addHook("onResponse", (req, reply, done) => {
    logger.info(
      { method: req.method, url: req.url, status: reply.statusCode },
      "Request complete"
    );
    done();
  });

  // Error handler
  app.setErrorHandler((error: any, _req, reply) => {
    logger.error({ err: error }, "Unhandled request error");
    reply.status(error?.statusCode ?? 500).send({
      error: error?.message ?? "Internal server error",
    });
  });

  // Register routes
  await app.register(healthRoutes);
  await app.register(savedSearchRoutes, { prefix: "/api/v1" });
  await app.register(listingsRoutes, { prefix: "/api/v1" });

  return app;
}

export async function startServer(): Promise<void> {
  const app = await buildServer();
  await app.listen({ port: PORT, host: HOST });
  logger.info({ port: PORT, host: HOST }, "API server listening");
}
