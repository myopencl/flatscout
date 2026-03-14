-- AddColumn: is_favorite to listing_user_states
ALTER TABLE "listing_user_states" ADD COLUMN "is_favorite" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "listing_user_states_is_favorite_idx" ON "listing_user_states"("is_favorite");
