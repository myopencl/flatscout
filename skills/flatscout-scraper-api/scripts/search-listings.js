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
  rooms: args.rooms,
  source: args.source || args.portal,
  status: args.status,
  updatedSince: args.updatedSince,
  page: args.page || 1,
  limit: args.limit || 50,
};
Object.keys(filters).forEach(k => filters[k] === undefined && delete filters[k]);

const outputFormat = args.output || 'json';

function formatAsJSON(listings) { console.log(JSON.stringify(listings, null, 2)); }

(async () => {
  try {
    const result = await api.searchListings(filters);
    const listings = Array.isArray(result) ? result : result.data || [];

    if (outputFormat.toLowerCase() === 'json') {
      formatAsJSON(listings);
      return;
    }

    formatAsJSON(listings);
  } catch (error) {
    console.error('Error:', error.message);
    if (error.body) console.error('Details:', error.body);
    process.exit(1);
  }
})();
