import type { Listing } from "@prisma/client";
import type { ListingDetails, ChangeResult, EventType } from "../types/index.js";

/**
 * Compare an incoming ListingDetails against the persisted Listing row and
 * determine what (if anything) changed.
 *
 * Returns a ChangeResult with:
 *  - hasChanged:  true if any meaningful field changed
 *  - events:      list of EventType values to emit
 *  - oldValues:   snapshot of changed fields before update
 *  - newValues:   snapshot of changed fields after update
 */
export function compareListings(
  existing: Listing,
  incoming: ListingDetails
): ChangeResult {
  const events: EventType[] = [];
  const oldValues: Record<string, unknown> = {};
  const newValues: Record<string, unknown> = {};

  // --- Price ---
  if (incoming.price != null && existing.price != null && incoming.price !== existing.price) {
    const eventType: EventType = incoming.price < existing.price ? "price_down" : "price_up";
    events.push(eventType);
    oldValues["price"] = existing.price;
    newValues["price"] = incoming.price;
  }

  // --- Reactivation ---
  if (existing.status === "inactive" && incoming.status === "active") {
    events.push("reactivated");
    oldValues["status"] = "inactive";
    newValues["status"] = "active";
  }

  // --- Inactivation ---
  if (existing.status === "active" && incoming.status === "inactive") {
    events.push("inactive");
    oldValues["status"] = "active";
    newValues["status"] = "inactive";
  }

  // --- Other meaningful fields ---
  const fieldsToCompare: Array<keyof ListingDetails & keyof Listing> = [
    "title",
    "rooms",
    "areaM2",
    "city",
    "neighborhood",
    "agencyName",
    "advertiserType",
    "addressText",
  ];

  for (const field of fieldsToCompare) {
    const existingVal = (existing as any)[field];
    const incomingVal = (incoming as any)[field];
    if (
      incomingVal != null &&
      existingVal != null &&
      String(incomingVal) !== String(existingVal)
    ) {
      oldValues[field] = existingVal;
      newValues[field] = incomingVal;
    }
  }

  // --- Photos (detect main photo swap) ---
  const existingPhotos: string[] = (existing.photosJson as string[]) ?? [];
  const incomingPhotos = incoming.photos ?? [];
  if (
    incomingPhotos.length > 0 &&
    existingPhotos.length > 0 &&
    incomingPhotos[0] !== existingPhotos[0]
  ) {
    oldValues["photos[0]"] = existingPhotos[0];
    newValues["photos[0]"] = incomingPhotos[0];
  }

  const hasNonStatusChange = Object.keys(oldValues).some(
    (k) => k !== "status"
  );

  if (
    hasNonStatusChange &&
    !events.includes("price_down") &&
    !events.includes("price_up") &&
    !events.includes("reactivated") &&
    !events.includes("inactive")
  ) {
    events.push("updated");
  }

  return {
    hasChanged: events.length > 0,
    events,
    oldValues,
    newValues,
  };
}
