import pino from "pino";

const isPretty =
  process.env["LOG_PRETTY"] === "true" ||
  (process.env["NODE_ENV"] !== "production" && process.env["LOG_PRETTY"] !== "false");

export const logger = pino(
  {
    level: process.env["LOG_LEVEL"] ?? "info",
    base: { pid: process.pid },
    timestamp: pino.stdTimeFunctions.isoTime,
  },
  isPretty
    ? pino.transport({ target: "pino-pretty", options: { colorize: true } })
    : undefined
);

export type Logger = typeof logger;
