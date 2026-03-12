#!/usr/bin/env node

const api = require('./poznan-api');

const args = {};
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i].replace(/^--/, '');
  const value = process.argv[i + 1];
  if (value && !value.startsWith('--')) args[key] = isNaN(value) ? value : Number(value);
}

const filters = {
  minPrice: args.minPrice,
  maxPrice: args.maxPrice,
  minArea: args.minArea,
  maxArea: args.maxArea,
  status: 'active',
  limit: 1000,
};
Object.keys(filters).forEach(k => filters[k] === undefined && delete filters[k]);

const timeframeDays = args.timeframeDays || 7;
const analysisDate = new Date();
analysisDate.setDate(analysisDate.getDate() - timeframeDays);
filters.updatedSince = analysisDate.toISOString();

(async () => {
  try {
    const result = await api.searchListings(filters);
    const listings = Array.isArray(result) ? result : result.data || [];
    const prices = listings.map(l => l.price).filter(Boolean);
    const avgPrice = prices.length ? Math.round(prices.reduce((a,b)=>a+b,0)/prices.length) : 0;

    const output = {
      count: listings.length,
      avgPrice,
      timeframeDays
    };

    console.log(JSON.stringify(output, null, 2));
  } catch (error) {
    console.error('Error:', error.message);
    if (error.body) console.error('Details:', error.body);
    process.exit(1);
  }
})();
