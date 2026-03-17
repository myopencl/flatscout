#!/usr/bin/env node

/**
 * Score Listings Script
 * Calculates a score (0-100) for each listing based on:
 * 1. Distance to Fredry 9, Poznań (Teatr Wielki) - 50 points max
 * 2. Price per m² - 20 points max
 * 3. Building condition - 10 points max
 * 4. Monthly expenses (rent) - 20 points max
 * 
 * Writes scores to the API (PATCH /listings/:id/score)
 */

const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

const API_BASE = process.env.POZNAN_API_URL || 'http://localhost:3000';

// Teatr Wielki, Fredry 9, Poznań coordinates
const TARGET_LOCATION = {
  lat: 52.408417,
  lon: 16.924583
};

// Scoring thresholds
const DISTANCE = {
  maxPoints: 50,
  minDistance: 0,    // 0km = max points
  maxDistance: 3000  // 3km = 0 points
};

const PRICE_PER_M2 = {
  maxPoints: 20,
  minPrice: 9000,   // <9000 PLN/m² = max points
  maxPrice: 13000   // >13000 PLN/m² = 0 points
};

const CONDITION = {
  maxPoints: 10,
  // Values: 'ready_to_use', 'to_completion', 'under_construction'
  // Map to scores
  scores: {
    'ready_to_use': 10,      // Nuevo/listo para habitar
    'to_completion': 5,      // Usado/para terminar
    'under_construction': 0, // A reformar
    'default': 5             // Unknown = usado
  }
};

const EXPENSES = {
  maxPoints: 20,
  minExpense: 800,   // <800 PLN = max points
  maxExpense: 1000   // >1000 PLN = 0 points
};

/**
 * Calculate distance between two points using Haversine formula
 * @returns distance in meters
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth radius in meters
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c;
}

/**
 * Linear interpolation for scoring
 * @param value - actual value
 * @param min - value for max points (better)
 * @param max - value for min points (worse)
 * @param maxPoints - maximum points possible
 * @returns points (0 to maxPoints)
 */
function interpolateScore(value, min, max, maxPoints) {
  if (value <= min) return maxPoints;
  if (value >= max) return 0;
  
  // Linear interpolation: max points at min, 0 at max
  const ratio = (max - value) / (max - min);
  return Math.round(ratio * maxPoints);
}

/**
 * Calculate score for a single listing
 */
function calculateScore(listing) {
  const breakdown = {
    distance: { value: null, points: 0, maxPoints: DISTANCE.maxPoints },
    pricePerM2: { value: null, points: 0, maxPoints: PRICE_PER_M2.maxPoints },
    condition: { value: null, points: 0, maxPoints: CONDITION.maxPoints },
    expenses: { value: null, points: 0, maxPoints: EXPENSES.maxPoints },
    total: 0
  };

  // 1. Distance score (50 points)
  if (listing.lat && listing.lon) {
    const distance = haversineDistance(
      TARGET_LOCATION.lat, TARGET_LOCATION.lon,
      listing.lat, listing.lon
    );
    breakdown.distance.value = Math.round(distance);
    breakdown.distance.points = interpolateScore(
      distance,
      DISTANCE.minDistance,
      DISTANCE.maxDistance,
      DISTANCE.maxPoints
    );
  }

  // 2. Price per m² score (20 points)
  if (listing.price && listing.areaM2 && listing.areaM2 > 0) {
    const pricePerM2 = Math.round(listing.price / listing.areaM2);
    breakdown.pricePerM2.value = pricePerM2;
    breakdown.pricePerM2.points = interpolateScore(
      pricePerM2,
      PRICE_PER_M2.minPrice,
      PRICE_PER_M2.maxPrice,
      PRICE_PER_M2.maxPoints
    );
  }

  // 3. Condition score (10 points)
  // Extract from featuresJson or rawDetailsJson
  let conditionKey = 'default';
  
  if (listing.featuresJson && Array.isArray(listing.featuresJson)) {
    const features = listing.featuresJson;
    if (features.some(f => f.includes('construction_status: do zamieszkania'))) {
      conditionKey = 'ready_to_use';
    } else if (features.some(f => f.includes('construction_status:'))) {
      conditionKey = 'to_completion';
    }
  }
  
  if (listing.rawDetailsJson?.property?.condition) {
    const cond = listing.rawDetailsJson.property.condition;
    if (cond === 'READY_TO_USE') conditionKey = 'ready_to_use';
    else if (cond === 'TO_COMPLETION') conditionKey = 'to_completion';
    else if (cond === 'UNDER_CONSTRUCTION') conditionKey = 'under_construction';
  }
  
  breakdown.condition.value = conditionKey;
  breakdown.condition.points = CONDITION.scores[conditionKey] || CONDITION.scores.default;

  // 4. Expenses score (20 points)
  // Look for rent/czynsz in various places
  let expenses = null;
  
  if (listing.featuresJson && Array.isArray(listing.featuresJson)) {
    const rentFeature = listing.featuresJson.find(f => f.includes('rent:'));
    if (rentFeature) {
      const match = rentFeature.match(/rent:\s*(\d+)/);
      if (match) expenses = parseInt(match[1]);
    }
  }
  
  if (!expenses && listing.rawDetailsJson?.property?.rent?.value) {
    expenses = listing.rawDetailsJson.property.rent.value;
  }
  
  if (expenses !== null) {
    breakdown.expenses.value = expenses;
    breakdown.expenses.points = interpolateScore(
      expenses,
      EXPENSES.minExpense,
      EXPENSES.maxExpense,
      EXPENSES.maxPoints
    );
  }

  // Total
  breakdown.total = 
    breakdown.distance.points +
    breakdown.pricePerM2.points +
    breakdown.condition.points +
    breakdown.expenses.points;

  return breakdown;
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const limit = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1]) || 100;
  const minScore = parseInt(args.find(a => a.startsWith('--min-score='))?.split('=')[1]) || 0;
  const jsonOutput = args.includes('--json');
  const updateAll = args.includes('--all');
  
  // Use the API client
  const api = require('./poznan-api');
  
  console.log('=== FlatScout Scoring Script ===\n');
  console.log(`Target: Fredry 9, Poznań (${TARGET_LOCATION.lat}, ${TARGET_LOCATION.lon})`);
  console.log(`Scoring criteria:`);
  console.log(`  - Distance: 0-3km → 0-50 pts (closer = better)`);
  console.log(`  - Price/m²: <9000 = 20pts, >13000 = 0pts`);
  console.log(`  - Condition: new=10, used=5, reform=0 pts`);
  console.log(`  - Expenses: <800=20pts, >1000=0pts`);
  console.log(`\nMode: ${dryRun ? 'DRY RUN (no updates)' : 'LIVE (will update scores)'}`);
  console.log(`Limit: ${limit} listings\n`);
  
  try {
    // Fetch listings
    console.log('Fetching listings from API...');
    const response = await api.searchListings({ limit, status: 'active' });
    const listings = response.data || [];
    
    console.log(`Found ${listings.length} active listings\n`);
    
    let updated = 0;
    let skipped = 0;
    const scores = [];
    
    for (const listing of listings) {
      const score = calculateScore(listing);
      
      scores.push({
        id: listing.id,
        title: listing.title?.substring(0, 50),
        neighborhood: listing.neighborhood,
        price: listing.price,
        areaM2: listing.areaM2,
        total: score.total,
        breakdown: score
      });
    }
    
    // Update scores via API if not dry-run
    if (!dryRun && scores.length > 0) {
      console.log('\nWriting scores to API...');
      
      for (const s of scores) {
        try {
          const res = await fetch(`${API_BASE}/api/v1/listings/${s.id}/score`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ score: s.total })
          });
          
          if (!res.ok) {
            console.error(`\nError updating ${s.id}: ${res.status} ${res.statusText}`);
            skipped++;
            continue;
          }
          
          updated++;
          process.stdout.write(`\rUpdated ${updated}/${scores.length} scores...`);
        } catch (e) {
          console.error(`\nError updating ${s.id}: ${e.message}`);
          skipped++;
        }
      }
      
      console.log(`\n✅ Updated ${updated} scores via API`);
    }
    
    console.log(`\n\n=== Results ===`);
    console.log(`Total listings processed: ${listings.length}`);
    if (!dryRun) {
      console.log(`Updated: ${updated}`);
      console.log(`Skipped (errors): ${skipped}`);
    }
    
    // Top 10 by score
    scores.sort((a, b) => b.total - a.total);
    
    // Filter by minScore if specified
    const filtered = scores.filter(s => s.total >= minScore);
    
    if (jsonOutput) {
      // Output only filtered listings as JSON for agent consumption
      console.log(JSON.stringify(filtered, null, 2));
      return;
    }
    
    console.log(`\n=== Top 10 by Score ===`);
    console.log('Rank | Score | Title | Neighborhood | Price | m²');
    console.log('-'.repeat(80));
    scores.slice(0, 10).forEach((s, i) => {
      console.log(`${(i+1).toString().padStart(4)} | ${s.total.toString().padStart(5)} | ${(s.title || '').substring(0,30).padEnd(30)} | ${(s.neighborhood || 'N/A').padEnd(15)} | ${s.price?.toLocaleString().padStart(10)} | ${s.areaM2}`);
    });
    
    if (minScore > 0) {
      console.log(`\n=== Listings with Score >= ${minScore} (${filtered.length} found) ===`);
      filtered.forEach((s, i) => {
        console.log(`${i+1}. [${s.total}pts] ${s.title} - ${s.neighborhood} - ${s.price?.toLocaleString()} PLN - ${s.areaM2}m² - ${s.id}`);
      });
    }
    
    // Score distribution
    const distribution = { '90-100': 0, '80-89': 0, '70-79': 0, '60-69': 0, '50-59': 0, '40-49': 0, '0-39': 0 };
    scores.forEach(s => {
      if (s.total >= 90) distribution['90-100']++;
      else if (s.total >= 80) distribution['80-89']++;
      else if (s.total >= 70) distribution['70-79']++;
      else if (s.total >= 60) distribution['60-69']++;
      else if (s.total >= 50) distribution['50-59']++;
      else if (s.total >= 40) distribution['40-49']++;
      else distribution['0-39']++;
    });
    
    console.log(`\n=== Score Distribution ===`);
    Object.entries(distribution).forEach(([range, count]) => {
      const bar = '█'.repeat(Math.round(count / Math.max(...Object.values(distribution)) * 20));
      console.log(`${range}: ${bar} (${count})`);
    });
    
    // Save scores to file (for map script to read)
    const outputPath = path.join(__dirname, '..', '..', 'scores.json');
    fs.writeFileSync(outputPath, JSON.stringify({
      scoredAt: new Date().toISOString(),
      target: TARGET_LOCATION,
      criteria: { DISTANCE, PRICE_PER_M2, CONDITION, EXPENSES },
      total: scores.length,
      distribution,
      listings: scores
    }, null, 2));
    console.log(`\nScores saved to: ${outputPath}`);
    
  } catch (error) {
    console.error('Error:', error.message);
    if (error.body) console.error('Details:', error.body);
    process.exit(1);
  }
}

main();