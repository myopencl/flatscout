#!/usr/bin/env node

/**
 * Update Listing Coordinates Script
 * Correct incorrect coordinates for a listing.
 */

const api = require('./poznan-api');
const args = require('minimist')(process.argv.slice(2), {
  boolean: ['help', 'clear'],
  alias: { h: 'help' }
});

if (args.help || !args.listingId) {
  console.log(`
Usage: node update-coordinates.js --listingId ID [options]

Arguments:
  --listingId ID    Listing UUID (required)
  --lat NUMBER      Latitude (-90 to 90)
  --lon NUMBER      Longitude (-180 to 180)
  --clear           Clear coordinates (set to null)

Examples:
  # Set coordinates
  node update-coordinates.js --listingId abc123 --lat 52.4084 --lon 16.9245

  # Clear coordinates
  node update-coordinates.js --listingId abc123 --clear

  # Use interactive mode (agent will help)
  node update-coordinates.js --listingId abc123
`);
  process.exit(args.help ? 0 : 1);
}

const listingId = args.listingId;

(async () => {
  try {
    let coords;
    
    if (args.clear) {
      coords = { lat: null, lon: null };
      console.log(`Clearing coordinates for listing ${listingId}...`);
    } else if (args.lat !== undefined && args.lon !== undefined) {
      coords = { 
        lat: parseFloat(args.lat), 
        lon: parseFloat(args.lon) 
      };
      console.log(`Setting coordinates for listing ${listingId}:`);
      console.log(`  lat: ${coords.lat}`);
      console.log(`  lon: ${coords.lon}`);
    } else {
      console.error('Error: Provide --lat and --lon, or use --clear');
      process.exit(1);
    }

    const result = await api.updateListingCoordinates(listingId, coords);
    console.log('\n✅ Coordinates updated successfully');
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('\n❌ Update failed:', error.message);
    if (error.body) console.error('Details:', error.body);
    process.exit(1);
  }
})();