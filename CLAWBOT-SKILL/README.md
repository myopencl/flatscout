# Poznań Scraper API SKILL for CLAWBOT

Professional integration of the poznan-scraper real estate database with the CLAWBOT agent system.

## 📋 What's Included

### Documentation
- **SKILL.md** - Full skill documentation (description, triggers, usage guide)

### Scripts
- **scripts/poznan-api.js** - Low-level API client (HTTP wrapper)
- **scripts/search-listings.js** - Query listings with filters and formatting
- **scripts/create-search.js** - Create automated saved searches
- **scripts/analyze-market.js** - Generate market intelligence reports

## 🚀 Quick Start

### 1. Ensure scraper is running
```bash
# In the main project directory
docker compose up -d
curl http://localhost:3000/health
```

### 2. Test the skill
```bash
# Search for 3-room apartments €400k-€700k
node scripts/search-listings.js --minPrice 400000 --maxPrice 700000 --rooms 3 --limit 5

# Output as table
node scripts/search-listings.js --minPrice 400000 --maxPrice 700000 --rooms 3 --limit 5 --output table

# Output as CSV
node scripts/search-listings.js --minPrice 400000 --maxPrice 700000 --rooms 3 --output csv
```

### 3. Create a saved search
```bash
node scripts/create-search.js \
  --name "3-room apartments €450k-€650k" \
  --portal olx \
  --frequencyMinutes 60 \
  --minPrice 450000 \
  --maxPrice 650000 \
  --rooms 3
```

### 4. Analyze market
```bash
node scripts/analyze-market.js \
  --minPrice 400000 \
  --maxPrice 700000 \
  --minArea 45 \
  --maxArea 90 \
  --timeframeDays 30 \
  --format markdown
```

## 📖 Full Documentation

See **SKILL.md** for:
- All available commands and arguments
- Data structures
- Common workflows
- Error handling
- Integration with LLM agents

## 🛠️ Dependencies

The scripts require:
- Node.js 18+
- `node-fetch@2` (HTTP client)

```bash
npm install node-fetch@2
```

## 🔌 Environment Variables

Optional configuration via `.env`:
```env
POZNAN_API_URL=http://localhost:3000
```

## 📊 Example Workflows

### Find the best value properties
```bash
node scripts/search-listings.js \
  --minPrice 400000 \
  --maxPrice 700000 \
  --minArea 50 \
  --maxArea 90 \
  --limit 200 \
  --output table
```

(Listings are automatically sorted by price/m² in output)

### Monitor neighborhood changes
```bash
# Create hourly search
node scripts/create-search.js \
  --name "Stare Miasto hourly monitor" \
  --portal all \
  --frequencyMinutes 60 \
  --minPrice 350000 \
  --maxPrice 800000

# Check recent changes
node scripts/search-listings.js \
  --updatedSince "2026-03-06T17:37:00Z" \
  --status active \
  --output table
```

### Compare portals
```bash
# OLX listings
node scripts/search-listings.js \
  --source olx \
  --minPrice 400000 \
  --maxPrice 700000 \
  --rooms 3 \
  --limit 20 \
  --output json > olx-results.json

# Otodom listings
node scripts/search-listings.js \
  --source otodom \
  --minPrice 400000 \
  --maxPrice 700000 \
  --rooms 3 \
  --limit 20 \
  --output json > otodom-results.json

# Then compare...
```

### Generate market report
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

## 🤖 Integration with CLAWBOT

This skill is designed for LLM agent integration. When CLAWBOT encounters user requests about:
- Searching for properties in Poznań
- Real estate market analysis
- Apartment hunting
- Price comparisons
- Market trends

...it will automatically use this skill to:
1. Query the API with appropriate filters
2. Retrieve structured data
3. Process and analyze results
4. Return formatted responses to the user

## 🔧 API Endpoints Used

The skill accesses these poznan-scraper endpoints:

### Listings
- `GET /api/v1/listings` - Search with filters
- `GET /api/v1/listings/:id` - Get listing details
- `GET /api/v1/listings/:id/events` - View price history
- `GET /api/v1/listings/:id/potential-duplicates` - Find cross-portal duplicates
- `PATCH /api/v1/listings/:id/state` - Mark favorite/discarded

### Saved Searches
- `GET /api/v1/saved-searches` - List saved searches
- `POST /api/v1/saved-searches` - Create new search
- `GET /api/v1/saved-searches/:id` - Get search details
- `POST /api/v1/saved-searches/:id/run` - Run search manually
- `GET /api/v1/saved-searches/:id/listings` - Get search results
- `GET /api/v1/saved-searches/:id/changes` - View recent changes

### Health
- `GET /health` - Check API status

## 📝 Troubleshooting

### "ECONNREFUSED 127.0.0.1:3000"
Scraper not running. Start it:
```bash
docker compose up -d
```

### "Cannot find module 'node-fetch'"
Install the dependency:
```bash
npm install node-fetch@2
```

### No results from search
1. Check filters aren't too restrictive
2. Try broader price range
3. Ensure scraper has discovered listings

### Slow API responses (>30s)
1. Reduce `--limit` to get fewer results
2. Use pagination with `--page` and `--limit`
3. Add more specific filters

## 📚 Reference

**Listing Fields:**
- `id`, `portal`, `portalListingId`, `portalUrl`
- `title`, `description`, `location`
- `price`, `area`, `rooms`, `pricePerM2`
- `dateDiscovered`, `dateModified`, `status`
- `photos`, `features`, `userState`

**Search Filters:**
- `minPrice`, `maxPrice` (PLN)
- `minArea`, `maxArea` (m²)
- `rooms` (number)
- `source` (portal name)
- `status` ('active' or 'inactive')
- `updatedSince` (ISO-8601 date)
- `page`, `limit` (pagination)

## 📞 Support

For issues with:
- **Skill functionality**: Check SKILL.md
- **API errors**: Check poznan-scraper logs: `docker compose logs scraper`
- **Script usage**: Run script with no arguments to see help

## 🔄 Installation for CLAWBOT

To install this skill in CLAWBOT:

1. Copy the entire `CLAWBOT-SKILL` folder to your CLAWBOT skills directory
2. Ensure `SKILL.md` is in the root of the folder
3. CLAWBOT will automatically discover and load the skill
4. The skill will trigger when users mention Poznań property searches, real estate analysis, etc.

---

**Ready to use!** 🎉

Start with: `node scripts/search-listings.js --rooms 3 --limit 5`
