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

  /**
   * Make a GET request
   * @param {string} endpoint - API endpoint (e.g., /api/v1/listings)
   * @param {object} params - Query parameters
   * @returns {Promise<object>} API response
   */
  async get(endpoint, params = {}) {
    const url = new URL(endpoint, this.baseUrl);

    // Add query parameters
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.append(key, String(value));
      }
    });

    return this._fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });
  }

  /**
   * Make a POST request
   * @param {string} endpoint - API endpoint
   * @param {object} body - Request body
   * @returns {Promise<object>} API response
   */
  async post(endpoint, body = {}) {
    return this._fetch(new URL(endpoint, this.baseUrl).toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(body),
    });
  }

  /**
   * Make a PATCH request
   * @param {string} endpoint - API endpoint
   * @param {object} body - Request body
   * @returns {Promise<object>} API response
   */
  async patch(endpoint, body = {}) {
    return this._fetch(new URL(endpoint, this.baseUrl).toString(), {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(body),
    });
  }

  /**
   * Make a DELETE request
   * @param {string} endpoint - API endpoint
   * @param {object} params - Query parameters
   * @returns {Promise<object>} API response
   */
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
        'Accept': 'application/json',
      },
    });
  }

  /**
   * Internal fetch wrapper with error handling
   */
  async _fetch(url, options) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
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

  /**
   * Check API health
   */
  async health() {
    return this.get('/health');
  }

  // ===== Listings =====

  /**
   * Search listings with filters
   * @param {object} filters - Search filters
   * @returns {Promise<object>} { data: Listing[], total: number, page: number }
   */
  async searchListings(filters = {}) {
    return this.get('/api/v1/listings', filters);
  }

  /**
   * Get listing details
   * @param {string} listingId - Listing UUID
   * @returns {Promise<object>} Listing object with userState
   */
  async getListing(listingId) {
    return this.get(`/api/v1/listings/${listingId}`);
  }

  /**
   * Get listing change history
   * @param {string} listingId - Listing UUID
   * @returns {Promise<array>} Array of change events
   */
  async getListingEvents(listingId) {
    return this.get(`/api/v1/listings/${listingId}/events`);
  }

  /**
   * Find potential duplicates of a listing across portals
   * @param {string} listingId - Listing UUID
   * @returns {Promise<array>} Array of duplicate listings
   */
  async getPotentialDuplicates(listingId) {
    return this.get(`/api/v1/listings/${listingId}/potential-duplicates`);
  }

  /**
   * Get listing state (status, comments, rating, etc.)
   * @param {string} listingId - Listing UUID
   * @returns {Promise<object>} ListingUserState
   */
  async getListingState(listingId) {
    return this.get(`/api/v1/listings/${listingId}/state`);
  }

  /**
   * Update listing state (status, comments, visitDate, rating, pros, cons)
   * @param {string} listingId - Listing UUID
   * @param {object} stateUpdate - State updates
   * @returns {Promise<object>} Updated ListingUserState
   */
  async updateListingState(listingId, stateUpdate) {
    return this.patch(`/api/v1/listings/${listingId}/state`, stateUpdate);
  }

  /**
   * Delete a single listing (only FOUND status allowed)
   * @param {string} listingId - Listing UUID
   * @returns {Promise<object>} { success: true }
   */
  async deleteListing(listingId) {
    return this.delete(`/api/v1/listings/${listingId}`);
  }

  /**
   * Bulk delete listings by criteria (only FOUND status allowed)
   * @param {object} criteria - Delete criteria
   * @returns {Promise<object>} { deletedCount, details }
   */
  async bulkDeleteListings(criteria) {
    return this.post('/api/v1/listings/bulk-delete', criteria);
  }

  // ===== Searches (New) =====

  /**
   * Create a new saved search
   * @param {object} input - Search configuration
   * @returns {Promise<object>} Created SavedSearch
   */
  async createSearch(input) {
    return this.post('/api/v1/searches', input);
  }

  /**
   * List all saved searches
   * @param {object} options - Pagination options { page, limit, portal, enabled }
   * @returns {Promise<object>} { data: SavedSearch[], total: number }
   */
  async listSearches(options = {}) {
    return this.get('/api/v1/searches', options);
  }

  /**
   * Get saved search details with listing count
   * @param {string} searchId - Search UUID
   * @returns {Promise<object>} SavedSearch with matchCount
   */
  async getSearch(searchId) {
    return this.get(`/api/v1/searches/${searchId}`);
  }

  /**
   * Update a saved search
   * @param {string} searchId - Search UUID
   * @param {object} updates - Fields to update
   * @returns {Promise<object>} Updated SavedSearch
   */
  async updateSearch(searchId, updates) {
    return this.patch(`/api/v1/searches/${searchId}`, updates);
  }

  /**
   * Delete a saved search
   * @param {string} searchId - Search UUID
   * @param {boolean} cascadeDeleteListings - Delete orphaned listings
   * @returns {Promise<object>} { success: true }
   */
  async deleteSearch(searchId, cascadeDeleteListings = false) {
    return this.delete(`/api/v1/searches/${searchId}`, {
      cascadeListings: cascadeDeleteListings ? 'true' : 'false'
    });
  }

  /**
   * Duplicate a saved search
   * @param {string} searchId - Search UUID
   * @param {string} newName - Name for the copy
   * @returns {Promise<object>} Created SavedSearch (copy)
   */
  async duplicateSearch(searchId, newName) {
    return this.post(`/api/v1/searches/${searchId}/duplicate`, { name: newName });
  }

  /**
   * Manually trigger a search run
   * @param {string} searchId - Search UUID
   * @returns {Promise<object>} { status, message }
   */
  async runSearchNow(searchId) {
    return this.post(`/api/v1/searches/${searchId}/run-now`, {});
  }

  /**
   * Get listings from a specific search
   * @param {string} searchId - Search UUID
   * @param {object} options - Filter/pagination options
   * @returns {Promise<object>} { data: Listing[], total: number, pagination }
   */
  async getSearchListings(searchId, options = {}) {
    return this.get(`/api/v1/searches/${searchId}/listings`, options);
  }

  /**
   * Get statistics for a search
   * @param {string} searchId - Search UUID
   * @returns {Promise<object>} Stats with counts per listing status
   */
  async getSearchStats(searchId) {
    return this.get(`/api/v1/searches/${searchId}/stats`);
  }

  // ===== Stats (New) =====

  /**
   * Get count of listings by status
   * @returns {Promise<object>} { FOUND, SEEN, VISIT_PENDING, VISITED, FINALIST, DISCARDED, NO_STATE }
   */
  async getListingsByStatus() {
    return this.get('/api/v1/stats/listings-by-status');
  }

  /**
   * Get summary of all searches with stats
   * @returns {Promise<object>} Array of searches with per-status listing counts
   */
  async getSearchesSummary() {
    return this.get('/api/v1/stats/searches-summary');
  }

  /**
   * Get activity timeline
   * @param {number} days - Number of days to analyze (default: 30)
   * @returns {Promise<object>} Events grouped by day
   */
  async getActivityTimeline(days = 30) {
    return this.get('/api/v1/stats/activity-timeline', { days });
  }

  /**
   * Get overall statistics
   * @returns {Promise<object>} Global stats summary
   */
  async getOverviewStats() {
    return this.get('/api/v1/stats/overview');
  }
}

module.exports = new PoznanAPI();

// CLI support
if (require.main === module) {
  const command = process.argv[2];
  const endpoint = process.argv[3];

  if (!command || !endpoint) {
    console.error('Usage: node poznan-api.js <get|post|patch|delete> <endpoint> [--params ...]');
    console.error('Example: node poznan-api.js get /api/v1/listings --rooms 3 --minPrice 400000');
    process.exit(1);
  }

  (async () => {
    try {
      const params = {};
      for (let i = 4; i < process.argv.length; i += 2) {
        const key = process.argv[i].replace(/^--/, '');
        const value = process.argv[i + 1];
        if (value && !value.startsWith('--')) {
          params[key] = isNaN(value) ? value : Number(value);
        }
      }

      let result;
      if (command === 'get') {
        result = await module.exports.get(endpoint, params);
      } else if (command === 'post') {
        result = await module.exports.post(endpoint, params);
      } else if (command === 'patch') {
        result = await module.exports.patch(endpoint, params);
      } else if (command === 'delete') {
        result = await module.exports.delete(endpoint, params);
      } else {
        throw new Error(`Unknown command: ${command}`);
      }

      console.log(JSON.stringify(result, null, 2));
    } catch (error) {
      console.error('Error:', error.message);
      if (error.body) console.error('Details:', error.body);
      process.exit(1);
    }
  })();
}
