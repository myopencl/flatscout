# Poznan Scraper — API Reference

Base URL: `http://<host>:3000/api/v1`

All request bodies must be `Content-Type: application/json`.
All responses are JSON. Errors follow the shape `{ "error": "...", "details": {} }`.

---

## Table of Contents

- [Health](#health)
- [Searches](#searches)
- [Listings](#listings)
- [Map](#map)
- [Stats](#stats)

---

## Health

### `GET /health`

Returns server status. No authentication required.

**Response `200`**
```json
{ "status": "ok", "uptime": 123.4 }
```

---

## Searches

Saved searches define which portal + filters the scraper monitors. The scheduler runs each enabled search at its configured frequency.

### `POST /api/v1/searches`

Create a new saved search.

**Body**
```json
{
  "name": "Poznan 3 rooms under 600k",
  "portal": "otodom",
  "enabled": true,
  "frequencyMinutes": 60,
  "filters": {
    "operation": "buy",
    "propertyType": "flat",
    "city": "Poznan",
    "rooms": 3,
    "priceMax": 600000
  }
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `name` | string | ✓ | 1–200 chars |
| `portal` | string | ✓ | `"otodom"` \| `"olx"` \| `"domy"` \| `"immohouse"` |
| `enabled` | boolean | | Default `true` |
| `frequencyMinutes` | integer | | 5–1440, default `60` |
| `filters.operation` | string | | `"buy"` \| `"rent"`, default `"buy"` |
| `filters.city` | string | | |
| `filters.rooms` | integer | | |
| `filters.priceMin` / `priceMax` | integer | | PLN |
| `filters.areaMin` / `areaMax` | number | | m² |
| `customSearchUrl` | string | | Use a specific search URL instead of building from filters |

**Response `201`** — created search object.

---

### `GET /api/v1/searches`

List all saved searches.

**Query params**

| Param | Type | Notes |
|-------|------|-------|
| `portal` | string | Filter by portal |
| `enabled` | `"true"` \| `"false"` | Filter by enabled state |
| `page` | integer | Default `1` |
| `limit` | integer | Default `50`, max `100` |

**Response `200`**
```json
{
  "data": [ { "id": "...", "name": "...", "portal": "otodom", "enabled": true, ... } ],
  "pagination": { "page": 1, "limit": 50, "total": 3, "pages": 1 }
}
```

---

### `GET /api/v1/searches/:id`

Get one saved search.

**Response `200`** — search object with match and run log counts.

---

### `PATCH /api/v1/searches/:id`

Update a saved search (all fields optional).

**Body** — any subset of `CreateSearch` fields:
```json
{ "enabled": false, "frequencyMinutes": 120 }
```

**Response `200`** — updated search object.

---

### `DELETE /api/v1/searches/:id`

Delete a saved search.

**Query params**

| Param | Notes |
|-------|-------|
| `cascadeListings=true` | Also delete listings that only belong to this search |

**Response `204`** — no content.

---

### `POST /api/v1/searches/:id/duplicate`

Clone a search.

**Body** (optional)
```json
{ "name": "My copy name" }
```

**Response `201`** — new search object.

---

### `POST /api/v1/searches/:id/run-now`

Trigger an immediate crawl for this search (fire-and-forget).

**Response `202`**
```json
{ "message": "Crawl started", "searchId": "..." }
```

---

### `GET /api/v1/searches/:id/listings`

Listings matched by this search, including user state.

**Query params**

| Param | Type | Notes |
|-------|------|-------|
| `listingStatus` | string | `FOUND` \| `SEEN` \| `VISIT_PENDING` \| `VISITED` \| `FINALIST` \| `DISCARDED` |
| `userState` | string | Match-level state: `new` \| `seen` \| `favorite` \| `discarded` \| `contacted` |
| `page` / `limit` | integer | Default `1` / `50` |

**Response `200`**
```json
{
  "data": [
    {
      "id": "...",
      "title": "...",
      "price": 450000,
      "userState": { "status": "SEEN", "isFavorite": false, ... },
      "searchMatch": { "userState": "new", "firstMatchedAt": "...", "lastMatchedAt": "..." }
    }
  ],
  "pagination": { ... }
}
```

---

### `GET /api/v1/searches/:id/stats`

Summary counts for a search.

**Response `200`**
```json
{
  "searchId": "...",
  "totalListings": 42,
  "byListingStatus": { "FOUND": 30, "SEEN": 8, "FINALIST": 4, ... },
  "byMatchState": { "new": 20, "seen": 15, "favorite": 7 },
  "lastRun": { "startedAt": "...", "success": true, "discoveredCount": 55, "newCount": 3, "durationMs": 4200 }
}
```

---

### `GET /api/v1/searches/:id/changes`

Recent listing change events (price changes, new listings, inactive) for this search.

**Query params**

| Param | Notes |
|-------|-------|
| `since` | ISO-8601 datetime. Default: last 24 hours |

**Response `200`** — array of listing events.

---

## Listings

### `GET /api/v1/listings`

Paginated listing browser with filters.

**Query params**

| Param | Type | Notes |
|-------|------|-------|
| `source` | string | `otodom` \| `olx` \| `domy` \| `immohouse` |
| `city` | string | Case-insensitive substring match |
| `minPrice` / `maxPrice` | integer | PLN |
| `minArea` / `maxArea` | number | m² |
| `rooms` | integer | Exact match |
| `status` | string | `"active"` \| `"inactive"` |
| `listingStatus` | string | Workflow status: `FOUND` … `DISCARDED` |
| `favorite` | `"true"` \| `"false"` | Filter by favourite flag |
| `hasComments` | `"true"` \| `"false"` | Filter by whether user left comments |
| `rating` | integer | 1–5 |
| `updatedSince` | ISO-8601 | |
| `sortBy` | string | `lastSeenAt` \| `price` \| `areaM2` \| `createdAt` \| `updatedAt` |
| `sortDir` | string | `asc` \| `desc` |
| `page` / `limit` | integer | Default `1` / `50`, max `100` |

**Response `200`**
```json
{
  "data": [ { "id": "...", "price": 450000, "userState": { "isFavorite": true, ... }, ... } ],
  "pagination": { "page": 1, "limit": 50, "total": 120, "pages": 3 }
}
```

---

### `GET /api/v1/listings/:id`

Get a single listing with its user state.

**Response `200`** — full listing object including `userState`.

---

### `POST /api/v1/listings`

Add a listing manually by URL. Immediately triggers a detail fetch in the background.

**Body**
```json
{ "url": "https://www.otodom.pl/pl/oferta/..." }
```

**Response `201`** — newly created listing (detail fetch may still be running).

---

### `POST /api/v1/listings/import`

Import a listing synchronously — fetches full details before returning.

**Body**
```json
{ "url": "https://www.otodom.pl/pl/oferta/..." }
```

**Response `200`** (already exists)
```json
{ "alreadyExists": true, "listing": { ... } }
```

**Response `201`** (newly imported)
```json
{ "alreadyExists": false, "listing": { ... } }
```

---

### `DELETE /api/v1/listings/:id`

Delete a listing. Only listings with workflow status `FOUND` can be deleted.

**Response `204`** — success.
**Response `403`** — listing is in a protected state (e.g. `SEEN`, `FINALIST`).

---

### `POST /api/v1/listings/bulk-delete`

Delete multiple listings matching criteria. Only `FOUND` listings are removed; if any match is in another state the request is rejected.

**Body** (at least one filter required)
```json
{
  "listingStatus": "FOUND",
  "portal": "olx",
  "priceMax": 300000,
  "daysOld": 90
}
```

**Response `200`**
```json
{ "deletedCount": 12, "skippedCount": 0, "preventedCount": 0 }
```

---

### `POST /api/v1/listings/:id/refetch`

Force re-fetch of a listing's details from its portal (fire-and-forget).

**Response `202`**
```json
{ "message": "Refetch started", "listingId": "..." }
```

---

### `POST /api/v1/listings/refetch-incomplete`

Queue a background re-fetch for all active listings missing price or coordinates.

**Query params**

| Param | Default | Notes |
|-------|---------|-------|
| `limit` | 50 | Max listings to refetch (1–200) |

**Body** — empty `{}`

**Response `202`**
```json
{ "message": "Refetch queued for incomplete listings", "count": 34 }
```

---

### `GET /api/v1/listings/:id/state`

Get (or create) the user state for a listing.

**Response `200`**
```json
{
  "id": "...",
  "listingId": "...",
  "status": "SEEN",
  "isFavorite": true,
  "rating": 4,
  "pros": ["great location"],
  "cons": ["small kitchen"],
  "comments": "Viewed on Saturday, looks good",
  "visitDate": "2025-03-10T10:00:00.000Z",
  "createdAt": "...",
  "updatedAt": "..."
}
```

---

### `PATCH /api/v1/listings/:id/state`

Update any combination of user state fields. All fields are optional; only provided fields are changed.

**Body**
```json
{
  "status": "FINALIST",
  "rating": 5,
  "pros": ["great view", "big balcony"],
  "cons": [],
  "comments": "Negotiated price down to 430k",
  "visitDate": "2025-03-15T14:00:00.000Z"
}
```

| Field | Type | Notes |
|-------|------|-------|
| `status` | string | `FOUND` \| `SEEN` \| `VISIT_PENDING` \| `VISITED` \| `FINALIST` \| `DISCARDED` |
| `rating` | integer | 1–5 |
| `pros` / `cons` | string[] | Up to 20 items, 200 chars each |
| `comments` | string | Up to 5 000 chars |
| `visitDate` | ISO-8601 datetime | |

**Response `200`** — updated user state object.

---

### `PATCH /api/v1/listings/:id/favorite` ⭐

Mark or unmark a listing as a favourite.

**Body**
```json
{ "favorite": true }
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `favorite` | boolean | ✓ | `true` = mark as favourite, `false` = remove |

**Response `200`** — updated user state object, including `"isFavorite": true`.

**Example — mark as favourite**
```bash
curl -X PATCH http://localhost:3000/api/v1/listings/abc123/favorite \
  -H "Content-Type: application/json" \
  -d '{"favorite": true}'
```

**Example — remove from favourites**
```bash
curl -X PATCH http://localhost:3000/api/v1/listings/abc123/favorite \
  -H "Content-Type: application/json" \
  -d '{"favorite": false}'
```

---

### `GET /api/v1/listings/:id/events`

Audit history of changes detected on a listing.

**Query params**

| Param | Notes |
|-------|-------|
| `limit` | Default `50`, max `200` |

**Response `200`** — array of events with `eventType` (`new` \| `updated` \| `price_down` \| `price_up` \| `inactive` \| `reactivated`).

---

### `GET /api/v1/listings/:id/potential-duplicates`

Cross-portal duplicate detection for a listing.

**Response `200`** — array of listings that may be the same property on a different portal.

---

### `PATCH /api/v1/listings/:id/match-state`

Update the per-search match state (e.g. to mark a listing as contacted within a specific search context).

**Body**
```json
{ "searchId": "uuid", "userState": "contacted" }
```

Valid `userState` values: `new` \| `seen` \| `favorite` \| `discarded` \| `contacted`

**Response `200`** — updated match record.

---

### `PATCH /api/v1/listings/:id/score`

Manually override the AI match score for a listing within a specific search.

**Body**
```json
{ "searchId": "uuid", "score": 0.85 }
```

`score` must be between `0.0` and `1.0`.

**Response `200`**
```json
{ "listingId": "...", "searchId": "...", "currentMatchScore": 0.85 }
```

---

## Map

Optimised endpoints returning a normalised `MapListing` shape for map applications. Includes `is_favorite` in the `user` object.

### `MapListing` shape

```json
{
  "id": "uuid",
  "portal": "otodom",
  "url": "https://...",
  "alternate_urls": [],
  "title": "3-room flat in Jeżyce",
  "price": 450000,
  "address": "Jeżyce, Poznań",
  "coordinates": { "lat": 52.41, "lon": 16.90 },
  "nr_rooms": 3,
  "size_m2": 62.5,
  "floor": "3",
  "monthly_expenses": 650,
  "score": 0.87,
  "status": "active",
  "date_published": "2 days ago",
  "date_seen": "2025-03-14T10:00:00.000Z",
  "user": {
    "workflow_status": "SEEN",
    "is_favorite": true,
    "rating": 4,
    "pros": ["great location"],
    "cons": [],
    "comments": null,
    "visit_date": null
  }
}
```

---

### `GET /api/v1/map/listings`

Paginated map listings with filters.

**Query params**

| Param | Type | Notes |
|-------|------|-------|
| `searchId` | UUID | Filter to listings matched by a specific search; also populates `score` |
| `portal` | string | `otodom` \| `olx` \| `domy` \| `immohouse` |
| `city` | string | Case-insensitive substring |
| `minPrice` / `maxPrice` | integer | PLN |
| `minArea` / `maxArea` | number | m² |
| `rooms` | integer | |
| `status` | string | `"active"` \| `"inactive"` |
| `userStatus` | string | Workflow status filter |
| `favorite` | `"true"` \| `"false"` | Filter favourited listings ⭐ |
| `hasCoords` | `"true"` \| `"false"` | Only return listings with/without coordinates |
| `minScore` | number | 0.0–1.0, requires `searchId` |
| `sortBy` | string | `date_seen` \| `price` \| `size_m2` \| `score` \| `date_published` |
| `sortDir` | string | `asc` \| `desc` |
| `page` / `limit` | integer | Default `1` / `100`, max `500` |

**Example — get favourites for a search**
```bash
curl "http://localhost:3000/api/v1/map/listings?searchId=<uuid>&favorite=true"
```

**Response `200`**
```json
{
  "data": [ { ...MapListing }, ... ],
  "pagination": { "page": 1, "limit": 100, "total": 7, "pages": 1 }
}
```

---

### `GET /api/v1/map/listings/:id`

Single listing in map format.

**Query params**

| Param | Notes |
|-------|-------|
| `searchId` | UUID — if provided, populates the `score` field |

**Response `200`** — single `MapListing` object.

---

## Stats

### `GET /api/v1/stats`

Aggregate statistics across all portals.

**Response `200`**
```json
{
  "totals": { "listings": 1240, "active": 980, "inactive": 260 },
  "byPortal": { "otodom": 650, "olx": 320, "domy": 180, "immohouse": 90 },
  "byStatus": { "FOUND": 700, "SEEN": 200, "FINALIST": 40, ... }
}
```

---

## Common Error Responses

| Status | Meaning |
|--------|---------|
| `400` | Validation error — check `details` for field-level messages |
| `404` | Resource not found |
| `409` | Conflict — listing already exists, or bulk delete prevented by state |
| `422` | Unrecognised portal URL |
| `502` | Detail fetch from portal failed |

---

## Workflow Status Reference

User workflow statuses progress through the listing review process:

| Status | Meaning |
|--------|---------|
| `FOUND` | Newly discovered, not yet reviewed |
| `SEEN` | Reviewed the listing online |
| `VISIT_PENDING` | Physical visit scheduled |
| `VISITED` | Visit completed |
| `FINALIST` | Shortlisted — serious candidate |
| `DISCARDED` | Rejected |

The **favourite flag** (`isFavorite`) is independent of workflow status — any listing can be favourited regardless of its current status.
