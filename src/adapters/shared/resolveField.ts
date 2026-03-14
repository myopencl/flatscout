import { logger } from "../../utils/logger.js";

export type Extractor<T> = (raw: unknown) => T | null | undefined;

/**
 * Try each extractor in order; return the first non-null/non-NaN result.
 * Logs a warn if a fallback (index > 0) was used, so we know when a portal
 * has changed its API structure and the primary path broke.
 */
export function resolveField<T>(
  raw: unknown,
  extractors: Extractor<T>[],
  fieldName: string
): T | undefined {
  for (let i = 0; i < extractors.length; i++) {
    try {
      const v = extractors[i](raw);
      if (v != null && v !== "" && !(typeof v === "number" && isNaN(v))) {
        if (i > 0) {
          logger.warn(
            { fieldName, fallbackIndex: i },
            "Field parsed from fallback extractor — primary path returned empty"
          );
        }
        return v as T;
      }
    } catch {
      // skip broken extractors silently
    }
  }
  return undefined;
}
