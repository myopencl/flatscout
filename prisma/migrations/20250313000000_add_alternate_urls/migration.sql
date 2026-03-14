-- Migration: add alternate_urls column for cross-portal deduplication
-- and index on fingerprint for duplicate detection performance

ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "alternate_urls" JSONB;

-- Index on fingerprint to speed up duplicate lookups
CREATE INDEX IF NOT EXISTS "idx_listings_fingerprint" ON "listings" ("fingerprint");
