#!/usr/bin/env node

/**
 * Manage apartment states: track visits, add notes, ratings
 */

const api = require('./poznan-api-updated');
const args = require('minimist')(process.argv.slice(2));

// Validation
if (!args.listingId) {
  console.error('Usage: node manage-listings.js --listingId ID [--action get|update] [--status STATUS] [--comments TEXT] [--rating 1-5] [--visitDate ISO-DATE] [--pros "item1, item2"] [--cons "item1, item2"]');
  console.error('\nStatuses: FOUND, SEEN, VISIT_PENDING, VISITED, FINALIST, DISCARDED');
  console.error('\nExample - view state:');
  console.error('  node manage-listings.js --listingId abc123 --action get');
  console.error('\nExample - mark as visited with notes:');
  console.error('  node manage-listings.js --listingId abc123 --status VISITED --rating 4 --visitDate 2026-03-07 --pros "Good location, modern" --cons "No parking"');
  process.exit(1);
}

const listingId = args.listingId;
const action = args.action || 'update';

(async () => {
  try {
    if (action === 'get') {
      // Get current state
      const state = await api.getListingState(listingId);
      console.log('\n📋 Listing State:');
      console.log(JSON.stringify(state, null, 2));
    } else if (action === 'update') {
      // Build update object
      const update = {};

      if (args.status) update.status = args.status;
      if (args.comments) update.comments = args.comments;
      if (args.visitDate) update.visitDate = args.visitDate;
      if (args.rating) update.rating = parseInt(args.rating);

      // Parse pros/cons from comma-separated strings
      if (args.pros) {
        update.pros = args.pros.split(',').map(s => s.trim()).filter(s => s);
      }
      if (args.cons) {
        update.cons = args.cons.split(',').map(s => s.trim()).filter(s => s);
      }

      if (Object.keys(update).length === 0) {
        console.error('Error: No updates specified. Use --status, --comments, --rating, --visitDate, --pros, or --cons');
        process.exit(1);
      }

      console.log('⏳ Updating listing state...');
      const result = await api.updateListingState(listingId, update);
      console.log('\n✅ Updated successfully:');
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.error(`Unknown action: ${action}`);
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.body) console.error('Details:', error.body);
    process.exit(1);
  }
})();
