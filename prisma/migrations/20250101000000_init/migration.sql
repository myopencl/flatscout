-- CreateEnum
CREATE TYPE "ListingStatus" AS ENUM ('FOUND', 'SEEN', 'VISIT_PENDING', 'VISITED', 'FINALIST', 'DISCARDED');

-- CreateTable
CREATE TABLE "saved_searches" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "portal" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "frequency_minutes" INTEGER NOT NULL DEFAULT 60,
    "filters_json" JSONB NOT NULL,
    "search_url" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "last_run_at" TIMESTAMP(3),
    "last_success_at" TIMESTAMP(3),
    "last_error" TEXT,

    CONSTRAINT "saved_searches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listings" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "external_id" TEXT,
    "canonical_url" TEXT NOT NULL,
    "url_hash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "title" TEXT,
    "description" TEXT,
    "price" INTEGER,
    "currency" TEXT DEFAULT 'PLN',
    "rooms" INTEGER,
    "bathrooms" INTEGER,
    "area_m2" DOUBLE PRECISION,
    "floor" TEXT,
    "neighborhood" TEXT,
    "city" TEXT,
    "region" TEXT,
    "address_text" TEXT,
    "lat" DOUBLE PRECISION,
    "lon" DOUBLE PRECISION,
    "agency_name" TEXT,
    "advertiser_type" TEXT,
    "thumbnail_url" TEXT,
    "photos_json" JSONB,
    "features_json" JSONB,
    "raw_summary_json" JSONB,
    "raw_details_json" JSONB,
    "fingerprint" TEXT,
    "published_at_text" TEXT,
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_checked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_changed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "listings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "search_listing_matches" (
    "id" TEXT NOT NULL,
    "search_id" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,
    "first_matched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_matched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "current_match_score" DOUBLE PRECISION,
    "user_state" TEXT NOT NULL DEFAULT 'new',

    CONSTRAINT "search_listing_matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listing_events" (
    "id" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "old_value_json" JSONB,
    "new_value_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listing_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scrape_run_logs" (
    "id" TEXT NOT NULL,
    "search_id" TEXT NOT NULL,
    "portal" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "duration_ms" INTEGER,
    "success" BOOLEAN,
    "discovered_count" INTEGER,
    "new_count" INTEGER,
    "updated_count" INTEGER,
    "inactive_count" INTEGER,
    "error_message" TEXT,

    CONSTRAINT "scrape_run_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listing_user_states" (
    "id" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,
    "status" "ListingStatus" NOT NULL DEFAULT 'FOUND',
    "comments" TEXT,
    "visit_date" TIMESTAMP(3),
    "pros_json" JSONB,
    "cons_json" JSONB,
    "rating" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "listing_user_states_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "listings_canonical_url_key" ON "listings"("canonical_url");

-- CreateIndex
CREATE UNIQUE INDEX "listings_url_hash_key" ON "listings"("url_hash");

-- CreateIndex
CREATE INDEX "idx_listings_source_external_id" ON "listings"("source", "external_id");

-- CreateIndex
CREATE INDEX "listings_status_idx" ON "listings"("status");

-- CreateIndex
CREATE INDEX "listings_price_idx" ON "listings"("price");

-- CreateIndex
CREATE INDEX "listings_city_idx" ON "listings"("city");

-- CreateIndex
CREATE INDEX "listings_last_seen_at_idx" ON "listings"("last_seen_at");

-- CreateIndex
CREATE INDEX "listings_updated_at_idx" ON "listings"("updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "search_listing_matches_search_id_listing_id_key" ON "search_listing_matches"("search_id", "listing_id");

-- CreateIndex
CREATE INDEX "search_listing_matches_user_state_idx" ON "search_listing_matches"("user_state");

-- CreateIndex
CREATE INDEX "listing_events_listing_id_created_at_idx" ON "listing_events"("listing_id", "created_at");

-- CreateIndex
CREATE INDEX "listing_events_event_type_idx" ON "listing_events"("event_type");

-- CreateIndex
CREATE INDEX "scrape_run_logs_search_id_started_at_idx" ON "scrape_run_logs"("search_id", "started_at");

-- CreateIndex
CREATE UNIQUE INDEX "listing_user_states_listing_id_key" ON "listing_user_states"("listing_id");

-- CreateIndex
CREATE INDEX "listing_user_states_status_idx" ON "listing_user_states"("status");

-- CreateIndex
CREATE INDEX "listing_user_states_created_at_idx" ON "listing_user_states"("created_at");

-- CreateIndex
CREATE INDEX "listing_user_states_updated_at_idx" ON "listing_user_states"("updated_at");

-- AddForeignKey
ALTER TABLE "search_listing_matches" ADD CONSTRAINT "search_listing_matches_search_id_fkey" FOREIGN KEY ("search_id") REFERENCES "saved_searches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "search_listing_matches" ADD CONSTRAINT "search_listing_matches_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_events" ADD CONSTRAINT "listing_events_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scrape_run_logs" ADD CONSTRAINT "scrape_run_logs_search_id_fkey" FOREIGN KEY ("search_id") REFERENCES "saved_searches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_user_states" ADD CONSTRAINT "listing_user_states_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
