# Poznań Scraper API SKILL for FlatScout

Professional integration of the poznan-scraper real estate database with FlatScout.

## Quick Start

1. Ensure scraper is running:
```bash
docker compose up -d
curl http://localhost:3000/health
```

2. Install script deps:
```bash
npm install
```

3. Test search:
```bash
node scripts/search-listings.js --minPrice 400000 --maxPrice 700000 --rooms 3 --limit 5 --output table
```

4. Create saved search:
```bash
node scripts/create-search.js --name "3-room apartments" --portal olx --frequencyMinutes 60 --minPrice 450000 --maxPrice 650000 --rooms 3
```

See `EXAMPLES.md` for complete workflows.
