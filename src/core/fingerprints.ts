import { createHash } from "crypto";
import type { ListingDetails } from "../types/index.js";

/**
 * Compute a deterministic fingerprint for a listing.
 *
 * The fingerprint is based on the fields most likely to identify a unique
 * physical property regardless of portal, and is stable across minor edits
 * (e.g. description spelling fixes). It is NOT the same as canonical URL hash.
 *
 * Used for:
 *  - Detecting cross-portal duplicates (same apartment on OLX and Immohouse)
 *  - Detecting meaningful updates (changed price, area, etc.)
 */
export function computeFingerprint(details: Partial<ListingDetails>): string {
  const parts: string[] = [
    normalizePrice(details.price),
    normalizeArea(details.areaM2),
    String(details.rooms ?? ""),
    normalizeText(details.city),
    normalizeText(details.neighborhood),
    normalizeText(details.agencyName),
    normalizeText(details.addressText),
    normalizeText(firstSentence(details.description)),
  ];

  const raw = parts.join("|");
  return createHash("sha256").update(raw).digest("hex");
}

function normalizePrice(price?: number | null): string {
  if (price == null) return "";
  // Round to nearest 5000 PLN to tolerate minor price edits
  return String(Math.round(price / 5_000) * 5_000);
}

function normalizeArea(area?: number | null): string {
  if (area == null) return "";
  // Round to 1 decimal
  return area.toFixed(1);
}

function normalizeText(text?: string | null): string {
  if (!text) return "";
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics
    .replace(/[^\w\s]/g, "")         // keep only alphanumeric + space
    .replace(/\s+/g, " ")
    .trim();
}

function firstSentence(text?: string | null): string {
  if (!text) return "";
  const m = text.match(/^[^.!?]{0,120}/);
  return m ? m[0]! : "";
}
