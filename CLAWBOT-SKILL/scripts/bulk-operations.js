#!/usr/bin/env node

/**
 * Bulk delete listings by criteria (only FOUND status allowed)
 */

const api = require('./poznan-api-updated');
const args = require('minimist')(process.argv.slice(2));

// Validation
const action = args._[0];
if (!action || action !== 'delete') {
  console.error('Usage: node bulk-operations.js delete [--status STATUS] [--priceMin N] [--priceMax N] [--areaMin N] [--areaMax N] [--portal P] [--city C] [--daysOld N] [--dryRun true]');
  console.error('\nExample - preview deletion:');
  console.error('  node bulk-operations.js delete --status FOUND --priceMax 400000 --dryRun true');
  console.error('\nExample - delete:');
  console.error('  node bulk-operations.js delete --status FOUND --priceMax 400000');
  console.error('\n⚠️  Safety: Only FOUND status apartments can be deleted');
  process.exit(1);
}

(async () => {
  try {
    // Build criteria
    const criteria = {};

    if (args.status) criteria.status = args.status;
    if (args.priceMin) criteria.priceMin = parseInt(args.priceMin);
    if (args.priceMax) criteria.priceMax = parseInt(args.priceMax);
    if (args.areaMin) criteria.areaMin = parseInt(args.areaMin);
    if (args.areaMax) criteria.areaMax = parseInt(args.areaMax);
    if (args.portal) criteria.portal = args.portal;
    if (args.city) criteria.city = args.city;
    if (args.daysOld) criteria.daysOld = parseInt(args.daysOld);

    // Default to FOUND if not specified
    if (!criteria.status) {
      criteria.status = 'FOUND';
    }

    if (Object.keys(criteria).length === 0 && criteria.status === 'FOUND') {
      console.warn('⚠️  Warning: Will delete ALL FOUND apartments. Are you sure?');
      console.warn('   Use --dryRun true to preview first');
      console.warn('   Use filters to narrow down: --priceMax 400000, --portal olx, etc.');
      process.exit(1);
    }

    if (args.dryRun === 'true' || args.dryRun === true) {
      console.log('🔍 DRY RUN - showing what would be deleted:\n');
      console.log('Criteria:', JSON.stringify(criteria, null, 2));
      console.log('\n(This is a preview only - nothing will be deleted)');
      console.log('\nTo actually delete, run without --dryRun flag');
      return;
    }

    console.log('⏳ Deleting listings matching criteria...');
    console.log('Criteria:', JSON.stringify(criteria, null, 2));
    const result = await api.bulkDeleteListings(criteria);

    console.log('\n✅ Deleted successfully:');
    console.log(`   Deleted: ${result.deletedCount} listings`);
    if (result.preventedCount) {
      console.log(`   ⚠️  Prevented: ${result.preventedCount} non-FOUND listings (safety protection)`);
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.body) console.error('Details:', error.body);
    process.exit(1);
  }
})();
