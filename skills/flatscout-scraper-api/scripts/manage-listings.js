#!/usr/bin/env node

const api = require('./poznan-api-updated');
const args = require('minimist')(process.argv.slice(2));

if (!args.listingId) {
  console.error('Usage: node manage-listings.js --listingId ID [--action get|update] [--status STATUS] [--comments TEXT] [--rating 1-5] [--visitDate ISO-DATE] [--pros "item1, item2"] [--cons "item1, item2"]');
  process.exit(1);
}

const listingId = args.listingId;
const action = args.action || 'update';

(async () => {
  try {
    if (action === 'get') {
      const state = await api.getListingState(listingId);
      console.log(JSON.stringify(state, null, 2));
      return;
    }

    const update = {};
    if (args.status) update.status = args.status;
    if (args.comments) update.comments = args.comments;
    if (args.visitDate) update.visitDate = args.visitDate;
    if (args.rating) update.rating = parseInt(args.rating, 10);
    if (args.pros) update.pros = args.pros.split(',').map(s => s.trim()).filter(Boolean);
    if (args.cons) update.cons = args.cons.split(',').map(s => s.trim()).filter(Boolean);

    if (Object.keys(update).length === 0) {
      console.error('Error: No updates specified');
      process.exit(1);
    }

    const result = await api.updateListingState(listingId, update);
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Error:', error.message);
    if (error.body) console.error('Details:', error.body);
    process.exit(1);
  }
})();
