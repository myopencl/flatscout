#!/usr/bin/env node

/**
 * Market Analysis
 * Generate market intelligence and insights from listing data
 */

const api = require('./poznan-api');

// Parse command-line arguments
const args = {};
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i].replace(/^--/, '');
  const value = process.argv[i + 1];
  if (value && !value.startsWith('--')) {
    args[key] = isNaN(value) ? value : Number(value);
  }
}

const filters = {
  minPrice: args.minPrice,
  maxPrice: args.maxPrice,
  minArea: args.minArea,
  maxArea: args.maxArea,
  status: 'active',
  limit: 1000, // Get large dataset for analysis
};

// Remove undefined values
Object.keys(filters).forEach(k => {
  if (filters[k] === undefined) delete filters[k];
});

const format = args.format || 'markdown';
const timeframeDays = args.timeframeDays || 7;

// Calculate analysis date
const analysisDate = new Date();
analysisDate.setDate(analysisDate.getDate() - timeframeDays);
filters.updatedSince = analysisDate.toISOString();

function analyzeData(listings) {
  const analysis = {
    totalCount: listings.length,
    byPortal: {},
    byRooms: {},
    priceStats: {},
    areaStats: {},
    pricePerM2Stats: {},
  };

  // Portal breakdown
  listings.forEach(l => {
    if (!analysis.byPortal[l.portal]) {
      analysis.byPortal[l.portal] = {
        count: 0,
        prices: [],
        areas: [],
        pricePerM2: [],
      };
    }
    analysis.byPortal[l.portal].count++;
    if (l.price) analysis.byPortal[l.portal].prices.push(l.price);
    if (l.area) analysis.byPortal[l.portal].areas.push(l.area);
    if (l.pricePerM2) analysis.byPortal[l.portal].pricePerM2.push(l.pricePerM2);
  });

  // Room breakdown
  listings.forEach(l => {
    const rooms = l.rooms || 'unknown';
    if (!analysis.byRooms[rooms]) {
      analysis.byRooms[rooms] = { count: 0, prices: [] };
    }
    analysis.byRooms[rooms].count++;
    if (l.price) analysis.byRooms[rooms].prices.push(l.price);
  });

  // Price stats
  const allPrices = listings.filter(l => l.price).map(l => l.price);
  if (allPrices.length > 0) {
    analysis.priceStats = calculateStats(allPrices);
  }

  // Area stats
  const allAreas = listings.filter(l => l.area).map(l => l.area);
  if (allAreas.length > 0) {
    analysis.areaStats = calculateStats(allAreas);
  }

  // Price per m² stats
  const allPricePerM2 = listings.filter(l => l.pricePerM2).map(l => l.pricePerM2);
  if (allPricePerM2.length > 0) {
    analysis.pricePerM2Stats = calculateStats(allPricePerM2);
  }

  return analysis;
}

function calculateStats(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  const avg = sum / sorted.length;
  const median = sorted[Math.floor(sorted.length / 2)];
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const stdDev = Math.sqrt(
    sorted.reduce((sq, n) => sq + Math.pow(n - avg, 2), 0) / sorted.length
  );

  return { min, max, avg, median, stdDev, count: sorted.length };
}

function formatAsMarkdown(analysis, listings) {
  let md = `# Market Analysis\n\n`;
  md += `**Analysis Period:** Last ${timeframeDays} days\n`;
  md += `**Generated:** ${new Date().toLocaleString('pl-PL')}\n\n`;

  // Summary
  md += `## Summary\n\n`;
  md += `- **Total Listings:** ${analysis.totalCount}\n`;
  md += `- **Price Range:** ${analysis.priceStats.min?.toLocaleString('pl-PL') || 'N/A'} – ${analysis.priceStats.max?.toLocaleString('pl-PL') || 'N/A'} PLN\n`;
  md += `- **Average Price:** ${Math.round(analysis.priceStats.avg || 0).toLocaleString('pl-PL')} PLN\n`;
  md += `- **Median Price:** ${Math.round(analysis.priceStats.median || 0).toLocaleString('pl-PL')} PLN\n`;
  md += `- **Average Area:** ${Math.round(analysis.areaStats.avg || 0)} m²\n`;
  md += `- **Average Price/m²:** ${Math.round(analysis.pricePerM2Stats.avg || 0).toLocaleString('pl-PL')} PLN/m²\n\n`;

  // By Portal
  md += `## By Portal\n\n`;
  Object.entries(analysis.byPortal).forEach(([portal, data]) => {
    md += `### ${portal.toUpperCase()}\n\n`;
    md += `- **Count:** ${data.count} listings\n`;
    if (data.prices.length > 0) {
      const stats = calculateStats(data.prices);
      md += `- **Price Range:** ${stats.min.toLocaleString('pl-PL')} – ${stats.max.toLocaleString('pl-PL')} PLN\n`;
      md += `- **Average Price:** ${Math.round(stats.avg).toLocaleString('pl-PL')} PLN\n`;
    }
    if (data.pricePerM2.length > 0) {
      const stats = calculateStats(data.pricePerM2);
      md += `- **Avg Price/m²:** ${Math.round(stats.avg).toLocaleString('pl-PL')} PLN\n`;
    }
    md += `\n`;
  });

  // By Rooms
  md += `## By Number of Rooms\n\n`;
  Object.entries(analysis.byRooms)
    .sort((a, b) => {
      const aNum = parseInt(a[0]);
      const bNum = parseInt(b[0]);
      return isNaN(aNum) ? 1 : isNaN(bNum) ? -1 : aNum - bNum;
    })
    .forEach(([rooms, data]) => {
      md += `- **${rooms}-room:** ${data.count} listings`;
      if (data.prices.length > 0) {
        const stats = calculateStats(data.prices);
        md += ` | Avg: ${Math.round(stats.avg).toLocaleString('pl-PL')} PLN`;
      }
      md += `\n`;
    });

  md += `\n`;

  // Market Insights
  md += `## Market Insights\n\n`;

  // Best value (lowest price/m²)
  if (listings.length > 0) {
    const bestValue = listings.filter(l => l.pricePerM2).sort((a, b) => a.pricePerM2 - b.pricePerM2)[0];
    if (bestValue) {
      md += `- **Best Value:** ${bestValue.portal.toUpperCase()} - ${bestValue.title} at ${Math.round(bestValue.pricePerM2).toLocaleString('pl-PL')} PLN/m²\n`;
    }

    // Most expensive
    const mostExpensive = listings.filter(l => l.price).sort((a, b) => b.price - a.price)[0];
    if (mostExpensive) {
      md += `- **Most Expensive:** ${mostExpensive.title} at ${mostExpensive.price.toLocaleString('pl-PL')} PLN\n`;
    }

    // Most affordable
    const mostAffordable = listings.filter(l => l.price).sort((a, b) => a.price - b.price)[0];
    if (mostAffordable) {
      md += `- **Most Affordable:** ${mostAffordable.title} at ${mostAffordable.price.toLocaleString('pl-PL')} PLN\n`;
    }
  }

  md += `\n`;

  return md;
}

function formatAsJSON(analysis) {
  console.log(JSON.stringify(analysis, null, 2));
}

function formatAsHTML(analysis, listings) {
  let html = `<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Market Analysis</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
    .container { max-width: 1200px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; }
    h1, h2 { color: #333; }
    .stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin: 15px 0; }
    .stat-card { background: #f9f9f9; padding: 15px; border-left: 4px solid #0066cc; border-radius: 4px; }
    .stat-label { font-size: 12px; color: #666; text-transform: uppercase; }
    .stat-value { font-size: 24px; font-weight: bold; color: #0066cc; }
    table { width: 100%; border-collapse: collapse; margin: 15px 0; }
    th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
    th { background: #f0f0f0; font-weight: bold; }
    .insight { background: #e8f4f8; padding: 12px; border-radius: 4px; margin: 10px 0; border-left: 4px solid #0099cc; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Poznań Real Estate Market Analysis</h1>
    <p><small>Generated: ${new Date().toLocaleString('pl-PL')}</small></p>
`;

  // Summary stats
  html += `<h2>Summary</h2>
  <div class="stat-grid">
    <div class="stat-card">
      <div class="stat-label">Total Listings</div>
      <div class="stat-value">${analysis.totalCount}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Average Price</div>
      <div class="stat-value">${Math.round(analysis.priceStats.avg || 0).toLocaleString('pl-PL')} PLN</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Median Price</div>
      <div class="stat-value">${Math.round(analysis.priceStats.median || 0).toLocaleString('pl-PL')} PLN</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Avg Price/m²</div>
      <div class="stat-value">${Math.round(analysis.pricePerM2Stats.avg || 0).toLocaleString('pl-PL')} PLN</div>
    </div>
  </div>`;

  // By Portal
  html += `<h2>By Portal</h2><table>
    <tr><th>Portal</th><th>Count</th><th>Avg Price</th><th>Price/m²</th></tr>`;

  Object.entries(analysis.byPortal).forEach(([portal, data]) => {
    const stats = calculateStats(data.prices);
    const pricePerM2 = calculateStats(data.pricePerM2);
    html += `<tr>
      <td><strong>${portal.toUpperCase()}</strong></td>
      <td>${data.count}</td>
      <td>${Math.round(stats.avg).toLocaleString('pl-PL')} PLN</td>
      <td>${Math.round(pricePerM2.avg).toLocaleString('pl-PL')} PLN</td>
    </tr>`;
  });

  html += `</table>`;

  // Insights
  html += `<h2>Market Insights</h2>`;
  if (listings.length > 0) {
    const bestValue = listings.filter(l => l.pricePerM2).sort((a, b) => a.pricePerM2 - b.pricePerM2)[0];
    if (bestValue) {
      html += `<div class="insight"><strong>Best Value:</strong> ${bestValue.title} (${Math.round(bestValue.pricePerM2).toLocaleString('pl-PL')} PLN/m²)</div>`;
    }
  }

  html += `</div></body></html>`;

  return html;
}

// Main function
(async () => {
  try {
    console.error(`📊 Analyzing market data...`);
    console.error(`Timeframe: Last ${timeframeDays} days`);
    console.error(`Filters:`, filters);
    console.error();

    const result = await api.searchListings(filters);
    const listings = Array.isArray(result) ? result : result.data || [];

    console.error(`✅ Retrieved ${listings.length} listings\n`);

    const analysis = analyzeData(listings);

    // Format output
    let output;
    switch (format.toLowerCase()) {
      case 'json':
        output = JSON.stringify(analysis, null, 2);
        break;
      case 'html':
        output = formatAsHTML(analysis, listings);
        break;
      case 'markdown':
      case 'md':
      default:
        output = formatAsMarkdown(analysis, listings);
    }

    // Output to console or file
    if (args.output) {
      const fs = require('fs');
      fs.writeFileSync(args.output, output);
      console.log(`✅ Analysis saved to: ${args.output}`);
    } else {
      console.log(output);
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.body) console.error('Details:', error.body);
    process.exit(1);
  }
})();
