# Map API Documentation

The Map API provides a **normalised, portal-agnostic interface** to all real estate listings in the scraper database. Use it to:

- Display listings on an interactive map
- Filter listings by price, area, location, and user-defined criteria
- Show combined availability across multiple real estate portals (domy.pl, otodom.pl, olx.pl, immohouse.pl)
- Track user annotations (pros, cons, visit dates, ratings)
- Display relevance scores for saved searches

---

## Overview

### Normalised Listing Format

Every listing is returned in a **standardized JSON shape**, regardless of its source portal:

```json
{
  "id": "uuid-string",
  "portal": "otodom",
  "url": "https://www.otodom.pl/pl/oferta/...",
  "alternate_urls": [
    "https://domy.pl/nieruchomosci/oferta/...",
    "https://olx.pl/oferta/..."
  ],
  "title": "3-room flat in Poznań, Jeżyce",
  "price": 625000,
  "address": "Poznań, Jeżyce",
  "coordinates": {
    "lat": 52.4078,
    "lon": 16.9251
  },
  "nr_rooms": 3,
  "size_m2": 65.5,
  "floor": "2",
  "monthly_expenses": 450,
  "score": 0.92,
  "status": "active",
  "date_published": "2026-03-01T14:30:00Z",
  "date_seen": "2026-03-13T16:56:00Z",
  "user": {
    "workflow_status": "VISIT_PENDING",
    "rating": 4,
    "pros": ["Great location", "Quiet area"],
    "cons": ["Old building"],
    "comments": "Need to check plumbing before deciding",
    "visit_date": "2026-03-20T10:00:00Z"
  }
}
```

### Field Descriptions

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Unique listing ID in the scraper DB |
| `portal` | `string` | Source portal: `otodom`, `olx`, `domy`, `immohouse` |
| `url` | `string` | Canonical URL to the listing on the source portal |
| `alternate_urls` | `string[]` | URLs to the same listing on other portals (cross-portal deduplication) |
| `title` | `string \| null` | Listing headline |
| `price` | `number \| null` | Price in PLN |
| `address` | `string \| null` | Street address or neighborhood |
| `coordinates` | `{lat, lon} \| null` | GPS coordinates (may be null for some listings) |
| `nr_rooms` | `number \| null` | Number of rooms |
| `size_m2` | `number \| null` | Living area in square meters |
| `floor` | `string \| null` | Floor number |
| `monthly_expenses` | `number \| null` | Monthly maintenance costs / rent (extracted from features) |
| `score` | `number \| null` | Relevance score (0–1) for a saved search; null if not filtered by search |
| `status` | `string` | `active` or `inactive` |
| `date_published` | `string \| null` | ISO 8601 timestamp (portal publish date) |
| `date_seen` | `string` | ISO 8601 timestamp (when scraper last saw this listing) |
| `user.workflow_status` | `string` | User workflow state: `FOUND`, `SEEN`, `VISIT_PENDING`, `VISITED`, `FINALIST`, `DISCARDED` |
| `user.rating` | `number \| null` | User rating (1–5 stars) |
| `user.pros` | `string[] \| null` | User-added pros |
| `user.cons` | `string[] \| null` | User-added cons |
| `user.comments` | `string \| null` | User-added free-form notes |
| `user.visit_date` | `string \| null` | ISO 8601 timestamp of planned/completed visit |

---

## Endpoints

### GET `/api/v1/map/listings`

Returns a paginated list of listings with optional filters.

#### Query Parameters

| Param | Type | Example | Description |
|-------|------|---------|-------------|
| `searchId` | `uuid` | `1e2c825b-7a0b-4755-a93a-dd1edbdbc116` | Filter by a saved search; includes `score` in response |
| `portal` | `string` | `otodom` | Filter by portal |
| `city` | `string` | `Poznań` | Filter by city (case-insensitive substring) |
| `minPrice` | `number` | `400000` | Minimum price |
| `maxPrice` | `number` | `700000` | Maximum price |
| `minArea` | `number` | `40` | Minimum area (m²) |
| `maxArea` | `number` | `90` | Maximum area (m²) |
| `rooms` | `number` | `3` | Exact number of rooms |
| `status` | `string` | `active` | Filter: `active` or `inactive` |
| `userStatus` | `string` | `VISIT_PENDING` | Filter by workflow status |
| `hasCoords` | `string` | `true` | Filter: `true` (only with coordinates) or `false` (only without) |
| `minScore` | `number` | `0.8` | Filter: minimum relevance score (requires `searchId`) |
| `page` | `number` | `1` | Page number (1-indexed, default: 1) |
| `limit` | `number` | `50` | Results per page (default: 100, max: 500) |
| `sortBy` | `string` | `price` | Sort by: `date_seen`, `price`, `size_m2`, `score`, `date_published` (default: `date_seen`) |
| `sortDir` | `string` | `asc` | Sort direction: `asc` or `desc` (default: `desc`) |

#### Response

```json
{
  "data": [
    { /* MapListing object */ },
    { /* MapListing object */ },
    ...
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 2847,
    "pages": 57
  }
}
```

#### Examples

**Get all active listings in Poznań with GPS coordinates:**
```bash
curl "http://localhost:3000/api/v1/map/listings?city=Pozna%C5%84&status=active&hasCoords=true&limit=100"
```

**Get listings matching a saved search, sorted by score (best first):**
```bash
curl "http://localhost:3000/api/v1/map/listings?searchId=1e2c825b-7a0b-4755-a93a-dd1edbdbc116&sortBy=score&sortDir=desc"
```

**Filter by price, area, and rooms (3-5 rooms, 50-100m², 400k-700k PLN):**
```bash
curl "http://localhost:3000/api/v1/map/listings?minPrice=400000&maxPrice=700000&minArea=50&maxArea=100&rooms=3&sortBy=price"
```

**Get listings the user hasn't visited yet:**
```bash
curl "http://localhost:3000/api/v1/map/listings?userStatus=FOUND&sortBy=date_seen&sortDir=desc"
```

---

### GET `/api/v1/map/listings/:id`

Returns a single listing by ID, with optional search context.

#### Path Parameters

| Param | Type | Example |
|-------|------|---------|
| `id` | `uuid` | `550e8400-e29b-41d4-a716-446655440000` |

#### Query Parameters

| Param | Type | Example | Description |
|-------|------|---------|-------------|
| `searchId` | `uuid` | `1e2c825b-7a0b-4755-a93a-dd1edbdbc116` | Include the relevance `score` for this search |

#### Response

Returns a single `MapListing` object (not wrapped in a `data` field).

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "portal": "otodom",
  "url": "https://www.otodom.pl/pl/oferta/...",
  ...
}
```

#### Examples

**Get a listing by ID:**
```bash
curl "http://localhost:3000/api/v1/map/listings/550e8400-e29b-41d4-a716-446655440000"
```

**Get a listing with its score relative to a search:**
```bash
curl "http://localhost:3000/api/v1/map/listings/550e8400-e29b-41d4-a716-446655440000?searchId=1e2c825b-7a0b-4755-a93a-dd1edbdbc116"
```

---

## Cross-Portal Deduplication

When the same apartment is listed on multiple portals, the scraper:

1. **Stores it once** in the DB with a single `id`
2. **Marks one portal as primary** (the first one to be discovered)
3. **Records alternate URLs** in the `alternate_urls` field

Example:

```json
{
  "id": "abc123",
  "portal": "otodom",
  "url": "https://www.otodom.pl/pl/oferta/mieszkanie-ID4wami",
  "alternate_urls": [
    "https://domy.pl/nieruchomosci/oferta/12345",
    "https://www.olx.pl/oferta/xyzabc"
  ],
  ...
}
```

**Use case:** Display all available URLs when the user clicks "View on other sites" or "Check price on other platforms."

---

## Relevance Scoring

When you filter by a `searchId`, each listing receives a **relevance score** (0–1) based on how well it matches the search criteria:

- **1.0** = Perfect match (price, area, rooms, city all exact)
- **0.8** = Good match (most criteria met)
- **0.5** = Partial match (some criteria off by ~10%)
- **0.0** = Poor match (criteria way off, or missing data)

### Score Calculation

The score is computed as the **average** of four sub-scores:

| Criterion | Perfect | Good | Partial | Poor |
|-----------|---------|------|---------|------|
| Price | Within range | – | ±10% off range | Outside ±10% |
| Area | Within range | – | ±10% off range | Outside ±10% |
| Rooms | Exact match | – | – | No match |
| City | Matches | – | – | No match |

---

## Integration Guide

### 1. Initial Map Load

Fetch all active listings with coordinates:

```javascript
async function loadMapListings() {
  const response = await fetch(
    'http://localhost:3000/api/v1/map/listings?status=active&hasCoords=true&limit=200'
  );
  const { data, pagination } = await response.json();

  // Add markers to map
  data.forEach(listing => {
    addMapMarker({
      id: listing.id,
      lat: listing.coordinates.lat,
      lon: listing.coordinates.lon,
      title: listing.title,
      price: listing.price
    });
  });
}
```

### 2. Filter by Search

When the user selects a saved search, show scores:

```javascript
async function filterBySearch(searchId) {
  const response = await fetch(
    `http://localhost:3000/api/v1/map/listings?searchId=${searchId}&minScore=0.7&sortBy=score&sortDir=desc&limit=100`
  );
  const { data } = await response.json();

  // Show best-matching listings first
  updateMapMarkers(data);

  // In sidebar: display score badge
  data.forEach(listing => {
    showScoreBadge(listing.id, listing.score * 100 + '%');
  });
}
```

### 3. Show Listing Details

On marker click, fetch full details:

```javascript
async function showListingDetails(listingId, searchId) {
  const url = searchId
    ? `http://localhost:3000/api/v1/map/listings/${listingId}?searchId=${searchId}`
    : `http://localhost:3000/api/v1/map/listings/${listingId}`;

  const listing = await fetch(url).then(r => r.json());

  // Display in sidebar/popup
  document.getElementById('detail-panel').innerHTML = `
    <h2>${listing.title}</h2>
    <p><strong>Price:</strong> ${listing.price} PLN</p>
    <p><strong>Area:</strong> ${listing.size_m2} m²</p>
    <p><strong>Rooms:</strong> ${listing.nr_rooms}</p>
    <p><strong>Floor:</strong> ${listing.floor}</p>
    ${listing.monthly_expenses ? `<p><strong>Monthly:</strong> ${listing.monthly_expenses} PLN</p>` : ''}
    ${listing.score ? `<p><strong>Match Score:</strong> ${(listing.score * 100).toFixed(0)}%</p>` : ''}

    <h3>User Notes</h3>
    <p><strong>Status:</strong> ${listing.user.workflow_status}</p>
    ${listing.user.rating ? `<p><strong>Rating:</strong> ${listing.user.rating}/5 ⭐</p>` : ''}
    ${listing.user.pros ? `<p><strong>Pros:</strong> ${listing.user.pros.join(', ')}</p>` : ''}
    ${listing.user.cons ? `<p><strong>Cons:</strong> ${listing.user.cons.join(', ')}</p>` : ''}

    <a href="${listing.url}" target="_blank">View on ${listing.portal}</a>
    ${listing.alternate_urls.length > 0 ? `
      <details>
        <summary>View on other sites (${listing.alternate_urls.length})</summary>
        ${listing.alternate_urls.map(url => `<a href="${url}" target="_blank">${new URL(url).hostname}</a>`).join('<br>')}
      </details>
    ` : ''}
  `;
}
```

### 4. Advanced Filtering

Build complex filters:

```javascript
async function advancedSearch(filters) {
  const params = new URLSearchParams();
  if (filters.city) params.append('city', filters.city);
  if (filters.minPrice) params.append('minPrice', filters.minPrice);
  if (filters.maxPrice) params.append('maxPrice', filters.maxPrice);
  if (filters.minArea) params.append('minArea', filters.minArea);
  if (filters.maxArea) params.append('maxArea', filters.maxArea);
  if (filters.rooms) params.append('rooms', filters.rooms);
  if (filters.hasVisited) params.append('userStatus', 'VISITED');

  const response = await fetch(
    `http://localhost:3000/api/v1/map/listings?${params.toString()}`
  );
  return response.json();
}
```

---

## Error Handling

All endpoints return HTTP 200 on success.

### 400 Bad Request

Invalid query parameters:

```json
{
  "error": "Validation error",
  "details": {
    "minPrice": {
      "_errors": ["Expected number, received string"]
    }
  }
}
```

### 404 Not Found

Listing ID doesn't exist:

```json
{
  "error": "Listing not found"
}
```

---

## Performance Notes

- **Pagination:** Always use `limit` and `page` parameters to avoid loading huge datasets
- **Coordinates:** Use `hasCoords=true` to exclude listings without GPS data (improves map rendering)
- **Score sorting:** When `sortBy=score`, sorting happens in-memory (after fetching); use moderate `limit` values
- **Caching:** Map data changes every few minutes (scraper runs hourly); consider caching with a 5–10 minute TTL

---

## Examples (cURL)

### Get top-matching listings for a search

```bash
curl "http://localhost:3000/api/v1/map/listings?searchId=1e2c825b-7a0b-4755-a93a-dd1edbdbc116&minScore=0.85&sortBy=score&sortDir=desc&limit=50"
```

### Get all affordable listings in Poznań

```bash
curl "http://localhost:3000/api/v1/map/listings?city=Pozna%C5%84&maxPrice=600000&hasCoords=true&status=active&sortBy=price&limit=100"
```

### Get listings the user has marked as finalists

```bash
curl "http://localhost:3000/api/v1/map/listings?userStatus=FINALIST&sortBy=date_seen&limit=50"
```

### Get a single listing with its cross-portal alternatives

```bash
curl "http://localhost:3000/api/v1/map/listings/550e8400-e29b-41d4-a716-446655440000"
```

---

## Questions?

Check the scraper API logs or refer to the main `README.md` for more details about saved searches and database structure.
