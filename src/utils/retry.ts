import { sleep } from "./http.js";
import { logger } from "./logger.js";

export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Return true to abort retrying early (e.g. 404 is permanent, no point retrying) */
  shouldAbort?: (error: unknown) => boolean;
}

/**
 * Execute `fn` with exponential back-off retries.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxAttempts = Number(process.env["MAX_RETRIES"] ?? 3),
    baseDelayMs = 1_000,
    maxDelayMs = 30_000,
    shouldAbort,
  } = options;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      if (shouldAbort?.(err)) {
        throw err;
      }

      if (attempt === maxAttempts) break;

      const delay = Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs);
      logger.warn({ attempt, maxAttempts, delayMs: delay, err }, "Retrying after error");
      await sleep(delay);
    }
  }

  throw lastError;
}

/** Abort retrying on permanent HTTP errors. */
export function isPermamentHttpError(err: unknown): boolean {
  if (err instanceof HttpError) {
    return err.status === 404 || err.status === 410 || err.status === 403;
  }
  return false;
}

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly url: string,
    message?: string
  ) {
    super(message ?? `HTTP ${status} for ${url}`);
    this.name = "HttpError";
  }
}
