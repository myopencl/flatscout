#!/usr/bin/env node

/**
 * Search & Filter Listings
 * Query real estate listings with filters and output formatting
 */

const api = require('./poznan-api');

// Parse command-line arguments
const args = {};
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i].replace(/^--/, '');
  const value = process.argv[i + 1];
  if (value && !value.startsWith('--')) {
    args[key] = isNaN(value) ? value : Number(value);
  }
}

// Map CLI args to API params
const filters = {
  minPrice: args.minPrice,
  maxPrice: args.maxPrice,
  minArea: args.minArea,
  maxArea: args.maxArea,
  rooms: args.rooms,
  source: args.source || args.portal,
  status: args.status,
  updatedSince: args.updatedSince,
  page: args.page || 1,
  limit: args.limit || 50,
};

// Remove undefined values
Object.keys(filters).forEach(k => {
  if (filters[k] === undefined) delete filters[k];
});

const outputFormat = args.output || 'json';

// Output formatters
function formatAsTable(listings) {
  if (listings.length === 0) {
    console.log('No listings found.');
    return;
  }

  const headers = ['Portal', 'Price (PLN)', 'Area (m²)', 'Rooms', 'Location', 'Price/m²', 'Status'];
  const rows = listings.map(l => [
    l.portal.toUpperCase(),
    l.price ? l.price.toLocaleString('pl-PL') : 'N/A',
    l.area || 'N/A',
    l.rooms || 'N/A',
    l.location || 'N/A',
    l.area && l.price ? Math.round(l.price / l.area).toLocaleString('pl-PL') : 'N/A',
    l.status.toUpperCase(),
  ]);

  // Calculate column widths
  const widths = headers.map((h, i) => {
    const maxRowWidth = Math.max(...rows.map(r => String(r[i]).length));
    return Math.max(h.length, maxRowWidth) + 2;
  });

  // Print header
  console.log('┌' + widths.map(w => '─'.repeat(w - 2)).join('┬') + '┐');
  console.log('│ ' + headers.map((h, i) => h.padEnd(widths[i] - 2)).join('│ ') + ' │');
  console.log('├' + widths.map(w => '─'.repeat(w - 2)).join('┼') + '┤');

  // Print rows
  rows.forEach(row => {
    console.log('│ ' + row.map((r, i) => String(r).padEnd(widths[i] - 2)).join('│ ') + ' │');
  });

  console.log('└' + widths.map(w => '─'.repeat(w - 2)).join('┴') + '┘');
}

function formatAsCSV(listings) {
  if (listings.length === 0) {
    console.log('No listings found.');
    return;
  }

  // CSV header
  const headers = ['id', 'portal', 'title', 'price', 'area', 'rooms', 'location', 'pricePerM2', 'status', 'portalUrl', 'dateDiscovered'];
  console.log(headers.join(','));

  // CSV rows
  listings.forEach(l => {
    const row = [
      l.id || '',
      l.portal || '',
      `"${(l.title || '').replace(/"/g, '""')}"`,
      l.price || '',
      l.area || '',
      l.rooms || '',
      `"${(l.location || '').replace(/"/g, '""')}"`,
      l.pricePerM2 ? Math.round(l.pricePerM2) : '',
      l.status || '',
      l.portalUrl || '',
      l.dateDiscovered || '',
    ];
    console.log(row.join(','));
  });
}

function formatAsJSON(listings) {
  console.log(JSON.stringify(listings, null, 2));
}

function formatAsMarkdown(listings) {
  if (listings.length === 0) {
    console.log('No listings found.');
    return;
  }

  console.log('# Search Results\n');
  console.log(`Total listings: ${listings.length}\n`);

  listings.forEach((l, i) => {
    console.log(`## ${i + 1}. ${l.title || 'Untitled'}`);
    console.log(`- **Portal:** ${l.portal.toUpperCase()}`);
    console.log(`- **Price:** ${l.price ? l.price.toLocaleString('pl-PL') : 'N/A'} PLN`);
    console.log(`- **Area:** ${l.area || 'N/A'} m²`);
    console.log(`- **Rooms:** ${l.rooms || 'N/A'}`);
    console.log(`- **Price/m²:** ${l.pricePerM2 ? Math.round(l.pricePerM2).toLocaleString('pl-PL') : 'N/A'} PLN`);
    console.log(`- **Location:** ${l.location || 'N/A'}`);
    console.log(`- **Status:** ${l.status.toUpperCase()}`);
    console.log(`- **Discovered:** ${l.dateDiscovered ? new Date(l.dateDiscovered).toLocaleString('pl-PL') : 'N/A'}`);
    if (l.portalUrl) console.log(`- **URL:** [View on ${l.portal}](${l.portalUrl})`);
    console.log();
  });
}

// Main function
(async () => {
  try {
    console.error(`🔍 Searching listings...`);
    console.error(`Filters:`, filters);

    const result = await api.searchListings(filters);

    const listings = Array.isArray(result) ? result : result.data || [];
    const total = result.total || listings.length;

    console.error(`✅ Found ${listings.length} listings (${total} total)\n`);

    // Format output
    switch (outputFormat.toLowerCase()) {
      case 'table':
        formatAsTable(listings);
        break;
      case 'csv':
        formatAsCSV(listings);
        break;
      case 'markdown':
      case 'md':
        formatAsMarkdown(listings);
        break;
      case 'json':
      default:
        formatAsJSON(listings);
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.body) console.error('Details:', error.body);
    process.exit(1);
  }
})();
