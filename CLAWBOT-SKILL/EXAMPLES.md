# Poznań Scraper SKILL - Usage Examples

Complete examples showing how to use every feature of the skill.

## Installation

```bash
# 1. Navigate to skill directory
cd CLAWBOT-SKILL

# 2. Install dependencies
npm install
# or
npm run install-deps
```

## Example 1: Simple Property Search

**Goal:** Find 3-room apartments in the €400k-€700k range

```bash
node scripts/search-listings.js \
  --minPrice 400000 \
  --maxPrice 700000 \
  --rooms 3 \
  --limit 10
```

**Output:** JSON array of 10 listings with full details

---

## Example 2: Display Results as Table

**Goal:** Find and display results in a readable table format

```bash
node scripts/search-listings.js \
  --minPrice 400000 \
  --maxPrice 700000 \
  --rooms 3 \
  --limit 20 \
  --output table
```

**Output:**
```
┌──────┬──────────────┬───────────┬───────┬──────────────────┬───────────┬────────┐
│ Portal │ Price (PLN) │ Area (m²) │ Rooms │ Location         │ Price/m² │ Status │
├──────┼──────────────┼───────────┼───────┼──────────────────┼───────────┼────────┤
│ OLX  │ 550,000      │ 65        │ 3     │ Poznań, Centrum  │ 8,461    │ ACTIVE │
│ OLX  │ 600,000      │ 72        │ 3     │ Poznań, Winogrady│ 8,333    │ ACTIVE │
│ OTODOM│ 580,000      │ 68        │ 3     │ Poznań, Stare M. │ 8,529    │ ACTIVE │
...
```

---

## Example 3: Find Best Value Properties

**Goal:** Find the best price per square meter

```bash
# Get large dataset and sort by price/m²
node scripts/search-listings.js \
  --minPrice 350000 \
  --maxPrice 800000 \
  --minArea 40 \
  --maxArea 100 \
  --limit 100 \
  --output table | head -20
```

The output is automatically sorted by price/m² (in the JSON output).

---

## Example 4: Export to CSV

**Goal:** Get data in spreadsheet format

```bash
node scripts/search-listings.js \
  --minPrice 400000 \
  --maxPrice 700000 \
  --rooms 3 \
  --output csv > listings.csv
```

**Output:** `listings.csv` with columns:
```
id,portal,title,price,area,rooms,location,pricePerM2,status,portalUrl,dateDiscovered
cccb5c0e-00c0-45a5-bd47-25d6fce21f61,olx,3 pokoje...,550000,65,3,Poznań,8461.5,active,https://...,2026-03-07T12:00:00Z
```

---

## Example 5: Filter by Portal

**Goal:** Compare the same price range across different platforms

```bash
# OLX only
node scripts/search-listings.js \
  --source olx \
  --minPrice 400000 \
  --maxPrice 700000 \
  --rooms 3 \
  --output table

# Otodom only
node scripts/search-listings.js \
  --source otodom \
  --minPrice 400000 \
  --maxPrice 700000 \
  --rooms 3 \
  --output table

# Immohouse only
node scripts/search-listings.js \
  --source immohouse \
  --minPrice 400000 \
  --maxPrice 700000 \
  --rooms 3 \
  --output table
```

---

## Example 6: Track Recent Changes

**Goal:** See what's new or changed in the last 24 hours

```bash
# Calculate 24 hours ago in ISO-8601 format
# On Mac: date -u -d '24 hours ago' +%Y-%m-%dT%H:%M:%SZ
# On Linux: date -u -d '24 hours ago' +%Y-%m-%dT%H:%M:%SZ
# On Windows: Use a recent timestamp manually

node scripts/search-listings.js \
  --updatedSince "2026-03-06T17:37:00Z" \
  --status active \
  --output table
```

---

## Example 7: Create Automated Daily Search

**Goal:** Set up a search that runs automatically every 24 hours

```bash
node scripts/create-search.js \
  --name "3-room apartments €450k-€650k" \
  --portal all \
  --frequencyMinutes 1440 \
  --minPrice 450000 \
  --maxPrice 650000 \
  --rooms 3
```

**Output:**
```
✅ Search created successfully!
ID: a1b2c3d4-e5f6-47g8-h9i0-j1k2l3m4n5o6

Next steps:
1. View listings: node scripts/search-listings.js
2. Check updates: node scripts/search-listings.js --updatedSince "2026-03-07T17:37:00Z"
3. Run manually: node scripts/poznan-api.js post /api/v1/saved-searches/a1b2c3d4-e5f6-47g8-h9i0-j1k2l3m4n5o6/run
```

---

## Example 8: Create Hourly Monitoring Search

**Goal:** Monitor a specific neighborhood every hour

```bash
node scripts/create-search.js \
  --name "Stare Miasto hourly monitor" \
  --portal all \
  --frequencyMinutes 60 \
  --minPrice 350000 \
  --maxPrice 800000 \
  --minArea 40 \
  --maxArea 100
```

---

## Example 9: Generate Market Analysis Report

**Goal:** Create a comprehensive market analysis

```bash
node scripts/analyze-market.js \
  --minPrice 400000 \
  --maxPrice 700000 \
  --minArea 45 \
  --maxArea 90 \
  --timeframeDays 30 \
  --format markdown \
  --output market-report.md
```

**Output:** `market-report.md` with sections:
- Summary statistics
- Data by portal
- Data by room count
- Market insights
- Best value properties

---

## Example 10: Generate HTML Market Report

**Goal:** Create a beautiful HTML report for sharing

```bash
node scripts/analyze-market.js \
  --minPrice 400000 \
  --maxPrice 700000 \
  --minArea 45 \
  --maxArea 90 \
  --timeframeDays 30 \
  --format html \
  --output market-report.html
```

**Then open:** `open market-report.html` (Mac) or `start market-report.html` (Windows)

---

## Example 11: Weekly Market Intelligence

**Goal:** Analyze 7 days of data for market trends

```bash
node scripts/analyze-market.js \
  --minPrice 400000 \
  --maxPrice 700000 \
  --timeframeDays 7 \
  --format markdown
```

**Shows:**
- Average prices
- Price per m² trends
- Supply by portal
- Room distribution
- Market insights

---

## Example 12: Low-Level API Access

**Goal:** Make custom API calls for advanced queries

```bash
# Get a specific listing by ID
node scripts/poznan-api.js get /api/v1/listings/LISTING_ID

# List all saved searches
node scripts/poznan-api.js get /api/v1/saved-searches

# Get a saved search details
node scripts/poznan-api.js get /api/v1/saved-searches/SEARCH_ID

# Get listings from a saved search
node scripts/poznan-api.js get /api/v1/saved-searches/SEARCH_ID/listings

# Create a new saved search
node scripts/poznan-api.js post /api/v1/saved-searches \
  --name "Test Search" \
  --portal olx \
  --frequencyMinutes 1440

# Run a search manually
node scripts/poznan-api.js post /api/v1/saved-searches/SEARCH_ID/run

# Mark a listing as favorite
node scripts/poznan-api.js patch /api/v1/listings/LISTING_ID/state \
  --searchId SEARCH_ID \
  --userState favorite
```

---

## Example 13: Pagination for Large Datasets

**Goal:** Get all 500+ listings in batches

```bash
# Get first page (50 results)
node scripts/search-listings.js \
  --minPrice 300000 \
  --maxPrice 900000 \
  --page 1 \
  --limit 50 \
  --output json > page-1.json

# Get second page
node scripts/search-listings.js \
  --minPrice 300000 \
  --maxPrice 900000 \
  --page 2 \
  --limit 50 \
  --output json > page-2.json

# Get third page
node scripts/search-listings.js \
  --minPrice 300000 \
  --maxPrice 900000 \
  --page 3 \
  --limit 50 \
  --output json > page-3.json

# Combine all pages
cat page-*.json | jq -s 'add' > all-listings.json
```

---

## Example 14: Find Duplicates (Same Property on Multiple Portals)

**Goal:** Discover when the same property is listed on OLX and Otodom

```bash
# 1. Find a listing
node scripts/search-listings.js \
  --source olx \
  --rooms 3 \
  --limit 1 \
  --output json > first-listing.json

# 2. Extract the ID and find duplicates
LISTING_ID=$(cat first-listing.json | jq -r '.[0].id')
node scripts/poznan-api.js get /api/v1/listings/$LISTING_ID/potential-duplicates
```

---

## Example 15: Integration with JavaScript/Node Applications

**Goal:** Use the API client in your own Node.js code

```javascript
const api = require('./scripts/poznan-api');

(async () => {
  // Search listings
  const results = await api.searchListings({
    minPrice: 400000,
    maxPrice: 700000,
    rooms: 3,
    limit: 50,
  });

  console.log(`Found ${results.data.length} listings`);

  // Get first listing details
  const listing = results.data[0];
  const details = await api.getListing(listing.id);
  console.log('Details:', details);

  // Find duplicates
  const duplicates = await api.getPotentialDuplicates(listing.id);
  console.log('This property also listed on:', duplicates.map(d => d.portal));

  // Get price history
  const history = await api.getListingEvents(listing.id);
  console.log('Price changes:', history);
})();
```

---

## Common Workflows

### Workflow 1: Nightly Market Analysis Email
```bash
#!/bin/bash
node scripts/analyze-market.js \
  --minPrice 400000 \
  --maxPrice 700000 \
  --timeframeDays 1 \
  --format markdown \
  --output daily-report.md

# Send via email...
```

### Workflow 2: Find Your Dream Home
```bash
# 1. Search with broad filters
node scripts/search-listings.js \
  --minPrice 400000 \
  --maxPrice 700000 \
  --minArea 50 \
  --maxArea 100 \
  --limit 100 \
  --output csv > candidates.csv

# 2. Review in spreadsheet (Excel/Google Sheets)
# 3. For your favorites:
LISTING_ID="..."
node scripts/poznan-api.js patch /api/v1/listings/$LISTING_ID/state \
  --searchId SEARCH_ID \
  --userState favorite
```

### Workflow 3: Monitor Price Drops
```bash
# Create a saved search
SEARCH=$(node scripts/create-search.js \
  --name "Monitor price drops" \
  --portal all \
  --frequencyMinutes 360 \
  --minPrice 400000 \
  --maxPrice 700000)

SEARCH_ID=$(echo $SEARCH | jq -r '.id')

# Check for price decreases
node scripts/search-listings.js \
  --updatedSince "2026-03-06T00:00:00Z" \
  --output table
```

---

## Troubleshooting Examples

### "ECONNREFUSED" - Scraper not running
```bash
# Start the scraper
cd ..  # Go to main project directory
docker compose up -d
sleep 5

# Try again
node scripts/search-listings.js --rooms 3 --limit 5
```

### No results from search
```bash
# Try with broader filters
node scripts/search-listings.js \
  --minPrice 100000 \
  --maxPrice 1000000 \
  --limit 10

# Check API health
node scripts/poznan-api.js get /health
```

### Want to see raw API response
```bash
# Use the low-level API client
node scripts/poznan-api.js get /api/v1/listings \
  --minPrice 400000 \
  --maxPrice 700000 \
  --rooms 3 \
  --limit 5
```

---

**Ready to explore?** Start with Example 1! 🚀
