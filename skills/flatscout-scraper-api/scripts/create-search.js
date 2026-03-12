#!/usr/bin/env node

/**
 * Create Saved Search (Enhanced)
 * Create automated searches with full support for all filter parameters
 * Can parse URLs from Otodom/OLX directly
 */

const api = require('./poznan-api');

// Parse command-line arguments
const args = {};
for (let i = 2; i < process.argv.length; i += 2) {
 const key = process.argv[i].replace(/^--/, '');
 const value = process.argv[i + 1];
 if (value && !value.startsWith('--')) {
 // Try to parse as JSON if it looks like JSON (for mapBounds)
 if (value.startsWith('{') && value.endsWith('}')) {
 try {
 args[key] = JSON.parse(value);
 } catch (e) {
 args[key] = isNaN(value) ? value : Number(value);
 }
 } else if (value === 'true') {
 args[key] = true;
 } else if (value === 'false') {
 args[key] = false;
 } else {
 args[key] = isNaN(value) ? value : Number(value);
 }
 }
}

// Validate required arguments
if (!args.name || !args.portal) {
 console.error(`
📋 Create Saved Search - Enhanced

Usage: node create-search.js --name "NAME" --portal PORTAL [OPTIONS]

REQUIRED:
 --name STR Name of the search
 --portal STR Portal: 'immohouse', 'olx', 'otodom'

BASIC FILTERS:
 --operation STR 'buy' or 'rent' (default: 'buy')
 --city STR City name (default: 'Poznań')
 --rooms NUM Number of rooms (1-5)
 --minPrice NUM Minimum price in PLN
 --maxPrice NUM Maximum price in PLN
 --minArea NUM Minimum area in m²
 --maxArea NUM Maximum area in m²

ADVANCED FILTERS:
 --radiusKm NUM Search radius in km (for distance-based searches)
 --placeId STR Google Maps place ID (for distance-based searches)
 --districtId STR OLX district ID
 --mapBounds JSON Map bounds as JSON: '{"west":16.9,"south":52.3,"east":16.8,"north":52.4}'
 --sortBy STR Sort by: 'DEFAULT', 'price', 'area', 'rooms', etc.
 --sortDirection STR 'ASC' or 'DESC' (default: 'DESC')
 --resultsPerPage NUM Limit results per page
 --ownerType STR Owner type filter

CUSTOM URL (advanced):
 --customUrl STR Use this exact URL (ignores all other filters)

SCHEDULE:
 --frequencyMinutes NUM How often to run (minutes, default: 1440/daily)
 --enabled BOOL Start enabled (true/false, default: true)

EXAMPLES:

1. Basic search:
 node create-search.js \
 --name "3-room apartments €450k-€650k" \
 --portal olx \
 --rooms 3 \
 --minPrice 450000 \
 --maxPrice 650000

2. Distance-based search (Otodom):
 node create-search.js \
 --name "Within 2km of city center" \
 --portal otodom \
 --radiusKm 2000 \
 --placeId "ChIJe_X2eohbBEcRLij13o6MmOM" \
 --minPrice 400000 \
 --maxPrice 650000

3. OLX with district:
 node create-search.js \
 --name "City center apartments" \
 --portal olx \
 --districtId 325 \
 --rooms 3

4. Map bounds search:
 node create-search.js \
 --name "Stare Miasto area" \
 --portal otodom \
 --mapBounds '{"west":16.99,"south":52.37,"east":16.84,"north":52.44}' \
 --priceMax 700000

5. Hourly monitoring:
 node create-search.js \
 --name "Hourly: Best deals" \
 --portal all \
 --frequencyMinutes 60 \
 --minPrice 400000 \
 --maxPrice 700000

6. Custom URL (use exact URL from browser):
 node create-search.js \
 --name "From browser" \
 --portal otodom \
 --customUrl "https://www.otodom.pl/pl/wyniki/sprzedaz/mieszkanie,3-pokoje/cala-polska?distanceRadius=2000&placeId=ChIJe_X2eohbBEcRLij13o6MmOM&priceMin=400000&priceMax=650000"
 `);
 process.exit(1);
}

// Build filters object with all supported parameters
const filters = {
 operation: args.operation || 'buy',
 propertyType: args.propertyType || 'flat',
};

// Basic filters
if (args.city) filters.city = args.city;
else filters.city = 'Poznań'; // Default city

if (args.region) filters.region = args.region;
if (args.rooms) filters.rooms = parseInt(args.rooms);
if (args.minPrice) filters.priceMin = parseInt(args.minPrice);
if (args.maxPrice) filters.priceMax = parseInt(args.maxPrice);
if (args.minArea) filters.areaMin = parseInt(args.minArea);
if (args.maxArea) filters.areaMax = parseInt(args.maxArea);

// Advanced filters
if (args.radiusKm) filters.radiusKm = parseInt(args.radiusKm);
if (args.placeId) filters.placeId = args.placeId;
if (args.districtId) filters.districtId = args.districtId;
if (args.mapBounds) filters.mapBounds = args.mapBounds;
if (args.ownerType) filters.ownerType = args.ownerType;
if (args.sortBy) filters.sortBy = args.sortBy;
if (args.sortDirection) filters.sortDirection = args.sortDirection;
if (args.resultsPerPage) filters.resultsPerPage = parseInt(args.resultsPerPage);

// Custom URL (if provided, use it directly instead of building from filters)
if (args.customUrl) filters.customSearchUrl = args.customUrl;

// Build search config
const config = {
 name: args.name,
 portal: args.portal.toLowerCase(),
 filters,
 frequencyMinutes: args.frequencyMinutes ? parseInt(args.frequencyMinutes) : 1440,
 enabled: args.enabled !== false, // Default: true
};

// Main function
(async () => {
 try {
 console.error(`\n📝 Creating saved search...\n`);
 console.error(`Name: ${config.name}`);
 console.error(`Portal: ${config.portal}`);
 console.error(`Frequency: Every ${config.frequencyMinutes} minutes`);
 console.error(`Status: ${config.enabled ? '✅ Enabled' : '⏸️ Disabled'}`);
 console.error(`\nFilters:`, JSON.stringify(config.filters, null, 2));
 console.error();

 const result = await api.createSearch(config);

 console.log(JSON.stringify(result, null, 2));

 console.error();
 console.error(`✅ Search created successfully!\n`);
 console.error(`ID: ${result.id}`);
 console.error(`Name: ${result.name}`);
 console.error(`Portal: ${result.portal}`);
 console.error();
 console.error(`Next steps:`);
 console.error(`1. View listings from search:`);
 console.error(` node scripts/search-listings.js --minPrice ${filters.priceMin || 'AUTO'} --maxPrice ${filters.priceMax || 'AUTO'}`);
 console.error();
 console.error(`2. Manually trigger this search:`);
 console.error(` node scripts/manage-listings.js --listingId <id> --status SEEN`);
 console.error();
 console.error(`3. List all searches:`);
 console.error(` node scripts/search-listings.js | grep -i search`);
 console.error();
 } catch (error) {
 console.error('❌ Error creating search:', error.message);
 if (error.body) console.error('Details:', error.body);
 process.exit(1);
 }
})();
