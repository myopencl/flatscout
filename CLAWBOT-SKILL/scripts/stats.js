#!/usr/bin/env node

/**
 * Generate market and hunt statistics
 */

const api = require('./poznan-api-updated');
const args = require('minimist')(process.argv.slice(2));

const action = args.action || 'overview';
const format = args.format || 'markdown';
const days = args.days || 30;
const output = args.output;

const fs = require('fs');

(async () => {
  try {
    let result;

    console.log('⏳ Fetching statistics...\n');

    switch (action) {
      case 'overview':
        result = await generateOverview();
        break;
      case 'by-status':
        result = await generateByStatus();
        break;
      case 'searches':
        result = await generateSearchesSummary();
        break;
      case 'timeline':
        result = await generateTimeline(days);
        break;
      default:
        console.error(`Unknown action: ${action}`);
        process.exit(1);
    }

    // Format output
    let output_str;
    if (format === 'json') {
      output_str = JSON.stringify(result, null, 2);
    } else if (format === 'markdown') {
      output_str = result;
    } else if (format === 'table') {
      output_str = result;
    } else {
      output_str = result;
    }

    console.log(output_str);

    if (output) {
      fs.writeFileSync(output, output_str, 'utf8');
      console.log(`\n✅ Saved to ${output}`);
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.body) console.error('Details:', error.body);
    process.exit(1);
  }
})();

async function generateOverview() {
  const [byStatus, searches, timeline] = await Promise.all([
    api.getListingsByStatus(),
    api.getSearchesSummary(),
    api.getActivityTimeline(7)
  ]);

  const statusStats = byStatus || {};
  const totalApartments = Object.values(statusStats).reduce((a, b) => a + b, 0);

  let md = '# 🏠 Apartment Hunt Overview\n\n';

  md += '## 📊 Your Apartment Status\n\n';
  md += `| Status | Count |\n`;
  md += `|--------|-------|\n`;
  md += `| FOUND | ${statusStats.FOUND || 0} |\n`;
  md += `| SEEN | ${statusStats.SEEN || 0} |\n`;
  md += `| VISIT_PENDING | ${statusStats.VISIT_PENDING || 0} |\n`;
  md += `| VISITED | ${statusStats.VISITED || 0} |\n`;
  md += `| FINALIST | ${statusStats.FINALIST || 0} |\n`;
  md += `| DISCARDED | ${statusStats.DISCARDED || 0} |\n`;
  md += `| **Total** | **${totalApartments}** |\n\n`;

  md += `## 🔍 Your Searches\n\n`;
  md += `You have **${searches.length || 0}** active searches.\n\n`;

  if (searches.length > 0) {
    md += '| Search Name | Total | New | Status |\n';
    md += '|-------------|-------|-----|--------|\n';
    searches.forEach(s => {
      const newCount = (s.stats?.newCount || 0);
      const total = (s.stats?.totalCount || 0);
      md += `| ${s.name} | ${total} | ${newCount} | ${s.enabled ? '✅' : '⏸️'} |\n`;
    });
  }

  return md;
}

async function generateByStatus() {
  const status = await api.getListingsByStatus();

  let md = '# 📈 Listings by Status\n\n';

  const entries = Object.entries(status).sort((a, b) => b[1] - a[1]);

  md += '| Status | Count | Percentage |\n';
  md += '|--------|-------|------------|\n';

  const total = entries.reduce((sum, [, count]) => sum + count, 0);

  entries.forEach(([stat, count]) => {
    const pct = total > 0 ? ((count / total) * 100).toFixed(1) : 0;
    md += `| ${stat} | ${count} | ${pct}% |\n`;
  });

  md += `\n**Total**: ${total} apartments`;

  return md;
}

async function generateSearchesSummary() {
  const searches = await api.getSearchesSummary();

  let md = '# 🔍 Saved Searches Summary\n\n';

  if (!searches || searches.length === 0) {
    md += 'No saved searches yet.\n';
    return md;
  }

  md += `You have **${searches.length}** saved searches.\n\n`;

  md += '| Search | Portal | Frequency | Total | New | Active | Last Run |\n';
  md += '|--------|--------|-----------|-------|-----|--------|----------|\n';

  searches.forEach(s => {
    const freq = `${s.frequencyMinutes}m`;
    const lastRun = s.lastRunAt ? new Date(s.lastRunAt).toLocaleDateString() : 'Never';
    const newCount = s.stats?.newCount || 0;
    const total = s.stats?.totalCount || 0;
    const active = s.stats?.activeCount || 0;
    md += `| ${s.name} | ${s.portal} | ${freq} | ${total} | ${newCount} | ${active} | ${lastRun} |\n`;
  });

  return md;
}

async function generateTimeline(days) {
  const timeline = await api.getActivityTimeline(days);

  let md = `# 📅 Activity Timeline (Last ${days} Days)\n\n`;

  if (!timeline || Object.keys(timeline).length === 0) {
    md += 'No activity in this period.\n';
    return md;
  }

  // Sort by date descending
  const entries = Object.entries(timeline)
    .sort((a, b) => new Date(b[0]) - new Date(a[0]));

  entries.forEach(([date, events]) => {
    md += `## ${date}\n\n`;
    if (Array.isArray(events)) {
      events.forEach(e => {
        md += `- ${e.eventType || 'event'}: ${e.details || ''}\n`;
      });
    }
    md += '\n';
  });

  return md;
}
