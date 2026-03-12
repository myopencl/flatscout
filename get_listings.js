
const api = require('/home/ubuntu/.openclaw/workspace-flatscout/skills/flatscout-scraper-api/scripts/poznan-api.js');

async function getListingsForSearch() {
  try {
    const searchId = '30bc25bf-f9f4-479d-b23f-714b9d940f8a';
    const listings = await api.getSearchListings(searchId, { limit: 50 }); // Fetch up to 50 listings
    console.log(JSON.stringify(listings, null, 2));
  } catch (error) {
    console.error('Error fetching listings:', error.message);
  }
}

getListingsForSearch();
