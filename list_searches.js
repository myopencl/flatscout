
const api = require('/home/ubuntu/.openclaw/workspace-flatscout/skills/flatscout-scraper-api/scripts/poznan-api.js');

async function listAllSearches() {
  try {
    const searches = await api.listSearches();
    console.log(JSON.stringify(searches, null, 2));
  } catch (error) {
    console.error('Error listing searches:', error.message);
  }
}

listAllSearches();
