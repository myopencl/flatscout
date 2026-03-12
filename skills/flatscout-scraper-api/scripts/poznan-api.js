#!/usr/bin/env node

/**
 * Poznań Scraper API Client (Updated)
 * Low-level HTTP client for all API endpoints including new searches CRUD and listing state management
 */

const fetch = require('node-fetch');

const BASE_URL = process.env.POZNAN_API_URL || 'http://localhost:3000';

class PoznanAPI {
  constructor(baseUrl = BASE_URL) {
    this.baseUrl = baseUrl;
    this.timeout = 30000;
  }

  async get(endpoint, params = {}) {
    const url = new URL(endpoint, this.baseUrl);
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.append(key, String(value));
      }
    });
    return this._fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });
  }

  async post(endpoint, body = {}) {
    return this._fetch(new URL(endpoint, this.baseUrl).toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(body)
    });
  }

  async patch(endpoint, body = {}) {
    return this._fetch(new URL(endpoint, this.baseUrl).toString(), {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(body)
    });
  }

  async delete(endpoint, params = {}) {
    const url = new URL(endpoint, this.baseUrl);
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.append(key, String(value));
      }
    });

    return this._fetch(url.toString(), {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });
  }

  async _fetch(url, options) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const error = new Error(`API Error ${response.status}: ${response.statusText}`);
        error.status = response.status;
        error.endpoint = url;

        try {
          error.body = await response.json();
        } catch (e) {
          error.body = await response.text();
        }

        throw error;
      }

      return await response.json();
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error(`Request timeout after ${this.timeout}ms: ${url}`);
      }
      throw error;
    }
  }

  // ===== Health =====
  async health() { return this.get('/health'); }

  // ===== Listings =====
  async searchListings(filters = {}) { return this.get('/api/v1/listings', filters); }
  async getListing(listingId) { return this.get(`/api/v1/listings/${listingId}`); }
  async getListingEvents(listingId) { return this.get(`/api/v1/listings/${listingId}/events`); }
  async getPotentialDuplicates(listingId) { return this.get(`/api/v1/listings/${listingId}/potential-duplicates`); }
  async getListingState(listingId) { return this.get(`/api/v1/listings/${listingId}/state`); }
  async updateListingState(listingId, stateUpdate) { return this.patch(`/api/v1/listings/${listingId}/state`, stateUpdate); }
  async deleteListing(listingId) { return this.delete(`/api/v1/listings/${listingId}`); }
  async bulkDeleteListings(criteria) { return this.post('/api/v1/listings/bulk-delete', criteria); }

  // ===== Searches (New) =====
  async createSearch(input) { return this.post('/api/v1/searches', input); }
  async listSearches(options = {}) { return this.get('/api/v1/searches', options); }
  async getSearch(searchId) { return this.get(`/api/v1/searches/${searchId}`); }
  async updateSearch(searchId, updates) { return this.patch(`/api/v1/searches/${searchId}`, updates); }
  async deleteSearch(searchId, cascadeDeleteListings = false) {
    return this.delete(`/api/v1/searches/${searchId}`, {
      cascadeListings: cascadeDeleteListings ? 'true' : 'false'
    });
  }
  async duplicateSearch(searchId, newName) { return this.post(`/api/v1/searches/${searchId}/duplicate`, { name: newName }); }
  async runSearchNow(searchId) { return this.post(`/api/v1/searches/${searchId}/run-now`, {}); }
  async getSearchListings(searchId, options = {}) { return this.get(`/api/v1/searches/${searchId}/listings`, options); }
  async getSearchStats(searchId) { return this.get(`/api/v1/searches/${searchId}/stats`); }

  // ===== Stats =====
  async getListingsByStatus() { return this.get('/api/v1/stats/listings-by-status'); }
  async getSearchesSummary() { return this.get('/api/v1/stats/searches-summary'); }
  async getActivityTimeline(days = 30) { return this.get('/api/v1/stats/activity-timeline', { days }); }
  async getOverviewStats() { return this.get('/api/v1/stats/overview'); }

  // ===== Legacy compatibility (older saved-searches routes) =====
  async listSavedSearches(options = {}) { return this.get('/api/v1/saved-searches', options); }
  async getSavedSearch(searchId) { return this.get(`/api/v1/saved-searches/${searchId}`); }
  async createSavedSearch(config) { return this.post('/api/v1/saved-searches', config); }
  async runSavedSearch(searchId) { return this.post(`/api/v1/saved-searches/${searchId}/run`); }
  async getSavedSearchListings(searchId, options = {}) { return this.get(`/api/v1/saved-searches/${searchId}/listings`, options); }
  async getSavedSearchChanges(searchId, since) { return this.get(`/api/v1/saved-searches/${searchId}/changes`, { since }); }
}

module.exports = new PoznanAPI();

if (require.main === module) {
  const command = process.argv[2];
  const endpoint = process.argv[3];

  if (!command || !endpoint) {
    console.error('Usage: node poznan-api.js <get|post|patch|delete> <endpoint> [--params ...]');
    process.exit(1);
  }

  (async () => {
    try {
      const params = {};
      for (let i = 4; i < process.argv.length; i += 2) {
        const key = process.argv[i].replace(/^--/, '');
        const value = process.argv[i + 1];
        if (value && !value.startsWith('--')) params[key] = isNaN(value) ? value : Number(value);
      }

      let result;
      if (command === 'get') result = await module.exports.get(endpoint, params);
      else if (command === 'post') result = await module.exports.post(endpoint, params);
      else if (command === 'patch') result = await module.exports.patch(endpoint, params);
      else if (command === 'delete') result = await module.exports.delete(endpoint, params);
      else throw new Error(`Unknown command: ${command}`);

      console.log(JSON.stringify(result, null, 2));
    } catch (error) {
      console.error('Error:', error.message);
      if (error.body) console.error('Details:', error.body);
      process.exit(1);
    }
  })();
}
