#!/usr/bin/env node

/**
 * Parse URL to Search
 * Extract search parameters from Otodom/OLX URLs and create saved searches
 *
 * This allows users to copy a URL from their browser and turn it into a saved search
 */

const api = require('./poznan-api');
const fs = require('fs');

const args = process.argv.slice(2);
const url = args[0];
const searchName = args[1];

if (!url) {
  console.error(`
🔗 Parse URL to Saved Search

Extracts search parameters from Otodom/OLX URLs and creates a saved search

Usage: node parse-url-to-search.js "<URL>" ["Search Name"]

Examples:

1. Otodom URL with distance radius:
   node parse-url-to-search.js \\
     "https://www.otodom.pl/pl/wyniki/sprzedaz/mieszkanie,3-pokoje/cala-polska?distanceRadius=2000&placeId=ChIJe_X2eohbBEcRLij13o6MmOM&priceMin=400000&priceMax=650000" \\
     "3-room within 2km"

2. OLX URL with district:
   node parse-url-to-search.js \\
     "https://www.olx.pl/nieruchomosci/mieszkania/sprzedaz/poznan/?search[district_id]=325&search[filter_float_price:from]=400000" \\
     "Poznan city center"

3. Simple Otodom URL:
   node parse-url-to-search.js \\
     "https://www.otodom.pl/pl/wyniki/sprzedaz/mieszkanie/wielkopolskie/poznan?priceMin=400000&priceMax=700000"

The script will:
1. Parse the URL and extract all filter parameters
2. Detect portal (otodom, olx, immohouse)
3. Create a saved search with the extracted filters
4. Show you the configuration before confirming
  `);
  process.exit(1);
}

/**
 * Parse Otodom URL
 */
function parseOtodomUrl(urlStr) {
  const url = new URL(urlStr);
  const filters = {
    operation: url.pathname.includes('/wynajem/') ? 'rent' : 'buy',
    propertyType: 'flat',
  };

  // Extract rooms from path (e.g., "mieszkanie,3-pokoje")
  const pathMatch = url.pathname.match(/mieszkanie(?:,(\d+)-pokoje)?/);
  if (pathMatch && pathMatch[1]) {
    filters.rooms = parseInt(pathMatch[1]);
  }

  // Extract city/location from path or query
  const pathParts = url.pathname.split('/').filter(p => p);
  if (pathParts.includes('cala-polska')) {
    // This is a distance-based search
  } else {
    // Try to extract city from path
    const cityIdx = pathParts.indexOf('mieszkanie') || pathParts.indexOf('mieszkanie,3-pokoje');
    if (cityIdx !== -1 && cityIdx + 2 < pathParts.length) {
      filters.city = decodeURIComponent(pathParts[cityIdx + 2]);
    }
  }

  // Query parameters
  if (url.searchParams.get('priceMin')) filters.priceMin = parseInt(url.searchParams.get('priceMin'));
  if (url.searchParams.get('priceMax')) filters.priceMax = parseInt(url.searchParams.get('priceMax'));
  if (url.searchParams.get('areaMin')) filters.areaMin = parseInt(url.searchParams.get('areaMin'));
  if (url.searchParams.get('areaMax')) filters.areaMax = parseInt(url.searchParams.get('areaMax'));
  if (url.searchParams.get('distanceRadius')) filters.radiusKm = parseInt(url.searchParams.get('distanceRadius'));
  if (url.searchParams.get('placeId')) filters.placeId = url.searchParams.get('placeId');
  if (url.searchParams.get('limit')) filters.resultsPerPage = parseInt(url.searchParams.get('limit'));
  if (url.searchParams.get('by')) filters.sortBy = url.searchParams.get('by');
  if (url.searchParams.get('direction')) filters.sortDirection = url.searchParams.get('direction');
  if (url.searchParams.get('ownerTypeSingleSelect')) filters.ownerType = url.searchParams.get('ownerTypeSingleSelect');

  // Parse mapBounds if present
  if (url.searchParams.get('mapBounds')) {
    const boundsStr = url.searchParams.get('mapBounds');
    const parts = boundsStr.split(',');
    if (parts.length === 4) {
      filters.mapBounds = {
        west: parseFloat(parts[0]),
        north: parseFloat(parts[1]),
        east: parseFloat(parts[2]),
        south: parseFloat(parts[3]),
      };
    }
  }

  return { portal: 'otodom', filters };
}

/**
 * Parse OLX URL
 */
function parseOlxUrl(urlStr) {
  const url = new URL(urlStr);
  const filters = {
    operation: url.pathname.includes('/wynajem/') ? 'rent' : 'buy',
    propertyType: 'flat',
  };

  // Extract city from path
  const pathParts = url.pathname.split('/').filter(p => p);
  const cityIdx = pathParts.indexOf('sprzedaz') || pathParts.indexOf('wynajem');
  if (cityIdx !== -1 && cityIdx + 1 < pathParts.length) {
    filters.city = decodeURIComponent(pathParts[cityIdx + 1])
      .replace(/-/g, ' ')
      .split(' ')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }

  // Search parameters (OLX uses search[...] format)
  const priceFrom = url.searchParams.get('search[filter_float_price:from]');
  const priceTo = url.searchParams.get('search[filter_float_price:to]');
  const areaFrom = url.searchParams.get('search[filter_float_m:from]');
  const areaTo = url.searchParams.get('search[filter_float_m:to]');
  const rooms = url.searchParams.get('search[filter_enum_rooms][0]');
  const districtId = url.searchParams.get('search[district_id]');
  const dist = url.searchParams.get('search[dist]');
  const order = url.searchParams.get('search[order]');

  if (priceFrom) filters.priceMin = parseInt(priceFrom);
  if (priceTo) filters.priceMax = parseInt(priceTo);
  if (areaFrom) filters.areaMin = parseInt(areaFrom);
  if (areaTo) filters.areaMax = parseInt(areaTo);
  if (districtId) filters.districtId = districtId;
  if (dist) filters.radiusKm = parseInt(dist);

  // Parse rooms (OLX uses "one", "two", "three", etc.)
  const roomsMap = { 'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5 };
  if (rooms && roomsMap[rooms]) {
    filters.rooms = roomsMap[rooms];
  }

  // Parse order (e.g., "created_at:desc")
  if (order) {
    const [sortBy, direction] = order.split(':');
    if (sortBy) filters.sortBy = sortBy;
    if (direction) filters.sortDirection = direction.toUpperCase();
  }

  return { portal: 'olx', filters };
}

/**
 * Detect portal from URL
 */
function detectPortal(urlStr) {
  if (urlStr.includes('otodom.pl')) return 'otodom';
  if (urlStr.includes('olx.pl')) return 'olx';
  if (urlStr.includes('immohouse.pl')) return 'immohouse';
  return null;
}

// Main function
(async () => {
  try {
    console.error(`\n🔗 Parsing URL...\n`);

    const portal = detectPortal(url);
    if (!portal) {
      throw new Error(`Unknown portal. URL must be from: otodom.pl, olx.pl, or immohouse.pl`);
    }

    console.error(`✓ Detected portal: ${portal}`);

    let result;
    if (portal === 'otodom') {
      result = parseOtodomUrl(url);
    } else if (portal === 'olx') {
      result = parseOlxUrl(url);
    } else {
      throw new Error(`Parser for ${portal} not yet implemented`);
    }

    const defaultName = searchName || `${result.portal} - ${new Date().toLocaleDateString()}`;

    console.error(`\n📋 Extracted filters:\n`);
    console.error(JSON.stringify(result.filters, null, 2));
    console.error();

    // Create the search
    const config = {
      name: defaultName,
      portal: result.portal,
      filters: result.filters,
      frequencyMinutes: 1440, // Daily by default
    };

    console.error(`Creating search: "${config.name}"`);
    console.error();

    const created = await api.createSearch(config);

    console.log(JSON.stringify(created, null, 2));

    console.error();
    console.error(`✅ Search created successfully!\n`);
    console.error(`ID: ${created.id}`);
    console.error(`Name: ${created.name}`);
    console.error(`Portal: ${created.portal}`);
    console.error(`Frequency: Daily\n`);
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.body) console.error('Details:', error.body);
    process.exit(1);
  }
})();
