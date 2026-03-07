import { fetch, type RequestInit } from "undici";

const DEFAULT_TIMEOUT_MS = Number(process.env["REQUEST_TIMEOUT_MS"] ?? 20_000);

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
];

let uaIndex = 0;

export function getNextUserAgent(): string {
  const custom = process.env["USER_AGENT"];
  if (custom) return custom;
  const ua = USER_AGENTS[uaIndex % USER_AGENTS.length]!;
  uaIndex++;
  return ua;
}

export interface FetchHtmlOptions {
  timeoutMs?: number;
  headers?: Record<string, string>;
  /** Follow redirects and return final URL */
  followRedirects?: boolean;
}

export interface FetchHtmlResult {
  html: string;
  finalUrl: string;
  status: number;
  ok: boolean;
}

/**
 * Fetch a URL and return HTML text.
 * Throws on network error; returns non-2xx status codes without throwing.
 */
export async function fetchHtml(
  url: string,
  options: FetchHtmlOptions = {}
): Promise<FetchHtmlResult> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, headers = {}, followRedirects = true } = options;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const init: RequestInit = {
      headers: {
        "User-Agent": getNextUserAgent(),
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "pl-PL,pl;q=0.9,en-US;q=0.8,en;q=0.7",
        "Accept-Encoding": "gzip, deflate, br",
        ...headers,
      },
      signal: controller.signal,
      redirect: followRedirects ? "follow" : "manual",
    };

    const res = await fetch(url, init);
    const html = await res.text();

    return {
      html,
      finalUrl: res.url || url,
      status: res.status,
      ok: res.ok,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Simple rate-limiter – enforces a minimum delay between sequential calls.
 * Each portal should hold its own instance.
 */
export class RateLimiter {
  private lastCallAt = 0;
  constructor(private readonly delayMs: number) {}

  async wait(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastCallAt;
    if (elapsed < this.delayMs) {
      await sleep(this.delayMs - elapsed);
    }
    this.lastCallAt = Date.now();
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
