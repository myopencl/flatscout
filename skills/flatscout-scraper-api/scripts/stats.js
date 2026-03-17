#!/usr/bin/env node

/**
 * Market Analytics Script
 * Generate statistics about searches and apartment hunt.
 */

const api = require('./poznan-api');
const args = require('minimist')(process.argv.slice(2), {
  boolean: ['help'],
  alias: { h: 'help' }
});

if (args.help) {
  console.log(`
Usage: node stats.js [options]

Actions:
  --action STR   Action to perform: overview, by-status, searches, timeline (default: overview)
  --days NUM     Days to analyze for timeline (default: 30)
  --format STR   Output format: json, markdown, table (default: json)

Examples:
  node stats.js --action overview
  node stats.js --action by-status --format table
  node stats.js --action timeline --days 7
`);
  process.exit(0);
}

const action = args.action || 'overview';
const format = args.format || 'json';
const days = args.days || 30;

function formatMarkdown(result, action) {
  if (!result) return 'No data available.';
  
  switch (action) {
    case 'by-status':
      let md = '## Listings by Status\n\n';
      for (const [status, count] of Object.entries(result)) {
        md += `- **${status}**: ${count}\n`;
      }
      return md;
      
    case 'searches':
      let smd = '## Saved Searches\n\n';
      if (Array.isArray(result)) {
        result.forEach(s => {
          smd += `### ${s.name || s.id}\n`;
          smd += `- Portal: ${s.portal || 'N/A'}\n`;
          smd += `- Enabled: ${s.enabled ? 'Yes' : 'No'}\n`;
          smd += `- Total listings: ${s.totalListings || 'N/A'}\n\n`;
        });
      }
      return smd;
      
    case 'timeline':
      let tmd = '## Activity Timeline\n\n';
      if (Array.isArray(result)) {
        result.forEach(e => {
          tmd += `- **${e.date || e.createdAt}**: ${e.eventType || e.type} (${e.count || 1})\n`;
        });
      }
      return tmd;
      
    default:
      let omd = '## Overview\n\n';
      for (const [key, value] of Object.entries(result)) {
        if (typeof value === 'object') continue;
        omd += `- **${key}**: ${value}\n`;
      }
      return omd;
  }
}

function formatTable(result, action) {
  if (!result) return 'No data available.';
  
  switch (action) {
    case 'by-status':
      console.log('Status            | Count');
      console.log('-'.repeat(30));
      for (const [status, count] of Object.entries(result)) {
        console.log(`${status.padEnd(18)}| ${count}`);
      }
      break;
      
    default:
      console.log(JSON.stringify(result, null, 2));
  }
}

(async () => {
  try {
    let result;
    switch (action) {
      case 'by-status':
        result = await api.getListingsByStatus();
        break;
      case 'searches':
        result = await api.getSearchesSummary();
        break;
      case 'timeline':
        result = await api.getActivityTimeline(days);
        break;
      case 'overview':
      default:
        result = await api.getOverviewStats();
    }

    if (format === 'json') {
      console.log(JSON.stringify(result, null, 2));
    } else if (format === 'markdown') {
      console.log(formatMarkdown(result, action));
    } else if (format === 'table') {
      formatTable(result, action);
    }
  } catch (error) {
    console.error('Error:', error.message);
    if (error.body) console.error('Details:', error.body);
    process.exit(1);
  }
})();
