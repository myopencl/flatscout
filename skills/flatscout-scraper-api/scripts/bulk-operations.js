#!/usr/bin/env node

const api = require('./poznan-api-updated');
const args = require('minimist')(process.argv.slice(2));

const action = args._[0];
if (!action || action !== 'delete') {
  console.error('Usage: node bulk-operations.js delete [--status STATUS] [--priceMin N] [--priceMax N] [--areaMin N] [--areaMax N] [--portal P] [--city C] [--daysOld N] [--dryRun true]');
  process.exit(1);
}

(async () => {
  try {
    const criteria = {};
    if (args.status) criteria.status = args.status;
    if (args.priceMin) criteria.priceMin = parseInt(args.priceMin, 10);
    if (args.priceMax) criteria.priceMax = parseInt(args.priceMax, 10);
    if (args.areaMin) criteria.areaMin = parseInt(args.areaMin, 10);
    if (args.areaMax) criteria.areaMax = parseInt(args.areaMax, 10);
    if (args.portal) criteria.portal = args.portal;
    if (args.city) criteria.city = args.city;
    if (args.daysOld) criteria.daysOld = parseInt(args.daysOld, 10);
    if (!criteria.status) criteria.status = 'FOUND';

    if (args.dryRun === 'true' || args.dryRun === true) {
      console.log(JSON.stringify({ dryRun: true, criteria }, null, 2));
      return;
    }

    const result = await api.bulkDeleteListings(criteria);
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Error:', error.message);
    if (error.body) console.error('Details:', error.body);
    process.exit(1);
  }
})();
