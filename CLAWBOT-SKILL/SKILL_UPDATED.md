---
name: poznan-scraper-api
description: >
  Access the Poznań real estate market database with advanced apartment management. Use this whenever a user wants to search for properties, manage apartment viewing workflow (track which you've seen, visited, or shortlisted), monitor saved searches, bulk delete properties, compare real estate market trends across OLX/Otodom/Immohouse, or analyze market data. Trigger for queries mentioning "properties in Poznań", "apartment hunting", "real estate market", "track properties", "manage apartment visits", "market analysis", property searches, saved search management, or data analysis of Polish housing market. Also trigger for any apartment-related workflow like "mark as favorite", "I want to keep track of which apartments I've visited", "compare properties", "generate market report".
---

# Poznań Real Estate Database & Apartment Management

This skill provides a comprehensive real estate market database for Poznań covering three major portals (**OLX**, **Otodom**, **Immohouse**) with advanced features for tracking apartment viewings, managing saved searches, and analyzing market trends.

## What You Can Do

### 🔍 Search & Filter Properties
- **Query active listings** by price, area, rooms, portal, and listing status
- **Filter listings** with sophisticated search: `minPrice`, `maxPrice`, `minArea`, `maxArea`, `rooms`, `status`
- **Pagination support**: Request specific pages of results
- **Cross-portal search**: Find the same property across all three platforms
- **Filter by listing state**: FOUND, SEEN, VISIT_PENDING, VISITED, FINALIST, DISCARDED
- **Filter by user feedback**: Properties with comments, ratings 1-5 stars

### 📊 Manage Your Apartment Hunt
- **Track viewing status**: Mark apartments as FOUND → SEEN → VISIT_PENDING → VISITED → FINALIST (or DISCARDED)
- **Add notes & ratings**: Comments, visit dates, pros/cons lists, 1-5 star ratings
- **View enriched listings**: Each apartment shows your personal notes and status
- **Delete only "FOUND" apartments**: Only properties you haven't viewed can be deleted (safety mechanism)
- **Bulk operations**: Delete multiple apartments at once by status, price range, portal, or city

### 🔎 Manage Saved Searches
- **Full CRUD for searches**: Create, read, update, delete automated searches
- **Set frequency**: Hourly, daily, weekly checks for new properties
- **Duplicate searches**: Copy a search with a new name to monitor variations
- **Run manually**: Trigger a search immediately (useful for "show me what's new right now")
- **View search stats**: See how many total, new, and active listings per search
- **Track changes**: See what's new/changed in a search since the last check
- **Get listings from search**: View all results from a specific saved search with your personal state data

### 📈 Analyze & Understand the Market
- **Price trends**: Track price changes by portal and property characteristics
- **Market summary**: Overview of all your saved searches with stats
- **Activity timeline**: See what changed (new listings, price drops, etc.) over time
- **Statistics by status**: Count how many apartments you've found, seen, visited, or shortlisted
- **Portfolio analysis**: Aggregate data by portal, price range, size category
- **Duplicate detection**: Identify the same property listed on multiple portals
- **Market insights**: Calculate average price per m², trends, category distribution

---

## API Base URL
```
http://localhost:3000
```

---

## Quick Examples

### Search all 3-room apartments, €400k–€700k
```bash
node scripts/search-listings.js --minPrice 400000 --maxPrice 700000 --rooms 3
```

### Create an automated daily search
```bash
node scripts/create-search.js \
  --name "3-room apartments €450k-€650k" \
  --frequencyMinutes 1440 \
  --minPrice 450000 \
  --maxPrice 650000 \
  --rooms 3 \
  --portal otodom
```

### Mark an apartment as visited and add notes
```bash
node scripts/manage-listings.js --listingId abc123 \
  --status VISITED \
  --visitDate 2026-03-07 \
  --rating 4 \
  --pros "Good location, modern kitchen" \
  --cons "No parking, noisy street"
```

### See all apartments you've visited
```bash
node scripts/search-listings.js --listingStatus VISITED
```

### Get market statistics
```bash
node scripts/stats.js --format markdown
```

### Delete multiple apartments at once (only FOUND status allowed)
```bash
node scripts/bulk-operations.js delete \
  --status FOUND \
  --priceMax 400000 \
  --portal olx
```

---

## Available Scripts

All scripts are in the `scripts/` directory. Run from the project root with `node scripts/SCRIPT.js`.

### `scripts/poznan-api.js` – Core API Client

Low-level HTTP client for all API endpoints. Use for custom queries or integration.

**Example:**
```javascript
const api = require('./scripts/poznan-api');
const results = await api.searchListings({
  minPrice: 400000,
  maxPrice: 700000,
  rooms: 3,
  limit: 50
});
```

**New methods:**
- `api.createSearch(config)` — Create a saved search
- `api.listSearches(options)` — List all saved searches
- `api.getSearch(searchId)` — Get search details
- `api.updateSearch(searchId, updates)` — Update a search
- `api.deleteSearch(searchId, cascadeListings)` — Delete a search
- `api.duplicateSearch(searchId, newName)` — Copy a search
- `api.runSearchNow(searchId)` — Trigger search immediately
- `api.getSearchListings(searchId, options)` — Get listings from search
- `api.getSearchStats(searchId)` — Get search statistics
- `api.updateListingState(listingId, stateUpdate)` — Update listing state
- `api.getListingState(listingId)` — Get listing's current state
- `api.bulkDeleteListings(criteria)` — Delete multiple listings
- `api.getStatsByStatus()` — Count listings by status
- `api.getSearchesSummary()` — Summary of all searches
- `api.getActivityTimeline(days)` — Timeline of recent changes
- `api.getOverviewStats()` — Global statistics

### `scripts/search-listings.js` – Search & Filter

Query listings with filters and formatting. Supports pagination and multiple output formats.

**Arguments:**
```
--minPrice NUM          Minimum price in PLN
--maxPrice NUM          Maximum price in PLN
--minArea NUM           Minimum area in m²
--maxArea NUM           Maximum area in m²
--rooms NUM             Number of rooms
--source STR            Portal: 'olx', 'otodom', 'immohouse'
--status STR            'active' or 'inactive' (default: all)
--listingStatus STR     User state: 'FOUND', 'SEEN', 'VISIT_PENDING', 'VISITED', 'FINALIST', 'DISCARDED'
--hasComments BOOL      Filter: has comments or not
--rating NUM            Filter by star rating (1-5)
--updatedSince ISO-8601 Only list items modified after this date
--page NUM              Page number (default: 1)
--limit NUM             Results per page (default: 50)
--sortBy FIELD          Sort by: lastSeenAt, price, areaM2, createdAt, updatedAt
--sortDir DIRECTION     asc or desc (default: desc)
--output FORMAT         'json', 'csv', 'table' (default: json)
```

**Example – Display top 10 best value apartments with your notes:**
```bash
node scripts/search-listings.js \
  --minPrice 400000 \
  --maxPrice 700000 \
  --rooms 3 \
  --limit 10 \
  --output table
```

### `scripts/create-search.js` – Create Automated Searches

Create a new saved search that runs on a schedule.

**Arguments:**
```
--name STR              Name of the search (required)
--portal STR            'immohouse', 'olx', 'otodom' (required)
--frequencyMinutes NUM  How often to run (in minutes, default: 1440/daily)
--minPrice NUM          Minimum price
--maxPrice NUM          Maximum price
--minArea NUM           Minimum area in m²
--maxArea NUM           Maximum area in m²
--rooms NUM             Number of rooms
--propertyType STR      'flat' (default)
--city STR              City name (default: 'Poznań')
--operation STR         'buy' or 'rent' (default: 'buy')
--enabled BOOL          Start enabled or disabled (default: true)
```

**Example – Create hourly search:**
```bash
node scripts/create-search.js \
  --name "Hourly: 3-room apts €450k-€650k" \
  --portal olx \
  --frequencyMinutes 60 \
  --minPrice 450000 \
  --maxPrice 650000 \
  --rooms 3
```

**Returns:** The created search ID and a link to view results.

### `scripts/manage-listings.js` – Track Your Apartment Hunt ⭐ NEW

Update apartment status, add notes, record visits.

**Arguments:**
```
--listingId STR         Listing UUID (required)
--status STR            Status: FOUND, SEEN, VISIT_PENDING, VISITED, FINALIST, DISCARDED
--comments STR          Your notes about the apartment (max 5000 chars)
--visitDate ISO-8601    Date you visited (e.g., 2026-03-07)
--rating NUM            Your rating: 1-5 stars
--pros STR              Comma-separated list of pros
--cons STR              Comma-separated list of cons
--action STR            'get' to view current state, 'update' to change (default: update)
```

**Example – Mark as visited with notes:**
```bash
node scripts/manage-listings.js \
  --listingId a1b2c3d4 \
  --status VISITED \
  --visitDate 2026-03-07 \
  --rating 4 \
  --pros "Modern kitchen, balcony, good light" \
  --cons "Noisy street, no parking"
```

**Example – View current state:**
```bash
node scripts/manage-listings.js --listingId a1b2c3d4 --action get
```

### `scripts/bulk-operations.js` – Bulk Delete ⭐ NEW

Delete multiple apartments at once by criteria. Only FOUND status apartments can be deleted.

**Arguments:**
```
--action STR            'delete' (required)
--status STR            Filter by status (default: FOUND)
--priceMin NUM          Filter: minimum price
--priceMax NUM          Filter: maximum price
--areaMin NUM           Filter: minimum area (m²)
--areaMax NUM           Filter: maximum area (m²)
--portal STR            Filter by portal
--city STR              Filter by city
--daysOld NUM           Delete if not updated in N days
--dryRun BOOL           Show what would be deleted without actually deleting (default: false)
```

**Example – Delete old "FOUND" apartments under €400k:**
```bash
node scripts/bulk-operations.js delete \
  --status FOUND \
  --priceMax 400000 \
  --dryRun true
```

**Safety:**
- Only FOUND status apartments can be deleted
- Always use `--dryRun true` first to preview
- Script will refuse to delete apartments in other states

### `scripts/stats.js` – Market Analytics ⭐ NEW

Generate comprehensive statistics about your searches and apartment hunt.

**Arguments:**
```
--action STR            'overview', 'by-status', 'searches', 'timeline' (default: overview)
--days NUM              For timeline: number of days to analyze (default: 30)
--format STR            'json', 'markdown', 'table' (default: markdown)
--output FILE           Save to file (optional)
```

**Examples:**
```bash
# Overview of everything
node scripts/stats.js --action overview --format markdown

# How many apartments in each status
node scripts/stats.js --action by-status --format table

# Summary of all your saved searches
node scripts/stats.js --action searches --format markdown

# Activity over last 30 days
node scripts/stats.js --action timeline --days 30 --format markdown
```

### `scripts/analyze-market.js` – Market Intelligence

Generate detailed market analysis from current data.

**Arguments:**
```
--minPrice NUM          Minimum price filter
--maxPrice NUM          Maximum price filter
--minArea NUM           Minimum area filter
--maxArea NUM           Maximum area filter
--timeframeDays NUM     How many days of history (default: 7)
--format STR            'json', 'markdown', 'html' (default: markdown)
--output FILE           Save to file (optional)
```

**Generates:**
- Average prices and trends
- Price per m² by portal
- Room count distribution
- Portal comparison (best value)
- Recommended price ranges

**Example:**
```bash
node scripts/analyze-market.js \
  --minPrice 400000 \
  --maxPrice 700000 \
  --minArea 45 \
  --maxArea 90 \
  --timeframeDays 30 \
  --format markdown
```

---

## Apartment Management Workflow

The system tracks apartments through a structured workflow:

```
FOUND (newly discovered)
  ↓
SEEN (you've looked at it)
  ↓
VISIT_PENDING (scheduled to visit)
  ↓
VISITED (you've been there)
  ├─→ FINALIST (shortlisted - might make an offer)
  └─→ DISCARDED (not interested)
```

Each apartment can have:
- **Comments**: Your personal notes (max 5000 characters)
- **Visit Date**: When you visited
- **Rating**: 1-5 stars
- **Pros/Cons**: Lists of what you liked/disliked

### Data Structure

### Listing Object
```json
{
  "id": "uuid",
  "source": "olx|otodom|immohouse",
  "canonicalUrl": "https://...",
  "title": "3-room apartment in city center",
  "description": "Fully renovated...",
  "price": 550000,
  "currency": "PLN",
  "areaM2": 65,
  "rooms": 3,
  "city": "Poznań",
  "neighborhood": "Stare Miasto",
  "status": "active|inactive",
  "firstSeenAt": "2026-03-07T12:00:00Z",
  "lastSeenAt": "2026-03-07T15:45:00Z",
  "userState": {
    "status": "FOUND|SEEN|VISIT_PENDING|VISITED|FINALIST|DISCARDED",
    "comments": "Your notes here",
    "visitDate": "2026-03-07",
    "rating": 4,
    "pros": ["Modern kitchen", "Balcony"],
    "cons": ["No parking", "Noisy street"]
  }
}
```

### Saved Search Object
```json
{
  "id": "uuid",
  "name": "3-room apartments €400k–€700k",
  "portal": "olx|otodom|immohouse",
  "frequencyMinutes": 60,
  "enabled": true,
  "filters": {
    "operation": "buy",
    "propertyType": "flat",
    "city": "Poznań",
    "rooms": 3,
    "priceMin": 400000,
    "priceMax": 700000,
    "areaMin": 45,
    "areaMax": 90
  },
  "lastRunAt": "2026-03-07T17:37:00Z",
  "lastSuccessAt": "2026-03-07T17:37:00Z"
}
```

---

## Common Workflows

### 1️⃣ Find & Track Apartments

```bash
# Create saved search for daily monitoring
node scripts/create-search.js \
  --name "My dream apartments" \
  --portal all \
  --frequencyMinutes 1440 \
  --minPrice 400000 \
  --maxPrice 700000 \
  --rooms 3 \
  --minArea 60

# See all apartments discovered
node scripts/search-listings.js --minPrice 400000 --maxPrice 700000 --rooms 3

# Mark some as seen
node scripts/manage-listings.js --listingId ID1 --status SEEN
node scripts/manage-listings.js --listingId ID2 --status SEEN --comments "Interesting but far away"

# Schedule visits
node scripts/manage-listings.js --listingId ID1 --status VISIT_PENDING --visitDate 2026-03-08

# Record your visit and thoughts
node scripts/manage-listings.js \
  --listingId ID1 \
  --status VISITED \
  --visitDate 2026-03-08 \
  --rating 4 \
  --pros "Great view, modern, quiet" \
  --cons "Expensive utilities"
```

### 2️⃣ Market Analysis

```bash
# Get overview of your hunt
node scripts/stats.js --action overview

# See apartments by status
node scripts/stats.js --action by-status

# Check recent activity
node scripts/stats.js --action timeline --days 7

# Detailed market analysis
node scripts/analyze-market.js \
  --minPrice 400000 \
  --maxPrice 700000 \
  --timeframeDays 30 \
  --format markdown
```

### 3️⃣ Manage Multiple Searches

```bash
# Create monthly search
node scripts/create-search.js --name "Monthly check" --frequencyMinutes 43200

# Duplicate with different criteria
node scripts/create-search.js \
  --name "OLX only - 4 rooms" \
  --portal olx \
  --rooms 4

# View all searches
node scripts/search-listings.js --listingStatus FOUND

# Trigger search immediately (don't wait for schedule)
node scripts/search-listings.js --searchId abc123
```

### 4️⃣ Cleanup (Careful!)

```bash
# See what would be deleted (dry run)
node scripts/bulk-operations.js delete \
  --status FOUND \
  --priceMax 350000 \
  --dryRun true

# Actually delete old FOUND apartments
node scripts/bulk-operations.js delete \
  --status FOUND \
  --priceMax 350000
```

---

## Error Handling

| Issue | Solution |
|-------|----------|
| `ECONNREFUSED 127.0.0.1:3000` | Scraper not running: `docker compose up -d` |
| API returns `[]` | Filters too restrictive; try broader ranges |
| `Cannot delete listing - not FOUND` | Only FOUND apartments can be deleted; others are preserved |
| Search takes >30s | Reduce `--limit` or add more specific filters |
| Missing `node-fetch` | Run `npm install node-fetch@2` |

---

## Integration with CLAWBOT

This skill is designed for LLM agents. The API returns structured JSON for further processing.

**Agent workflow:**
```
1. User asks: "Find 3-room apartments €400k-€700k I should visit"
2. Agent searches with filters and includes user state data
3. Agent shows top options sorted by price/m²
4. User marks interesting ones: "Add notes to apartment X"
5. Agent updates apartment state with comments/rating
6. Agent can generate reports: "Show me statistics of my hunt"
```

---

## Next Steps

1. **Search**: `node scripts/search-listings.js --rooms 3 --limit 5`
2. **Create saved search**: `node scripts/create-search.js --name "My search" --portal olx`
3. **Track apartments**: `node scripts/manage-listings.js --listingId ID1 --status SEEN`
4. **View stats**: `node scripts/stats.js --format table`
5. **Analyze market**: `node scripts/analyze-market.js --format markdown`
