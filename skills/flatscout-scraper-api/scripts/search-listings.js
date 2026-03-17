#!/usr/bin/env node

/**
 * Search Listings Script
 * Query listings with filters, pagination, and multiple output formats.
 */

const api = require('./poznan-api');

// Parse arguments
const args = require('minimist')(process.argv.slice(2), {
  boolean: ['hasComments', 'favorite', 'help'],
  alias: { h: 'help' }
});

if (args.help) {
  console.log(`
Usage: node search-listings.js [options]

Filters:
  --minPrice NUM       Minimum price in PLN
  --maxPrice NUM       Maximum price in PLN
  --minArea NUM        Minimum area in m²
  --maxArea NUM        Maximum area in m²
  --rooms NUM          Number of rooms
  --portal STR         Portal: 'olx', 'otodom', 'immohouse'
  --status STR         Listing status: 'active' or 'inactive'
  --listingStatus STR  User state: FOUND, SEEN, VISIT_PENDING, VISITED, FINALIST, DISCARDED
  --minScore NUM       Minimum score (0-100)
  --maxScore NUM       Maximum score (0-100)
  --hasComments        Only listings with comments
  --rating NUM         Filter by star rating (1-5)
  --favorite           Only favorite listings
  --updatedSince DATE  Only modified after this date (ISO-8601)

Pagination:
  --page NUM           Page number (default: 1)
  --limit NUM          Results per page (default: 50)
  --sortBy FIELD       Sort by: lastSeenAt, price, areaM2, score, createdAt, updatedAt
  --sortDir DIR        Sort direction: asc or desc (default: desc)

Output:
  --output FORMAT      Output format: json, table, csv (default: json)

Examples:
  node search-listings.js --minPrice 400000 --maxPrice 700000 --rooms 3
  node search-listings.js --listingStatus VISITED --output table
  node search-listings.js --minScore 80 --limit 10
`);
  process.exit(0);
}

// Build filters
const filters = {
  minPrice: args.minPrice,
  maxPrice: args.maxPrice,
  minArea: args.minArea,
  maxArea: args.maxArea,
  rooms: args.rooms,
  source: args.portal || args.source,
  status: args.status,
  listingStatus: args.listingStatus,
  hasComments: args.hasComments ? 'true' : undefined,
  rating: args.rating,
  favorite: args.favorite ? 'true' : undefined,
  updatedSince: args.updatedSince,
  page: args.page || 1,
  limit: args.limit || 50,
  sortBy: args.sortBy,
  sortDir: args.sortDir,
};

// Remove undefined values
Object.keys(filters).forEach(k => filters[k] === undefined && delete filters[k]);

const outputFormat = (args.output || 'json').toLowerCase();

// Format functions
function formatAsJSON(listings, pagination) {
  console.log(JSON.stringify({ data: listings, pagination }, null, 2));
}

function formatAsTable(listings) {
  if (listings.length === 0) {
    console.log('No listings found.');
    return;
  }
  
  const headers = ['ID', 'Title', 'Price', 'Area', 'Rooms', 'Portal', 'Status', 'Score'];
  const widths = [8, 35, 12, 8, 6, 8, 12, 6];
  
  // Header
  console.log(headers.map((h, i) => h.padEnd(widths[i])).join(' | '));
  console.log('-'.repeat(widths.reduce((a, b) => a + b + 3, 0)));
  
  // Rows
  listings.forEach(l => {
    const row = [
      (l.id || '').substring(0, 8),
      (l.title || '').substring(0, 35),
      (l.price?.toLocaleString() || 'N/A').padStart(12),
      (l.areaM2 ? `${l.areaM2}m²` : 'N/A').padStart(8),
      String(l.rooms || '-').padStart(6),
      (l.source || '-').padEnd(8),
      (l.userState?.status || 'FOUND').padEnd(12),
      String(l.score ?? '-').padStart(6),
    ];
    console.log(row.join(' | '));
  });
}

function formatAsCSV(listings) {
  const headers = ['id', 'title', 'price', 'areaM2', 'rooms', 'portal', 'neighborhood', 'status', 'score', 'url'];
  console.log(headers.join(','));
  
  listings.forEach(l => {
    const row = headers.map(h => {
      let val;
      if (h === 'status') val = l.userState?.status || 'FOUND';
      else if (h === 'portal') val = l.source;
      else if (h === 'url') val = l.canonicalUrl;
      else val = l[h];
      // Escape commas and quotes
      if (typeof val === 'string' && (val.includes(',') || val.includes('"'))) {
        val = `"${val.replace(/"/g, '""')}"`;
      }
      return val ?? '';
    });
    console.log(row.join(','));
  });
}

// Apply score filter (client-side since API doesn't support it yet)
function filterByScore(listings, minScore, maxScore) {
  if (!minScore && !maxScore) return listings;
  return listings.filter(l => {
    const score = l.score;
    if (score === null || score === undefined) return false;
    if (minScore && score < minScore) return false;
    if (maxScore && score > maxScore) return false;
    return true;
  });
}

(async () => {
  try {
    const result = await api.searchListings(filters);
    let listings = Array.isArray(result) ? result : result.data || [];
    const pagination = result.pagination || { page: filters.page, limit: filters.limit, total: listings.length };
    
    // Apply score filter client-side
    listings = filterByScore(listings, args.minScore, args.maxScore);
    
    switch (outputFormat) {
      case 'table':
        formatAsTable(listings);
        break;
      case 'csv':
        formatAsCSV(listings);
        break;
      default:
        formatAsJSON(listings, pagination);
    }
  } catch (error) {
    console.error('Error:', error.message);
    if (error.body) console.error('Details:', error.body);
    process.exit(1);
  }
})();
