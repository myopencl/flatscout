#!/usr/bin/env node

const api = require('./poznan-api-updated');
const args = require('minimist')(process.argv.slice(2));

const action = args.action || 'overview';
const format = args.format || 'markdown';
const days = args.days || 30;

(async () => {
  try {
    let result;
    switch (action) {
      case 'by-status': result = await api.getListingsByStatus(); break;
      case 'searches': result = await api.getSearchesSummary(); break;
      case 'timeline': result = await api.getActivityTimeline(days); break;
      case 'overview':
      default:
        result = await api.getOverviewStats();
    }

    if (format === 'json') {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Error:', error.message);
    if (error.body) console.error('Details:', error.body);
    process.exit(1);
  }
})();
