#!/usr/bin/env node

/**
 * Import Listing from URL Script
 * Fetch a listing from a direct portal URL and insert it into the scraper DB.
 */

const api = require('./poznan-api');
const args = require('minimist')(process.argv.slice(2), {
  boolean: ['help'],
  alias: { h: 'help', u: 'url' }
});

if (args.help || !args.url) {
  console.log(`
Usage: node import-listing-from-url.js --url <URL> [options]

Arguments:
  --url URL        Direct listing URL (required)
  --source STR     Explicit source: otodom, olx, immohouse (auto-detected if not specified)
  --searchId ID    Optional search UUID to associate
  --status STR     Initial user status (e.g., FOUND)
  --tags STR       Comma-separated tags

Examples:
  node import-listing-from-url.js --url "https://www.otodom.pl/pl/oferta/..."
  node import-listing-from-url.js -u "https://www.olx.pl/d/oferta/..." --status SEEN

Supported portals:
  - Otodom (otodom.pl)
  - OLX (olx.pl)
  - Immohouse (immohouse.pl)
`);
  process.exit(args.help ? 0 : 1);
}

// Detect portal from URL
function detectPortal(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.includes('otodom.pl')) return 'otodom';
    if (host.includes('olx.pl')) return 'olx';
    if (host.includes('immohouse')) return 'immohouse';
    return null;
  } catch {
    return null;
  }
}

(async () => {
  const url = args.url;
  const source = args.source || detectPortal(url);
  
  if (!source) {
    console.error('Error: Could not detect portal from URL. Use --source to specify.');
    process.exit(1);
  }
  
  console.log(`Importing listing from ${source}...`);
  console.log(`URL: ${url}`);
  
  try {
    const options = {
      url,
      source,
      searchId: args.searchId,
      status: args.status,
      tags: args.tags ? args.tags.split(',').map(t => t.trim()) : undefined
    };
    
    const result = await api.importListingFromUrl(url, options);
    
    if (result.alreadyExists) {
      console.log('\n⚠️  Listing already exists in database.');
      console.log(JSON.stringify(result.listing, null, 2));
    } else {
      console.log('\n✅ Listing imported successfully.');
      console.log(JSON.stringify(result.listing, null, 2));
    }
  } catch (error) {
    console.error('\n❌ Import failed:', error.message);
    if (error.body) console.error('Details:', error.body);
    process.exit(1);
  }
})();