/**
 * URL canonicalization utilities.
 *
 * Rules per portal:
 *  - OLX:   m.olx.pl → www.olx.pl
 *  - domy:  strip ps[page] and other search-only params from detail URLs
 *  - All:   strip tracking/UTM params, remove fragments, lowercase host
 */

// Params that carry no identifying information and should be stripped
const STRIP_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "fbclid",
  "gclid",
  "ref",
  "source",
  "from",
  "pk_source",
  "pk_medium",
  "pk_campaign",
]);

// OLX host normalization
const OLX_HOST_MAP: Record<string, string> = {
  "m.olx.pl": "www.olx.pl",
};

export function canonicalizeUrl(source: string, rawUrl: string): string {
  let url: URL;

  try {
    url = new URL(rawUrl);
  } catch {
    // If relative URL, we can't canonicalize – return as-is
    return rawUrl;
  }

  // 1. Lowercase the host
  url.hostname = url.hostname.toLowerCase();

  // 2. Portal-specific host normalization
  if (source === "olx") {
    const mapped = OLX_HOST_MAP[url.hostname];
    if (mapped) url.hostname = mapped;
  }

  // domy.pl: strip search/pagination params from detail page URLs
  if (source === "domy") {
    // Remove params that are only relevant to search results pages
    for (const key of [...url.searchParams.keys()]) {
      if (key.startsWith("ps[") || key === "page" || key === "sort") {
        url.searchParams.delete(key);
      }
    }
  }

  // 3. Remove fragment
  url.hash = "";

  // 4. Strip known tracking params
  for (const key of STRIP_PARAMS) {
    url.searchParams.delete(key);
  }

  // 5. Remove trailing slash on path (unless root)
  if (url.pathname !== "/" && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.slice(0, -1);
  }

  // 6. Enforce https
  url.protocol = "https:";

  return url.toString();
}

/**
 * Build a consistent SHA-256-based short hash for a canonical URL.
 * Used as url_hash in the DB for O(1) lookups.
 */
import { createHash } from "crypto";

export function hashUrl(canonicalUrl: string): string {
  return createHash("sha256").update(canonicalUrl).digest("hex");
}
